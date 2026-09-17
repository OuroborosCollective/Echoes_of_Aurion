import { globalTickRecorder, type CausalPersistenceAdapter } from "./tickRecorder";
import { globalCausalPersistence } from "./persistence";
import { replayZoneTick } from "./replayZoneTick";
import { hashCanonicalZoneState } from "./zoneCanonicalState";
import { isReplayMatch } from "../../shared/aurionReplayContract";
import { CanonicalZoneState } from "./zoneCanonicalState";

export class AurionSnapshotReconciliationService {
  private isRunning = false;
  private persistenceAdapter: CausalPersistenceAdapter = globalCausalPersistence;

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.reconciliationLoop();
  }

  private async reconciliationLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const unreconciled = await this.persistenceAdapter.getUnreconciledCheckpoints(5);
        if (unreconciled.length === 0) {
          await new Promise(r => setTimeout(r, 60000)); // Wait a minute if nothing to do
          continue;
        }

        for (const checkpoint of unreconciled) {
          await this.reconcileCheckpoint(checkpoint);
        }
      } catch (error) {
        console.error("[C-Aurion] Snapshot reconciliation loop error", error);
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  }

  private async reconcileCheckpoint(checkpoint: any): Promise<void> {
    const { zoneId, tick, snapshotHash, snapshotJson, id } = checkpoint;
    
    // 1. Find the previous checkpoint
    // In our system, we save every 100 ticks.
    const prevTick = tick - 100;
    if (prevTick < 0) {
      // If it's the first checkpoint, we might need a different logic or just mark as reconciled if it's tick 0
      if (tick === 0) {
         await this.persistenceAdapter.updateCheckpointReconciliation(id, 1);
         return;
      }
      // If no previous checkpoint and not tick 0, we can't reconcile easily without tick 0
      // For now, let's assume we can always find the previous one or we skip
      await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
      return;
    }

    const prevEntry = await this.persistenceAdapter.getRecordedTick(zoneId, prevTick);
    if (!prevEntry || !prevEntry.postState) {
       // Cannot reconcile if starting point is missing
       return;
    }

    // 2. Fetch all ticks from prevTick + 1 up to tick
    const ticks = await this.persistenceAdapter.getTicksInRange(zoneId, prevTick + 1, tick);
    if (ticks.length !== (tick - prevTick)) {
      console.warn(`[C-Aurion] Reconciliation for ${zoneId} tick ${tick} failed: missing ticks in range.`);
      return;
    }

    // 3. Replay
    let currentState: CanonicalZoneState = prevEntry.postState;
    for (const t of ticks) {
      const verdict = replayZoneTick({
        preState: currentState,
        intents: t.intents || [],
        expectedReceipt: t.receipt
      });

      if (verdict.status !== "MATCH") {
        console.error(`[C-Aurion] Reconciliation FAILED at tick ${t.receipt.tick} for checkpoint ${tick}`);
        await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
        return;
      }
      
      // Update currentState to the post-state of the replayed tick
      currentState = verdict.postState;
    }

    // 4. Final verification
    // Verify that the final replayed state hash matches the checkpoint hash
    const finalHash = hashCanonicalZoneState(currentState);
    if (finalHash !== snapshotHash) {
       console.error(`[C-Aurion] Reconciliation divergence at checkpoint: observed ${finalHash}, expected ${snapshotHash}`);
       await this.persistenceAdapter.updateCheckpointReconciliation(id, -1);
       return;
    }

    await this.persistenceAdapter.updateCheckpointReconciliation(id, 1);
    console.log(`[C-Aurion] Successfully reconciled snapshot for ${zoneId} at tick ${tick}`);
  }
}

export const globalSnapshotReconciliationService = new AurionSnapshotReconciliationService();
