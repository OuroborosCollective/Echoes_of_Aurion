import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { aurionCausalCheckpoints } from "../../drizzle/aurionCausalitySchema";

export type CausalRecoveryPlan = Readonly<{
  protocol: "aurion.recovery.plan.v1";
  zoneId: string;
  status: "AVAILABLE" | "UNPROVABLE";
  checkpointId: string | null;
  checkpointTick: number | null;
  snapshotHash: string | null;
  mutationAuthority: "none";
  reason?: string;
}>;

/**
 * Recovery is deliberately separated from verification. This service may propose
 * an immutable, reconciled checkpoint but cannot mutate live gameplay or database
 * truth. A future typed control-plane action must obtain explicit human consent
 * and emit a compensating/branch receipt before any restore can occur.
 */
export class AurionCausalRecoveryService {
  async planRecovery(zoneId: string): Promise<CausalRecoveryPlan> {
    const db = await getDb();
    if (!db) return Object.freeze({ protocol: "aurion.recovery.plan.v1", zoneId, status: "UNPROVABLE", checkpointId: null, checkpointTick: null, snapshotHash: null, mutationAuthority: "none", reason: "DATABASE_UNAVAILABLE" });
    const checkpoints = await db.select().from(aurionCausalCheckpoints)
      .where(eq(aurionCausalCheckpoints.zoneId, zoneId))
      .orderBy(desc(aurionCausalCheckpoints.tick)).limit(20);
    const lastGood = checkpoints.find(checkpoint => checkpoint.reconciled === 1);
    if (!lastGood) return Object.freeze({ protocol: "aurion.recovery.plan.v1", zoneId, status: "UNPROVABLE", checkpointId: null, checkpointTick: null, snapshotHash: null, mutationAuthority: "none", reason: "NO_RECONCILED_CHECKPOINT" });
    return Object.freeze({
      protocol: "aurion.recovery.plan.v1",
      zoneId,
      status: "AVAILABLE",
      checkpointId: lastGood.id,
      checkpointTick: lastGood.tick,
      snapshotHash: lastGood.snapshotHash,
      mutationAuthority: "none",
    });
  }
}

export const globalCausalRecoveryService = new AurionCausalRecoveryService();
