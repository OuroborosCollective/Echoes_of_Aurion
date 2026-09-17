import { type AurionCausalTickReceipt, computeReceiptHash } from "../../shared/aurionCausalTickContract";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import type { CanonicalZoneState } from "./zoneCanonicalState";

export interface RecordedTickEntry {
  receipt: AurionCausalTickReceipt;
  preState?: CanonicalZoneState;
  postState?: CanonicalZoneState;
  intents?: AurionZoneIntent[];
  transitionSummary?: Record<string, unknown>;
}
export interface PersistedCheckpoint {
  id: string;
  worldId: string;
  zoneId: string;
  tick: number;
  snapshotHash: string;
  state: CanonicalZoneState;
  reconciled: number;
}

export interface CausalPersistenceAdapter {
  saveReceipt(receipt: AurionCausalTickReceipt, intents?: AurionZoneIntent[]): Promise<void>;
  saveCheckpoint(zoneId: string, tick: number, stateHash: string, state: CanonicalZoneState): Promise<void>;
  saveReplayRun(run: { worldId: string; zoneId: string; fromTick: number; toTick: number; sourceRevision: string; runtimeRuleset: string; status: "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE"; firstDivergentStage?: string; expectedHash?: string; observedHash?: string }): Promise<void>;
  getLatestReceipt(zoneId: string): Promise<AurionCausalTickReceipt | null>;
  getRecordedTick(zoneId: string, tick: number): Promise<RecordedTickEntry | null>;
  getCheckpoint(zoneId: string, tick: number): Promise<PersistedCheckpoint | null>;
  getUnreconciledCheckpoints(limit: number): Promise<any[]>;
  getDivergentCheckpoints(zoneId: string, limit: number): Promise<any[]>;
  updateCheckpointReconciliation(id: string, status: number): Promise<void>;
  getTicksInRange(zoneId: string, fromTick: number, toTick: number): Promise<RecordedTickEntry[]>;
  archiveOldReceipts(zoneId: string, beforeTick: number): Promise<{ archivedCount: number; archiveId: string } | null>;
  getArchiveStats(zoneId: string): Promise<{ totalArchives: number; totalArchivedReceipts: number }>;
}

export type PersistenceQueueStatus = Readonly<{ pending: number; failures: number; lastError: string | null }>;

export class AurionTickRecorder {
  private readonly receiptsByZone = new Map<string, RecordedTickEntry[]>();
  private readonly receiptsByZoneAndTick = new Map<string, Map<number, RecordedTickEntry>>();
  private persistenceAdapter?: CausalPersistenceAdapter;
  private persistenceChain: Promise<void> = Promise.resolve();
  private pendingPersistence = 0;
  private persistenceFailures = 0;
  private lastPersistenceError: string | null = null;

  constructor(private readonly maxEntries = 1000, persistenceAdapter?: CausalPersistenceAdapter) { this.persistenceAdapter = persistenceAdapter; }
  setPersistenceAdapter(adapter: CausalPersistenceAdapter): void { this.persistenceAdapter = adapter; }

  enqueueTick(receipt: AurionCausalTickReceipt, postState?: CanonicalZoneState, preState?: CanonicalZoneState, intents?: AurionZoneIntent[]): void {
    this.record({ receipt, postState, preState, intents });
    const adapter = this.persistenceAdapter;
    if (!adapter) return;
    this.pendingPersistence += 1;
    this.persistenceChain = this.persistenceChain
      .then(async () => {
        await adapter.saveReceipt(receipt, intents);
        if (receipt.tick === 1 && preState) await adapter.saveCheckpoint(receipt.zoneId, 0, receipt.preStateHash, preState);
        if (postState && receipt.tick % 100 === 0) await adapter.saveCheckpoint(receipt.zoneId, receipt.tick, receipt.postStateHash, postState);
      })
      .catch(error => {
        this.persistenceFailures += 1;
        this.lastPersistenceError = error instanceof Error ? error.message : String(error);
        console.error("[C-Aurion] Evidence persistence failed", error);
      })
      .finally(() => { this.pendingPersistence = Math.max(0, this.pendingPersistence - 1); });
  }

