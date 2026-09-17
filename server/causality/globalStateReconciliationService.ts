import { desc } from "drizzle-orm";
import { aurionGlobalWorldEpochReceipts } from "../../drizzle/schema";
import { getDb } from "../db";

export type GlobalReconciliationStatus = Readonly<{
  protocol: "aurion.global.reconciliation.v1";
  state: "UNOBSERVABLE" | "IDLE";
  reason: string;
  lastObservedEpoch: number | null;
}>;

/**
 * Global epoch → zone tick correlation is not yet represented by an authoritative
 * public contract. Until it is, this service is observation-only and must not
 * manufacture VERIFIED proofs or materialize world state from an assumed mapping.
 */
export class AurionGlobalStateReconciliationService {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private status: GlobalReconciliationStatus = Object.freeze({
    protocol: "aurion.global.reconciliation.v1",
    state: "UNOBSERVABLE",
    reason: "GLOBAL_EPOCH_TO_ZONE_TICK_BINDING_NOT_IMPLEMENTED",
    lastObservedEpoch: null,
  });

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => void this.observeLatest(), 30_000);
    void this.observeLatest();
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }

  getStatus(): GlobalReconciliationStatus { return this.status; }

  async reconcileLatest(): Promise<void> { await this.observeLatest(); }

  private async observeLatest(): Promise<void> {
    const db = await getDb();
    if (!db) {
      this.status = Object.freeze({ protocol: "aurion.global.reconciliation.v1", state: "UNOBSERVABLE", reason: "DATABASE_UNAVAILABLE", lastObservedEpoch: null });
      return;
    }
    try {
      const [epoch] = await db.select({ epoch: aurionGlobalWorldEpochReceipts.epoch })
        .from(aurionGlobalWorldEpochReceipts)
        .orderBy(desc(aurionGlobalWorldEpochReceipts.epoch)).limit(1);
      this.status = Object.freeze({
        protocol: "aurion.global.reconciliation.v1",
        state: "UNOBSERVABLE",
        reason: "GLOBAL_EPOCH_TO_ZONE_TICK_BINDING_NOT_IMPLEMENTED",
        lastObservedEpoch: epoch?.epoch ?? null,
      });
    } catch (error) {
      this.status = Object.freeze({ protocol: "aurion.global.reconciliation.v1", state: "UNOBSERVABLE", reason: error instanceof Error ? error.message : String(error), lastObservedEpoch: null });
    }
  }
}

export const globalStateReconciliationService = new AurionGlobalStateReconciliationService();
