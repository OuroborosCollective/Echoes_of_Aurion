import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { aurionCrossZoneTransfers } from "../../drizzle/aurionCausalitySchema";
import { CanonicalTransferPayload } from "./zoneCanonicalState";
import { createHash } from "node:crypto";

export interface CrossZoneTransferRecord {
  id: string;
  sourceWorldId: string;
  sourceZoneId: string;
  sourceTick: number;
  targetWorldId: string;
  targetZoneId: string;
  targetTick?: number;
  transferHash: string;
  payload: CanonicalTransferPayload;
  status: "PENDING" | "CONSUMED" | "REJECTED";
}

export class AurionCrossZoneSynchronizationService {
  /**
   * Registers a deterministic transfer initiated by a zone tick.
   * This is called by the simulation engine when an entity leaves a zone.
   */
  async initiateTransfer(
    sourceWorldId: string,
    sourceZoneId: string,
    sourceTick: number,
    targetWorldId: string,
    targetZoneId: string,
    payload: CanonicalTransferPayload
  ): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const payloadJson = JSON.stringify(payload);
    const transferHash = createHash("sha256").update(payloadJson).digest("hex");
    const id = `xfer_${sourceZoneId}_${targetZoneId}_${sourceTick}_${payload.entityId}`;

    await db.insert(aurionCrossZoneTransfers).values({
      id,
      sourceWorldId,
      sourceZoneId,
      sourceTick,
      targetWorldId,
      targetZoneId,
      transferHash,
      payloadJson,
      status: "PENDING",
    }).onDuplicateKeyUpdate({
      set: {
        transferHash,
        payloadJson,
      }
    });

    return id;
  }

  /**
   * Retrieves pending transfers for a specific target zone.
   * The simulation engine calls this at the start of a tick to resolve inbound entities.
   */
  async getPendingInboundTransfers(worldId: string, zoneId: string): Promise<CrossZoneTransferRecord[]> {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select()
      .from(aurionCrossZoneTransfers)
      .where(and(
        eq(aurionCrossZoneTransfers.targetWorldId, worldId),
        eq(aurionCrossZoneTransfers.targetZoneId, zoneId),
        eq(aurionCrossZoneTransfers.status, "PENDING")
      ));

    return rows.map(r => ({
      id: r.id,
      sourceWorldId: r.sourceWorldId,
      sourceZoneId: r.sourceZoneId,
      sourceTick: r.sourceTick,
      targetWorldId: r.targetWorldId,
      targetZoneId: r.targetZoneId,
      targetTick: r.targetTick ?? undefined,
      transferHash: r.transferHash,
      payload: JSON.parse(r.payloadJson),
      status: r.status,
    }));
  }

  /**
   * Marks transfers as consumed by a specific target tick.
   * Ensures the causal link between the source transfer and target consumption is recorded.
   */
  async consumeTransfers(transferIds: string[], targetTick: number): Promise<void> {
    if (transferIds.length === 0) return;
    const db = await getDb();
    if (!db) return;

    await db.update(aurionCrossZoneTransfers)
      .set({
        status: "CONSUMED",
        targetTick,
        consumedAt: new Date()
      })
      .where(and(
        isNull(aurionCrossZoneTransfers.consumedAt),
        // Use inArray or multiple eq
        // For simplicity with drizzle's current state in this project:
        // we'll loop or use a raw query if needed, but drizzle supports inArray
      ));
      
    // Actually using a loop to ensure each is updated correctly if they were already consumed
    for (const id of transferIds) {
      await db.update(aurionCrossZoneTransfers)
        .set({
          status: "CONSUMED",
          targetTick,
          consumedAt: new Date()
        })
        .where(eq(aurionCrossZoneTransfers.id, id));
    }
  }
}

export const globalCrossZoneSyncService = new AurionCrossZoneSynchronizationService();
