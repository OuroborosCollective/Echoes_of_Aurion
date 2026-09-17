import {
  type AurionCausalTickReceipt,
  computeReceiptHash,
} from "../../shared/aurionCausalTickContract";
import type { CanonicalZoneState } from "./zoneCanonicalState";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";

export interface RecordedTickEntry {
  receipt: AurionCausalTickReceipt;
  preState?: CanonicalZoneState;
  postState?: CanonicalZoneState;
  intents?: AurionZoneIntent[];
  transitionSummary?: Record<string, unknown>;
}

export interface CausalPersistenceAdapter {
  saveReceipt(receipt: AurionCausalTickReceipt, intents?: AurionZoneIntent[]): Promise<void>;
  saveCheckpoint(zoneId: string, tick: number, stateHash: string, state: CanonicalZoneState): Promise<void>;
  saveReplayRun(run: {
    worldId: string;
    zoneId: string;
    fromTick: number;
    toTick: number;
    sourceRevision: string;
    runtimeRuleset: string;
    status: "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE";
    firstDivergentStage?: string;
    expectedHash?: string;
    observedHash?: string;
  }): Promise<void>;
  getLatestReceipt(zoneId: string): Promise<AurionCausalTickReceipt | null>;
  getRecordedTick(zoneId: string, tick: number): Promise<RecordedTickEntry | null>;
  getUnreconciledCheckpoints(limit: number): Promise<any[]>;
  getDivergentCheckpoints(zoneId: string, limit: number): Promise<any[]>;
  updateCheckpointReconciliation(id: string, status: number): Promise<void>;
  getTicksInRange(zoneId: string, fromTick: number, toTick: number): Promise<RecordedTickEntry[]>;
  repairZone(zoneId: string, checkpointId: string): Promise<void>;
  archiveOldReceipts(zoneId: string, beforeTick: number): Promise<{ archivedCount: number; archiveId: string } | null>;
  getArchiveStats(zoneId: string): Promise<{ totalArchives: number; totalArchivedReceipts: number }>;
}

function clonePlainValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotRecordedEntry(entry: RecordedTickEntry): RecordedTickEntry {
  return {
    receipt: { ...entry.receipt },
    preState: entry.preState ? clonePlainValue(entry.preState) : undefined,
    postState: entry.postState ? clonePlainValue(entry.postState) : undefined,
    intents: entry.intents ? clonePlainValue(entry.intents) : undefined,
    transitionSummary: entry.transitionSummary ? clonePlainValue(entry.transitionSummary) : undefined,
  };
}

export class AurionTickRecorder {
  private readonly maxEntries: number;
  private readonly receiptsByZone = new Map<string, RecordedTickEntry[]>();
  private readonly receiptsByZoneAndTick = new Map<string, Map<number, RecordedTickEntry>>();
  private persistenceAdapter?: CausalPersistenceAdapter;

  constructor(maxEntries = 1000, persistenceAdapter?: CausalPersistenceAdapter) {
    this.maxEntries = maxEntries;
    this.persistenceAdapter = persistenceAdapter;
  }

  public setPersistenceAdapter(adapter: CausalPersistenceAdapter): void {
    this.persistenceAdapter = adapter;
  }

  public async recordTick(receipt: AurionCausalTickReceipt, postState?: CanonicalZoneState, preState?: CanonicalZoneState, intents?: AurionZoneIntent[]): Promise<void> {
    this.record({ receipt, postState, preState, intents });
    if (this.persistenceAdapter) {
      await this.persistenceAdapter.saveReceipt(receipt, intents);
      if (postState && receipt.tick % 100 === 0) {
        await this.persistenceAdapter.saveCheckpoint(
          receipt.zoneId,
          receipt.tick,
          receipt.postStateHash,
          postState
        );
      }
    }
  }