  async recordTick(receipt: AurionCausalTickReceipt, postState?: CanonicalZoneState, preState?: CanonicalZoneState, intents?: AurionZoneIntent[]): Promise<void> {
    this.enqueueTick(receipt, postState, preState, intents);
    await this.persistenceChain;
  }
  async flushPersistence(): Promise<void> { await this.persistenceChain; }
  getPersistenceStatus(): PersistenceQueueStatus { return Object.freeze({ pending: this.pendingPersistence, failures: this.persistenceFailures, lastError: this.lastPersistenceError }); }

  record(entry: RecordedTickEntry): void {
    const zoneId = entry.receipt.zoneId;
    let list = this.receiptsByZone.get(zoneId);
    if (!list) { list = []; this.receiptsByZone.set(zoneId, list); }
    let map = this.receiptsByZoneAndTick.get(zoneId);
    if (!map) { map = new Map(); this.receiptsByZoneAndTick.set(zoneId, map); }
    const previous = map.get(entry.receipt.tick);
    if (previous) {
      if (previous.receipt.receiptHash !== entry.receipt.receiptHash) throw new Error(`CAUSAL_TICK_CONFLICT:${zoneId}:${entry.receipt.tick}`);
      return;
    }
    list.push(entry);
    map.set(entry.receipt.tick, entry);
    if (list.length > this.maxEntries) { const removed = list.shift(); if (removed) map.delete(removed.receipt.tick); }
  }

  getEntry(zoneId: string, tick: number): RecordedTickEntry | undefined { return this.receiptsByZoneAndTick.get(zoneId)?.get(tick); }
  getReceipt(zoneId: string, tick: number): AurionCausalTickReceipt | undefined { return this.getEntry(zoneId, tick)?.receipt; }
  getLatestReceipt(zoneId: string): AurionCausalTickReceipt | undefined { const list = this.receiptsByZone.get(zoneId); return list?.[list.length - 1]?.receipt; }
  getReceiptChain(zoneId: string, fromTick: number, toTick: number): AurionCausalTickReceipt[] {
    const map = this.receiptsByZoneAndTick.get(zoneId); if (!map) return [];
    const chain: AurionCausalTickReceipt[] = [];
    for (let tick = fromTick; tick <= toTick; tick += 1) { const entry = map.get(tick); if (entry) chain.push(entry.receipt); }
    return chain;
  }
  getChainLength(zoneId: string): number { return this.receiptsByZone.get(zoneId)?.length ?? 0; }
  getReceipts(zoneId?: string): AurionCausalTickReceipt[] {
    if (zoneId) return (this.receiptsByZone.get(zoneId) ?? []).map(entry => entry.receipt);
    return Array.from(this.receiptsByZone.values()).flatMap(list => list.map(entry => entry.receipt));
  }

  verifyReceiptChain(zoneId?: string): { valid: boolean; brokenAtTick?: number; error?: string } {
    if (zoneId) return AurionTickRecorder.verifyReceiptChain((this.receiptsByZone.get(zoneId) ?? []).map(entry => entry.receipt));
    for (const list of this.receiptsByZone.values()) { const result = AurionTickRecorder.verifyReceiptChain(list.map(entry => entry.receipt)); if (!result.valid) return result; }
    return { valid: true };
  }
  static verifyReceiptChain(chain: readonly AurionCausalTickReceipt[]): { valid: boolean; brokenAtTick?: number; error?: string } {
    for (let index = 0; index < chain.length; index += 1) {
      const receipt = chain[index];
      const expectedHash = computeReceiptHash(receipt);
      if (receipt.receiptHash !== expectedHash) return { valid: false, brokenAtTick: receipt.tick, error: `RECEIPT_HASH_MISMATCH: expected ${expectedHash}, got ${receipt.receiptHash}` };
      if (index === 0) continue;
      const previous = chain[index - 1];
      if (receipt.previousReceiptHash !== previous.receiptHash) return { valid: false, brokenAtTick: receipt.tick, error: `PREVIOUS_RECEIPT_HASH_MISMATCH at tick ${receipt.tick}: expected ${previous.receiptHash}, got ${receipt.previousReceiptHash}` };
      if (receipt.tick !== previous.tick + 1) return { valid: false, brokenAtTick: receipt.tick, error: `TICK_SEQUENCE_DISCONTINUITY: previous ${previous.tick}, current ${receipt.tick}` };
    }
    return { valid: true };
  }
}

export const globalTickRecorder = new AurionTickRecorder(2000);
