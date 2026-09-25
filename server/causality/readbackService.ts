import { isReplayMatch, replayUnprovable, type ReplayVerdict } from "../../shared/aurionReplayContract";
import { operationalDate } from "../../shared/operationalClock";
import { replayZoneTick } from "./replayZoneTick";
import { globalTickRecorder, type RecordedTickEntry, type CausalPersistenceAdapter } from "./tickRecorder";
import { globalCausalPersistence } from "./persistence";
import { recordOtelCausalReceiptReference } from "../observability/otelBoundary";

export interface ReadbackVerificationReceipt {
  zoneId: string;
  tick: number;
  verdict: ReplayVerdict;
  verifiedAt: Date;
}

/** Observer-only replay auditor. It never rolls back or mutates gameplay state. */
export class AurionCausalReadbackService {
  private isRunning = false;
  private lastObservedTickByZone = new Map<string, number>();
  private verificationHistory: ReadbackVerificationReceipt[] = [];
  private readonly maxHistory = 1000;
  private persistenceAdapter?: CausalPersistenceAdapter;

  constructor(private readonly recorder = globalTickRecorder) {}
  setPersistenceAdapter(adapter: CausalPersistenceAdapter): void { this.persistenceAdapter = adapter; }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    void this.runLoop();
  }
  stop(): void { this.isRunning = false; }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      const zones = Array.from(new Set(this.recorder.getReceipts().map(receipt => receipt.zoneId)));
      for (const zoneId of zones) {
        try { await this.verifyNextForZone(zoneId); }
        catch (error) { console.error(`[C-Aurion] Readback error for ${zoneId}`, error); }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private async verifyNextForZone(zoneId: string): Promise<void> {
    const latest = this.recorder.getLatestReceipt(zoneId) ?? (this.persistenceAdapter ? await this.persistenceAdapter.getLatestReceipt(zoneId) : null);
    if (!latest) return;
    let nextTick = (this.lastObservedTickByZone.get(zoneId) ?? Math.max(0, latest.tick - 50)) + 1;
    if (nextTick > latest.tick) return;

    let entry: RecordedTickEntry | undefined | null = this.recorder.getEntry(zoneId, nextTick);
    if (!entry && this.persistenceAdapter) entry = await this.persistenceAdapter.getRecordedTick(zoneId, nextTick);

    const evidenceReceipt = entry?.receipt ?? latest;
    const replayContext = {
      domain: "ZONE_TICK" as const,
      sourceRevision: evidenceReceipt.sourceRevision,
      rulesetVersion: evidenceReceipt.rulesetVersion,
      scopeIdentity: { worldId: evidenceReceipt.worldId, zoneId },
      range: { fromTick: nextTick, toTick: nextTick },
    };

    let verdict: ReplayVerdict;
    if (!entry) {
      verdict = replayUnprovable(replayContext, [], "RECORDED_TICK_MISSING", { tick: nextTick });
    } else if (!entry.intents) {
      verdict = replayUnprovable(replayContext, [], "RECORDED_INTENTS_MISSING", { tick: nextTick });
    } else if (!entry.preState) {
      verdict = replayUnprovable(replayContext, [], "REPLAY_PRE_STATE_UNAVAILABLE", { tick: nextTick });
    } else {
      verdict = replayZoneTick({ preState: entry.preState, intents: entry.intents, expectedReceipt: entry.receipt });
    }

    this.recordVerification({ zoneId, tick: nextTick, verdict, verifiedAt: operationalDate() });
    // Export only the receipt that was actually observed by the causal readback service.
    // OTel receives a bounded hash reference; it cannot author or mutate gameplay truth.
    recordOtelCausalReceiptReference({
      worldId: evidenceReceipt.worldId,
      zoneId: evidenceReceipt.zoneId,
      tick: evidenceReceipt.tick,
      receiptHash: evidenceReceipt.receiptHash,
      sourceRevision: evidenceReceipt.sourceRevision,
    });
    this.lastObservedTickByZone.set(zoneId, nextTick);

    if (entry && this.persistenceAdapter) {
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

    if (verdict.status === "FIRST_DIVERGENCE") {
      console.error(`[C-Aurion] DETERMINISM_DIVERGENCE at ${zoneId} tick ${nextTick}`, verdict);
    } else if (verdict.status === "UNPROVABLE") {
      console.warn(`[C-Aurion] REPLAY_UNPROVABLE at ${zoneId} tick ${nextTick}: ${verdict.reason}`);
    }
  }

  private recordVerification(receipt: ReadbackVerificationReceipt): void {
    this.verificationHistory.push(receipt);
    if (this.verificationHistory.length > this.maxHistory) this.verificationHistory.shift();
  }

  getStatus(): { observedTicks: number; verifiedTicks: number; divergences: number; unprovable: number; history: ReadbackVerificationReceipt[] } {
    const history = [...this.verificationHistory];
    return {
      observedTicks: history.length,
      verifiedTicks: history.filter(item => isReplayMatch(item.verdict)).length,
      divergences: history.filter(item => item.verdict.status === "FIRST_DIVERGENCE").length,
      unprovable: history.filter(item => item.verdict.status === "UNPROVABLE").length,
      history,
    };
  }
}

export const globalReadbackService = new AurionCausalReadbackService();
globalReadbackService.setPersistenceAdapter(globalCausalPersistence);
