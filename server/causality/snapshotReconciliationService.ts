import { type ReplayVerdict } from "../../shared/aurionReplayContract";
import type { CanonicalZoneState } from "./zoneCanonicalState";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import { globalCausalPersistence } from "./persistence";
import { replayZoneTick } from "./replayZoneTick";
import type { CausalPersistenceAdapter } from "./tickRecorder";

/** Replays checkpoint-to-checkpoint ranges from persisted canonical snapshots. */
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
    const zoneId = String(checkpoint.zoneId);
    const tick = Number(checkpoint.tick);
    const id = String(checkpoint.id);
    const snapshotHash = String(checkpoint.snapshotHash);
    if (!Number.isSafeInteger(tick) || tick < 0) {
      await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
      return;
    }

    // Tick 0 is an initial-state checkpoint. Its own canonical hash is sufficient.
    if (tick === 0) {
      const initial = JSON.parse(checkpoint.snapshotJson) as CanonicalZoneState;
      await this.persistenceAdapter.updateCheckpointReconciliation(id, hashCanonicalZoneState(initial) === snapshotHash ? 1 : -1);
      return;
    }

    const previousTick = tick - 100;
    const previous = await this.persistenceAdapter.getCheckpoint(zoneId, previousTick);
    if (!previous || previous.reconciled !== 1) {
      // Missing evidence remains pending/UNPROVABLE; never mark it divergent.
      return;
    }

    const ticks = await this.persistenceAdapter.getTicksInRange(zoneId, previousTick + 1, tick);
    if (ticks.length !== tick - previousTick) return;

    let currentState: CanonicalZoneState = previous.state;
    for (const recorded of ticks) {
      let verdict: ReplayVerdict;
      if (!recorded.intents) {
        verdict = { status: "UNPROVABLE", verdict: "UNPROVABLE", tick: recorded.receipt.tick, reason: "RECORDED_INTENTS_MISSING" };
      } else {
        verdict = replayZoneTick({ preState: currentState, intents: recorded.intents, expectedReceipt: recorded.receipt });
      }
      if (verdict.status === "UNPROVABLE") return;
      if (verdict.status === "FIRST_DIVERGENCE") {
        await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
        return;
      }
      if (!verdict.postState || typeof verdict.postState !== "object") return;
      currentState = verdict.postState as CanonicalZoneState;
    }

    const finalHash = hashCanonicalZoneState(currentState);
    await this.persistenceAdapter.updateCheckpointReconciliation(id, finalHash === snapshotHash ? 1 : -1);
  }
}

export const globalSnapshotReconciliationService = new AurionSnapshotReconciliationService();
