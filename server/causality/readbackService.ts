import {
  type AurionCausalTickReceipt,
} from "../../shared/aurionCausalTickContract";
import { type ReplayVerdict, isReplayMatch } from "../../shared/aurionReplayContract";
import { replayZoneTick } from "./replayZoneTick";
import { globalTickRecorder, type RecordedTickEntry, type CausalPersistenceAdapter } from "./tickRecorder";
import { globalCausalPersistence } from "./persistence";
import { globalCausalRecoveryService } from "./causalRecoveryService";

export interface ReadbackVerificatonReceipt {
  zoneId: string;
  tick: number;
  verdict: ReplayVerdict;
  verifiedAt: Date;
}

/**
 * Background service that continuously replays and verifies recorded ticks
 * to ensure that the production simulation is maintaining 100% deterministic parity.
 */
export class AurionCausalReadbackService {
  private isRunning = false;
  private lastVerifiedTickByZone = new Map<string, number>();
  private verificationHistory: ReadbackVerificatonReceipt[] = [];
  private readonly maxHistory = 1000;
  private persistenceAdapter?: CausalPersistenceAdapter;

  constructor(private readonly recorder = globalTickRecorder) {}

  public setPersistenceAdapter(adapter: CausalPersistenceAdapter): void {
    this.persistenceAdapter = adapter;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runLoop();
  }

  public stop(): void {
    this.isRunning = false;
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      const zones = Array.from(new Set(this.recorder.getReceipts().map(r => r.zoneId)));
      
      for (const zoneId of zones) {
        try {
          await this.verifyNextForZone(zoneId);
        } catch (error) {
          console.error(`[C-Aurion] Error in readback for ${zoneId}`, error);
        }
      }

      // Small delay to prevent CPU saturation in the background loop
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private async verifyNextForZone(zoneId: string): Promise<void> {
    const latestReceipt = this.recorder.getLatestReceipt(zoneId) || 
                         (this.persistenceAdapter ? await this.persistenceAdapter.getLatestReceipt(zoneId) : null);
    if (!latestReceipt) return;

    let nextTick = (this.lastVerifiedTickByZone.get(zoneId) ?? (latestReceipt.tick - 50)) + 1;
    if (nextTick < 0) nextTick = 0;

    // Don't try to verify beyond what we have recorded
    if (nextTick > latestReceipt.tick) return;

    let entry: RecordedTickEntry | undefined | null = this.recorder.getEntry(zoneId, nextTick);
    
    // If not in memory, try to pull from persistence
    if (!entry && this.persistenceAdapter) {
      entry = await this.persistenceAdapter.getRecordedTick(zoneId, nextTick);
    }

    if (!entry || !entry.intents || !entry.preState) {
      // If we are missing preState or intents, we move on but don't count it as verified
      // Unless we reach a point where we MUST have them
      this.lastVerifiedTickByZone.set(zoneId, nextTick);
      return;
    }

    const verdict = replayZoneTick({
      preState: entry.preState,
      intents: entry.intents,
      expectedReceipt: entry.receipt,
    });

    const verification: ReadbackVerificatonReceipt = {
      zoneId,
      tick: nextTick,
      verdict,
      verifiedAt: new Date(),
    };

    this.recordVerification(verification);
    this.lastVerifiedTickByZone.set(zoneId, nextTick);

    // Save replay result to persistence
    if (this.persistenceAdapter) {
      await this.persistenceAdapter.saveReplayRun({
        worldId: entry.receipt.worldId,
        zoneId: entry.receipt.zoneId,
        fromTick: nextTick,
        toTick: nextTick,
        sourceRevision: entry.receipt.sourceRevision,
        runtimeRuleset: entry.receipt.rulesetVersion,
        status: verdict.status,
        firstDivergentStage: verdict.status === "FIRST_DIVERGENCE" ? verdict.stage : undefined,
        expectedHash: verdict.status === "FIRST_DIVERGENCE" ? verdict.expectedHash : undefined,
        observedHash: verdict.status === "FIRST_DIVERGENCE" ? verdict.observedHash : undefined,
      });
    }

    if (!isReplayMatch(verdict)) {
      console.error(`[C-Aurion] DETERMINISM_DIVERGENCE at ${zoneId} tick ${nextTick}`, verdict);
      
      // Step 20: Causal Recovery & World Repair
      // Automatically trigger a safe revert when a divergence is detected.
      globalCausalRecoveryService.triggerAutomaticRollback(zoneId).catch(err => {
        console.error(`[C-Aurion] Failed to execute automatic rollback for ${zoneId}:`, err);
      });
    }
  }

  private recordVerification(receipt: ReadbackVerificatonReceipt): void {
    this.verificationHistory.push(receipt);
    if (this.verificationHistory.length > this.maxHistory) {
      this.verificationHistory.shift();
    }
  }

  public getStatus(): { verifiedTicks: number; divergences: number; history: ReadbackVerificatonReceipt[] } {
    const history = [...this.verificationHistory];
    const divergences = history.filter(h => !isReplayMatch(h.verdict)).length;
    return {
      verifiedTicks: history.length,
      divergences,
      history,
    };
  }
}

export const globalReadbackService = new AurionCausalReadbackService();
globalReadbackService.setPersistenceAdapter(globalCausalPersistence);
