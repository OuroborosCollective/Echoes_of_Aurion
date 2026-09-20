import { desc, eq } from "drizzle-orm";
import { aurionGlobalWorldEpochReceipts } from "../../drizzle/schema";
import { aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import { worldCausalRootService } from "./worldCausalRootService";
import { getDb } from "../db";

export type GlobalReconciliationStatus = Readonly<{
  protocol: "aurion.global-reconciliation.v1";
  mutationAuthority: "none";
  truthStatus: "VERIFIED" | "UNOBSERVABLE" | "UNPROVABLE";
  reason: string;
  lastObservedEpoch: number | null;
}>;

/**
 * Global reconciliation is evidence-only. Step 22 binds each new world epoch to
 * the exact causal zone receipt ranges observed in the epoch transaction. This
 * service verifies that evidence and never mutates world or gameplay authority.
 */
export class AurionGlobalStateReconciliationService {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private status: GlobalReconciliationStatus = Object.freeze({
    protocol: "aurion.global-reconciliation.v1",
    mutationAuthority: "none",
    truthStatus: "UNOBSERVABLE",
    reason: "EPOCH_ZONE_TICK_BINDING_UNAVAILABLE",
    lastObservedEpoch: null,
  });

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => void this.reconcileLatest(), 30_000);
    void this.reconcileLatest();
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  getStatus(): GlobalReconciliationStatus { return this.status; }

  async reconcileLatest(): Promise<void> {
    const db = await getDb();
    if (!db) {
      this.status = Object.freeze({
        protocol: "aurion.global-reconciliation.v1",
        mutationAuthority: "none",
        truthStatus: "UNPROVABLE",
        reason: "DATABASE_UNAVAILABLE",
        lastObservedEpoch: null,
      });
      return;
    }
    try {
      const [latest] = await db.select({ worldId: aurionGlobalWorldEpochReceipts.worldId, epoch: aurionGlobalWorldEpochReceipts.epoch })
        .from(aurionGlobalWorldEpochReceipts)
        .orderBy(desc(aurionGlobalWorldEpochReceipts.epoch))
        .limit(1);
      if (!latest) {
        this.status = Object.freeze({
          protocol: "aurion.global-reconciliation.v1",
          mutationAuthority: "none",
          truthStatus: "UNOBSERVABLE",
          reason: "WORLD_EPOCH_UNOBSERVABLE",
          lastObservedEpoch: null,
        });
        return;
      }
      const [proof] = await db.select().from(aurionGlobalStateProofs)
        .where(eq(aurionGlobalStateProofs.worldId, latest.worldId))
        .orderBy(desc(aurionGlobalStateProofs.epoch))
        .limit(1);
      if (!proof || proof.epoch !== latest.epoch) {
        this.status = Object.freeze({
          protocol: "aurion.global-reconciliation.v1",
          mutationAuthority: "none",
          truthStatus: "UNPROVABLE",
          reason: "WORLD_CAUSAL_ROOT_MISSING",
          lastObservedEpoch: latest.epoch,
        });
        return;
      }
      // Recompute the persisted delta prefixes and zone ranges. Merely hashing
      // the stored root document is not independent state verification.
      const verdict = await worldCausalRootService.replay(latest.worldId, latest.epoch);
      const verified = verdict.status === "MATCH" && verdict.worldRootHash === proof.globalProofHash;
      this.status = Object.freeze({
        protocol: "aurion.global-reconciliation.v1",
        mutationAuthority: "none",
        truthStatus: verified ? "VERIFIED" : "UNPROVABLE",
        reason: verified ? "WORLD_CAUSAL_ROOT_MATCH" : (verdict.status === "UNPROVABLE" ? verdict.reason : "WORLD_CAUSAL_ROOT_DIVERGENCE"),
        lastObservedEpoch: latest.epoch,
      });
    } catch (error) {
      this.status = Object.freeze({
        protocol: "aurion.global-reconciliation.v1",
        mutationAuthority: "none",
        truthStatus: "UNPROVABLE",
        reason: error instanceof Error ? error.message : String(error),
        lastObservedEpoch: null,
      });
    }
  }
}

export const globalStateReconciliationService = new AurionGlobalStateReconciliationService();
