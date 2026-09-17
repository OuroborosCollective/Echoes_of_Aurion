import { eq, and, isNull, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { aurionCrossZoneTransfers } from "../../drizzle/aurionCausalitySchema";
import { CanonicalTransferPayload } from "./zoneCanonicalState";
import { createHash } from "node:crypto";
import { operationalDate } from "../../shared/operationalClock";

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
   * Marks only the explicitly supplied transfers as consumed by a target tick.
   * The operational timestamp is side-channel evidence and never gameplay time.
   */
  async consumeTransfers(transferIds: string[], targetTick: number): Promise<void> {
    if (transferIds.length === 0) return;
    const db = await getDb();
    if (!db) return;

    const consumedAt = operationalDate();
    await db.update(aurionCrossZoneTransfers)
      .set({
        status: "CONSUMED",
        targetTick,
        consumedAt,
      })
      .where(and(
        isNull(aurionCrossZoneTransfers.consumedAt),
        inArray(aurionCrossZoneTransfers.id, transferIds)
      ));
  }
}

export const globalCrossZoneSyncService = new AurionCrossZoneSynchronizationService();
