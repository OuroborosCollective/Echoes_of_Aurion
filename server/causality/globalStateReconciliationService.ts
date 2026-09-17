import { desc } from "drizzle-orm";
import { aurionGlobalWorldEpochReceipts } from "../../drizzle/schema";
import { getDb } from "../db";

export type GlobalReconciliationStatus = Readonly<{
  protocol: "aurion.global-reconciliation.v1";
  mutationAuthority: "none";
  truthStatus: "UNOBSERVABLE" | "UNPROVABLE";
  reason: string;
  lastObservedEpoch: number | null;
}>;

/**
 * Global reconciliation remains observational until Aurion has an explicit,
 * receipt-bound mapping from each global epoch to the exact zone ticks that form
 * that epoch. The previous epoch===zoneTick shortcut was an inference, not proof.
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
      const [latest] = await db.select({ epoch: aurionGlobalWorldEpochReceipts.epoch })
        .from(aurionGlobalWorldEpochReceipts)
        .orderBy(desc(aurionGlobalWorldEpochReceipts.epoch))
        .limit(1);
      this.status = Object.freeze({
        protocol: "aurion.global-reconciliation.v1",
        mutationAuthority: "none",
        truthStatus: "UNOBSERVABLE",
        reason: "EPOCH_ZONE_TICK_BINDING_UNAVAILABLE",
        lastObservedEpoch: latest?.epoch ?? null,
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
