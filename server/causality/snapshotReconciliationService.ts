import type { CausalPersistenceAdapter } from "./tickRecorder";
import { globalCausalPersistence } from "./persistence";
import { replayZoneTick } from "./replayZoneTick";
import { hashCanonicalZoneState, type CanonicalZoneState } from "./zoneCanonicalState";

/**
 * Observer-only checkpoint verifier. It may annotate reconciliation status but
 * never mutates gameplay state, receipts or checkpoints themselves.
 */
export class AurionSnapshotReconciliationService {
  private isRunning = false;
  private persistenceAdapter: CausalPersistenceAdapter = globalCausalPersistence;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    void this.reconciliationLoop();
  }

  stop(): void { this.isRunning = false; }

  private async reconciliationLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const unreconciled = await this.persistenceAdapter.getUnreconciledCheckpoints(5);
        if (unreconciled.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 60_000));
          continue;
        }
        for (const checkpoint of unreconciled) await this.reconcileCheckpoint(checkpoint);
      } catch (error) {
        console.error("[C-Aurion] Snapshot reconciliation loop error", error);
        await new Promise(resolve => setTimeout(resolve, 10_000));
      }
    }
  }

  private async reconcileCheckpoint(checkpoint: any): Promise<void> {
    const { zoneId, tick, snapshotHash, snapshotJson, id } = checkpoint;
    if (!Number.isSafeInteger(tick) || tick < 0) return;

    if (tick === 0) {
      try {
        const state = JSON.parse(snapshotJson) as CanonicalZoneState;
        const observed = hashCanonicalZoneState(state);
        await this.persistenceAdapter.updateCheckpointReconciliation(id, observed === snapshotHash ? 1 : -1);
      } catch {
        await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
      }
      return;
    }

    const previousTick = tick - 100;
    if (previousTick < 0) return;
    const previousCheckpoint = await this.persistenceAdapter.getCheckpoint(zoneId, previousTick);
    if (!previousCheckpoint) return; // Evidence gap: leave pending, never infer failure/success.
    if (hashCanonicalZoneState(previousCheckpoint.state) !== previousCheckpoint.snapshotHash) {
      await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
      return;
    }

    const ticks = await this.persistenceAdapter.getTicksInRange(zoneId, previousTick + 1, tick);
    if (ticks.length !== tick - previousTick) return;

    let currentState: CanonicalZoneState = previousCheckpoint.state;
    for (const recorded of ticks) {
      if (!recorded.intents) return;
      const verdict = replayZoneTick({ preState: currentState, intents: recorded.intents, expectedReceipt: recorded.receipt });
      if (verdict.status !== "MATCH") {
        await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
        return;
      }
      currentState = verdict.postState as CanonicalZoneState;
    }

    const finalHash = hashCanonicalZoneState(currentState);
    await this.persistenceAdapter.updateCheckpointReconciliation(id, finalHash === snapshotHash ? 1 : -1);
  }
}

export const globalSnapshotReconciliationService = new AurionSnapshotReconciliationService();