  record(entry: RecordedTickEntry): void {
    const storedEntry = snapshotRecordedEntry(entry);
    const zoneId = storedEntry.receipt.zoneId;
    let list = this.receiptsByZone.get(zoneId);
    if (!list) {
      list = [];
      this.receiptsByZone.set(zoneId, list);
    }
    let map = this.receiptsByZoneAndTick.get(zoneId);
    if (!map) {
      map = new Map<number, RecordedTickEntry>();
      this.receiptsByZoneAndTick.set(zoneId, map);
    }

    list.push(storedEntry);
    map.set(storedEntry.receipt.tick, storedEntry);

    if (list.length > this.maxEntries) {
      const removed = list.shift();
      if (removed) {
        map.delete(removed.receipt.tick);
      }
    }
  }

  getEntry(zoneId: string, tick: number): RecordedTickEntry | undefined {
    return this.receiptsByZoneAndTick.get(zoneId)?.get(tick);
  }

  getReceipt(zoneId: string, tick: number): AurionCausalTickReceipt | undefined {
    return this.getEntry(zoneId, tick)?.receipt;
  }

  getLatestReceipt(zoneId: string): AurionCausalTickReceipt | undefined {
    const list = this.receiptsByZone.get(zoneId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1].receipt;
  }

  getReceiptChain(zoneId: string, fromTick: number, toTick: number): AurionCausalTickReceipt[] {
    const map = this.receiptsByZoneAndTick.get(zoneId);
    if (!map) return [];
    const chain: AurionCausalTickReceipt[] = [];
    for (let t = fromTick; t <= toTick; t++) {
      const entry = map.get(t);
      if (entry) {
        chain.push(entry.receipt);
      }
    }
    return chain;
  }

  getChainLength(zoneId: string): number {
    return this.receiptsByZone.get(zoneId)?.length ?? 0;
  }

  getReceipts(zoneId?: string): AurionCausalTickReceipt[] {
    if (zoneId) {
      return (this.receiptsByZone.get(zoneId) ?? []).map(e => e.receipt);
    }
    const all: AurionCausalTickReceipt[] = [];
    for (const list of this.receiptsByZone.values()) {
      for (const entry of list) {
        all.push(entry.receipt);
      }
    }
    return all;
  }

  verifyReceiptChain(zoneId?: string): {
    valid: boolean;
    brokenAtTick?: number;
    error?: string;
  } {
    if (zoneId) {
      const chain = (this.receiptsByZone.get(zoneId) ?? []).map(e => e.receipt);
      return AurionTickRecorder.verifyReceiptChain(chain);
    }
    for (const list of this.receiptsByZone.values()) {
      const chain = list.map(e => e.receipt);
      const res = AurionTickRecorder.verifyReceiptChain(chain);
      if (!res.valid) return res;
    }
    return { valid: true };
  }

  static verifyReceiptChain(chain: readonly AurionCausalTickReceipt[]): {
    valid: boolean;
    brokenAtTick?: number;
    error?: string;
  } {
    if (chain.length === 0) return { valid: true };

    for (let i = 0; i < chain.length; i++) {
      const receipt = chain[i];
      const expectedHash = computeReceiptHash(receipt);
      if (receipt.receiptHash !== expectedHash) {
        return {
          valid: false,
          brokenAtTick: receipt.tick,
          error: `RECEIPT_HASH_MISMATCH: expected ${expectedHash}, got ${receipt.receiptHash}`,
        };
      }

      if (i > 0) {
        const prev = chain[i - 1];
        if (receipt.previousReceiptHash !== prev.receiptHash) {
          return {
            valid: false,
            brokenAtTick: receipt.tick,
            error: `PREVIOUS_RECEIPT_HASH_MISMATCH at tick ${receipt.tick}: expected ${prev.receiptHash}, got ${receipt.previousReceiptHash}`,
          };
        }
        if (receipt.tick !== prev.tick + 1) {
          return {
            valid: false,
            brokenAtTick: receipt.tick,
            error: `TICK_SEQUENCE_DISCONTINUITY: previous ${prev.tick}, current ${receipt.tick}`,
          };
        }
      }
    }
    return { valid: true };
  }
}

export const globalTickRecorder = new AurionTickRecorder(2000);
