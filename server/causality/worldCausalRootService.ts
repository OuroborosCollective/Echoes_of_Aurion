import { and, eq, gte, lte } from "drizzle-orm";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import {
  AURION_WORLD_CAUSAL_ZONE_IDS,
  computeWorldCausalRoot,
  computeZoneEpochRoot,
  verifyWorldCausalRoot,
  type AurionWorldCausalRoot,
  type AurionWorldCausalRootResult,
  type AurionZoneReceiptReference,
} from "../../shared/aurionWorldCausalRootContract";
import { getDb } from "../db";

export type WorldCausalRootReplayVerdict =
  | Readonly<{ status: "MATCH"; worldRootHash: string; epoch: number }>
  | Readonly<{ status: "FIRST_DIVERGENCE"; expectedHash: string; observedHash: string; epoch: number }>
  | Readonly<{ status: "UNPROVABLE"; reason: string; epoch: number }>;

function parsePersistedResult(value: string): AurionWorldCausalRootResult | null {
  try {
    const parsed = JSON.parse(value) as AurionWorldCausalRootResult;
    return parsed?.schema === "aurion.world.causal-root-result.v1" ? parsed : null;
  } catch {
    return null;
  }
}

function receiptReference(row: typeof aurionCausalTickReceipts.$inferSelect): AurionZoneReceiptReference {
  return {
    worldId: row.worldId,
    zoneId: row.zoneId,
    tick: row.tick,
    sourceRevision: row.revision,
    rulesetVersion: row.rulesetVersion,
    previousReceiptHash: row.previousReceiptHash,
    receiptHash: row.receiptHash,
  };
}

export class AurionWorldCausalRootService {
  async read(worldId: string, epoch: number): Promise<AurionWorldCausalRootResult | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(aurionGlobalStateProofs).where(and(
      eq(aurionGlobalStateProofs.worldId, worldId),
      eq(aurionGlobalStateProofs.epoch, epoch),
    )).limit(1);
    if (!row) return null;
    return parsePersistedResult(row.globalProofJson);
  }

  async replay(worldId: string, epoch: number): Promise<WorldCausalRootReplayVerdict> {
    const persisted = await this.read(worldId, epoch);
    if (!persisted) return Object.freeze({ status: "UNPROVABLE", reason: "WORLD_ROOT_EVIDENCE_MISSING", epoch });
    if (persisted.status !== "VERIFIED" || !persisted.root) {
      return Object.freeze({ status: "UNPROVABLE", reason: persisted.reason ?? "WORLD_ROOT_UNPROVABLE", epoch });
    }
    if (!verifyWorldCausalRoot(persisted.root)) {
      return Object.freeze({ status: "FIRST_DIVERGENCE", expectedHash: persisted.root.worldRootHash, observedHash: "INVALID_STORED_ROOT", epoch });
    }

    const db = await getDb();
    if (!db) return Object.freeze({ status: "UNPROVABLE", reason: "DATABASE_UNAVAILABLE", epoch });
    const recomputedZoneRoots = [];
    for (const zoneRoot of persisted.root.zoneRoots) {
      const rows = await db.select().from(aurionCausalTickReceipts).where(and(
        eq(aurionCausalTickReceipts.worldId, worldId),
        eq(aurionCausalTickReceipts.zoneId, zoneRoot.zoneId),
        gte(aurionCausalTickReceipts.tick, zoneRoot.fromTick),
        lte(aurionCausalTickReceipts.tick, zoneRoot.toTick),
      )).orderBy(aurionCausalTickReceipts.tick);
      if (rows.length !== zoneRoot.toTick - zoneRoot.fromTick + 1) {
        return Object.freeze({ status: "UNPROVABLE", reason: `ZONE_RECEIPT_RANGE_INCOMPLETE:${zoneRoot.zoneId}`, epoch });
      }
      try {
        recomputedZoneRoots.push(computeZoneEpochRoot(rows.map(receiptReference)));
      } catch (error) {
        return Object.freeze({ status: "UNPROVABLE", reason: error instanceof Error ? error.message : String(error), epoch });
      }
    }

    const recomputed = computeWorldCausalRoot({
      worldId,
      epoch,
      sourceRevision: persisted.root.sourceRevision,
      rulesetVersion: persisted.root.rulesetVersion,
      expectedZoneIds: AURION_WORLD_CAUSAL_ZONE_IDS,
      zoneRoots: recomputedZoneRoots,
      previousWorldRoot: persisted.root.previousWorldRoot,
      previousWorldRootProvable: true,
    });
    if (recomputed.status !== "VERIFIED" || !recomputed.root) {
      return Object.freeze({ status: "UNPROVABLE", reason: recomputed.reason ?? "RECOMPUTE_UNPROVABLE", epoch });
    }
    if (recomputed.root.worldRootHash !== persisted.root.worldRootHash) {
      return Object.freeze({
        status: "FIRST_DIVERGENCE",
        expectedHash: persisted.root.worldRootHash,
        observedHash: recomputed.root.worldRootHash,
        epoch,
      });
    }
    return Object.freeze({ status: "MATCH", worldRootHash: recomputed.root.worldRootHash, epoch });
  }
}

export const worldCausalRootService = new AurionWorldCausalRootService();
