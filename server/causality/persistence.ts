import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, lt, sql as sqlDrizzle } from "drizzle-orm";
import { getDb } from "../db";
import {
  aurionCausalArchive,
  aurionCausalCheckpoints,
  aurionCausalTickReceipts,
  aurionGlobalStateProofs,
  aurionReplayRuns,
} from "../../drizzle/aurionCausalitySchema";
import {
  AURION_CAUSAL_STAGE_NAMES,
  AURION_CAUSAL_TICK_SCHEMA_V1,
  AURION_CAUSAL_TICK_SCHEMA_V2,
  computeReceiptHash,
  type AurionCausalStageReceipt,
  type AurionCausalTickReceipt,
} from "../../shared/aurionCausalTickContract";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import type { GlobalWorldCanonicalState } from "../../shared/aurionGlobalWorldContract";
import { operationalDate } from "../../shared/operationalClock";
import type { CanonicalZoneState } from "./zoneCanonicalState";
import type { CausalPersistenceAdapter, PersistedCheckpoint, RecordedTickEntry } from "./tickRecorder";

function stableJson(value: unknown): string { return JSON.stringify(value); }

export class MariaDBCausalPersistenceAdapter implements CausalPersistenceAdapter {
  async saveReceipt(receipt: AurionCausalTickReceipt, intents?: AurionZoneIntent[]): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    const id = `rcpt_${receipt.worldId}_${receipt.zoneId}_${receipt.tick}`;
    const inputJson = intents ? stableJson(intents) : null;
    const stageReceiptsJson = receipt.schema === AURION_CAUSAL_TICK_SCHEMA_V2 ? stableJson(receipt.stages) : null;
    try {
      await db.insert(aurionCausalTickReceipts).values({
        id, worldId: receipt.worldId, zoneId: receipt.zoneId, tick: receipt.tick,
        revision: receipt.sourceRevision, rulesetVersion: receipt.rulesetVersion,
        receiptSchema: receipt.schema,
        preStateHash: receipt.preStateHash, inputHash: receipt.orderedIntentHash, inputJson,
        stageReceiptsJson,
        transitionHash: receipt.transitionHash, rngRootHash: receipt.rngRootHash,
        postStateHash: receipt.postStateHash, previousReceiptHash: receipt.previousReceiptHash,
        receiptHash: receipt.receiptHash,
      });
    } catch (error) {
      const [existing] = await db.select().from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.id, id)).limit(1);
      if (!existing) throw error;
      const same = existing.worldId === receipt.worldId && existing.zoneId === receipt.zoneId && existing.tick === receipt.tick &&
        existing.revision === receipt.sourceRevision && existing.rulesetVersion === receipt.rulesetVersion &&
        existing.receiptSchema === receipt.schema &&
        existing.preStateHash === receipt.preStateHash && existing.inputHash === receipt.orderedIntentHash &&
        existing.inputJson === inputJson && existing.stageReceiptsJson === stageReceiptsJson &&
        existing.transitionHash === receipt.transitionHash &&
        existing.rngRootHash === receipt.rngRootHash && existing.postStateHash === receipt.postStateHash &&
        existing.previousReceiptHash === receipt.previousReceiptHash && existing.receiptHash === receipt.receiptHash;
      if (!same) throw new Error(`CAUSAL_RECEIPT_CONFLICT:${id}`);
    }
  }

  async saveCheckpoint(zoneId: string, tick: number, stateHash: string, state: CanonicalZoneState): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    const id = `chk_${state.worldId}_${zoneId}_${tick}`;
    const snapshotJson = stableJson(state);
    try {
      await db.insert(aurionCausalCheckpoints).values({ id, worldId: state.worldId, zoneId, tick, snapshotHash: stateHash, snapshotJson });
    } catch (error) {
      const [existing] = await db.select().from(aurionCausalCheckpoints).where(eq(aurionCausalCheckpoints.id, id)).limit(1);
      if (!existing) throw error;
      if (existing.snapshotHash !== stateHash || existing.snapshotJson !== snapshotJson) throw new Error(`CAUSAL_CHECKPOINT_CONFLICT:${id}`);
    }
  }

  async saveReplayRun(run: { worldId: string; zoneId: string; fromTick: number; toTick: number; sourceRevision: string; runtimeRuleset: string; status: "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE"; firstDivergentStage?: string; expectedHash?: string; observedHash?: string }): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    await db.insert(aurionReplayRuns).values({
      id: `run_${run.worldId}_${run.zoneId}_${run.fromTick}_${run.toTick}_${randomUUID()}`,
      worldId: run.worldId, zoneId: run.zoneId, fromTick: run.fromTick, toTick: run.toTick,
      sourceRevision: run.sourceRevision, runtimeRuleset: run.runtimeRuleset, status: run.status,
      firstDivergentStage: run.firstDivergentStage, expectedHash: run.expectedHash, observedHash: run.observedHash,
    });
  }

  async getLatestReceipt(zoneId: string): Promise<AurionCausalTickReceipt | null> {
    const db = await getDb(); if (!db) return null;
    const [row] = await db.select().from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.zoneId, zoneId)).orderBy(desc(aurionCausalTickReceipts.tick)).limit(1);
    return row ? this.mapReceipt(row) : null;
  }

  async getRecordedTick(zoneId: string, tick: number): Promise<RecordedTickEntry | null> {
    const db = await getDb(); if (!db) return null;
    const [receiptRow] = await db.select().from(aurionCausalTickReceipts).where(and(eq(aurionCausalTickReceipts.zoneId, zoneId), eq(aurionCausalTickReceipts.tick, tick))).limit(1);
    if (!receiptRow) return null;
    const checkpoint = await this.getCheckpoint(zoneId, tick - 1);
    return {
      receipt: this.mapReceipt(receiptRow),
      preState: checkpoint?.state,
      intents: receiptRow.inputJson ? JSON.parse(receiptRow.inputJson) as AurionZoneIntent[] : undefined,
    };
  }

  async getCheckpoint(zoneId: string, tick: number): Promise<PersistedCheckpoint | null> {
    if (!Number.isSafeInteger(tick) || tick < 0) return null;
    const db = await getDb(); if (!db) return null;
    const [row] = await db.select().from(aurionCausalCheckpoints)
      .where(and(eq(aurionCausalCheckpoints.zoneId, zoneId), eq(aurionCausalCheckpoints.tick, tick))).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      worldId: row.worldId,
      zoneId: row.zoneId,
      tick: row.tick,
      snapshotHash: row.snapshotHash,
      state: JSON.parse(row.snapshotJson) as CanonicalZoneState,
      reconciled: row.reconciled,
    };
  }

  async getUnreconciledCheckpoints(limit: number): Promise<any[]> {
    const db = await getDb(); if (!db) return [];
    return db.select().from(aurionCausalCheckpoints).where(eq(aurionCausalCheckpoints.reconciled, 0)).orderBy(aurionCausalCheckpoints.tick).limit(limit);
  }

  async getDivergentCheckpoints(zoneId: string, limit: number): Promise<any[]> {
    const db = await getDb(); if (!db) return [];
    return db.select().from(aurionCausalCheckpoints).where(and(eq(aurionCausalCheckpoints.zoneId, zoneId), eq(aurionCausalCheckpoints.reconciled, -1))).orderBy(desc(aurionCausalCheckpoints.tick)).limit(limit);
  }

  async updateCheckpointReconciliation(id: string, status: number): Promise<void> {
    if (![1, -1].includes(status)) throw new Error("CHECKPOINT_RECONCILIATION_STATUS_INVALID");
    const db = await getDb(); if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    await db.update(aurionCausalCheckpoints).set({ reconciled: status, reconciledAt: operationalDate() }).where(eq(aurionCausalCheckpoints.id, id));
  }

  async getTicksInRange(zoneId: string, fromTick: number, toTick: number): Promise<RecordedTickEntry[]> {
    const db = await getDb(); if (!db) return [];
    const rows = await db.select().from(aurionCausalTickReceipts)
      .where(and(eq(aurionCausalTickReceipts.zoneId, zoneId), gt(aurionCausalTickReceipts.tick, fromTick - 1), lt(aurionCausalTickReceipts.tick, toTick + 1)))
      .orderBy(aurionCausalTickReceipts.tick);
    return rows.map(row => ({ receipt: this.mapReceipt(row), intents: row.inputJson ? JSON.parse(row.inputJson) as AurionZoneIntent[] : undefined }));
  }

  async archiveOldReceipts(zoneId: string, beforeTick: number): Promise<{ archivedCount: number; archiveId: string } | null> {
    const db = await getDb(); if (!db) return null;
    const rows = await db.select().from(aurionCausalTickReceipts).where(and(eq(aurionCausalTickReceipts.zoneId, zoneId), lt(aurionCausalTickReceipts.tick, beforeTick))).orderBy(aurionCausalTickReceipts.tick);
    if (rows.length === 0) return null;
    const startTick = rows[0].tick, endTick = rows[rows.length - 1].tick;
    const archiveId = `arch_${zoneId}_${startTick}_${endTick}`;
    const payload = rows.map(row => ({
      id: row.id, worldId: row.worldId, zoneId: row.zoneId, tick: row.tick, revision: row.revision,
      rulesetVersion: row.rulesetVersion, receiptSchema: row.receiptSchema,
      preStateHash: row.preStateHash, inputHash: row.inputHash,
      inputJson: row.inputJson, stageReceiptsJson: row.stageReceiptsJson,
      transitionHash: row.transitionHash, rngRootHash: row.rngRootHash,
      postStateHash: row.postStateHash, previousReceiptHash: row.previousReceiptHash, receiptHash: row.receiptHash,
    }));
    const payloadJson = stableJson(payload);
    const archiveHash = createHash("sha256").update(payloadJson, "utf8").digest("hex");
    const [existing] = await db.select().from(aurionCausalArchive).where(eq(aurionCausalArchive.id, archiveId)).limit(1);
    if (existing) {
      if (existing.archiveHash !== archiveHash || existing.payloadJson !== payloadJson) throw new Error(`CAUSAL_ARCHIVE_CONFLICT:${archiveId}`);
      return { archivedCount: rows.length, archiveId };
    }
    await db.insert(aurionCausalArchive).values({ id: archiveId, worldId: rows[0].worldId, zoneId, startTick, endTick, receiptCount: rows.length, archiveHash, payloadJson });
    return { archivedCount: rows.length, archiveId };
  }

  async getArchiveStats(zoneId: string): Promise<{ totalArchives: number; totalArchivedReceipts: number }> {
    const db = await getDb(); if (!db) return { totalArchives: 0, totalArchivedReceipts: 0 };
    const rows = await db.select({ count: sqlDrizzle<number>`count(*)`, totalReceipts: sqlDrizzle<number>`sum(receiptCount)` }).from(aurionCausalArchive).where(eq(aurionCausalArchive.zoneId, zoneId));
    return { totalArchives: Number(rows[0]?.count) || 0, totalArchivedReceipts: Number(rows[0]?.totalReceipts) || 0 };
  }

  async saveGlobalWorldProof(proof: GlobalWorldCanonicalState, proofHash: string, status: "VERIFIED" | "UNPROVABLE" | "CONFLICT" = "UNPROVABLE"): Promise<void> {
    const db = await getDb(); if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    const id = `gprf_${proof.worldId}_${proof.epoch}`;
    const globalProofJson = stableJson(proof);
    const [existing] = await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.id, id)).limit(1);
    if (existing) {
      if (existing.globalProofHash !== proofHash || existing.globalProofJson !== globalProofJson || existing.status !== status) throw new Error(`GLOBAL_PROOF_CONFLICT:${id}`);
      return;
    }
    await db.insert(aurionGlobalStateProofs).values({ id, worldId: proof.worldId, epoch: proof.epoch, globalProofHash: proofHash, globalProofJson, status });
  }

  async getLatestGlobalProof(worldId: string): Promise<GlobalWorldCanonicalState | null> {
    const db = await getDb(); if (!db) return null;
    const [row] = await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, worldId)).orderBy(desc(aurionGlobalStateProofs.epoch)).limit(1);
    return row ? JSON.parse(row.globalProofJson) as GlobalWorldCanonicalState : null;
  }

  private mapReceipt(row: any): AurionCausalTickReceipt {
    const common = {
      worldId: row.worldId,
      zoneId: row.zoneId,
      tick: row.tick,
      sourceRevision: row.revision,
      rulesetVersion: row.rulesetVersion,
      preStateHash: row.preStateHash,
      orderedIntentHash: row.inputHash,
      transitionHash: row.transitionHash,
      rngRootHash: row.rngRootHash,
      postStateHash: row.postStateHash,
      previousReceiptHash: row.previousReceiptHash,
      receiptHash: row.receiptHash,
    };

    let receipt: AurionCausalTickReceipt;
    if (row.receiptSchema === AURION_CAUSAL_TICK_SCHEMA_V1) {
      if (row.stageReceiptsJson !== null && row.stageReceiptsJson !== undefined) {
        throw new Error("CAUSAL_V1_STAGE_EVIDENCE_FORBIDDEN");
      }
      receipt = { schema: AURION_CAUSAL_TICK_SCHEMA_V1, ...common };
    } else if (row.receiptSchema === AURION_CAUSAL_TICK_SCHEMA_V2) {
      if (typeof row.stageReceiptsJson !== "string" || !row.stageReceiptsJson) {
        throw new Error("CAUSAL_V2_STAGE_EVIDENCE_MISSING");
      }
      let stages: AurionCausalStageReceipt[];
      try {
        stages = JSON.parse(row.stageReceiptsJson) as AurionCausalStageReceipt[];
      } catch {
        throw new Error("CAUSAL_V2_STAGE_EVIDENCE_INVALID_JSON");
      }
      if (
        !Array.isArray(stages) ||
        stages.length !== AURION_CAUSAL_STAGE_NAMES.length ||
        stages.some((stage, index) =>
          stage?.stageName !== AURION_CAUSAL_STAGE_NAMES[index] ||
          stage?.stageOrdinal !== index + 1
        )
      ) {
        throw new Error("CAUSAL_V2_STAGE_EVIDENCE_INVALID");
      }
      receipt = { schema: AURION_CAUSAL_TICK_SCHEMA_V2, ...common, stages };
    } else {
      throw new Error(`CAUSAL_RECEIPT_SCHEMA_UNSUPPORTED:${String(row.receiptSchema)}`);
    }

    if (computeReceiptHash(receipt) !== receipt.receiptHash) {
      throw new Error("CAUSAL_PERSISTED_RECEIPT_HASH_MISMATCH");
    }
    return receipt;
  }
}

export const globalCausalPersistence = new MariaDBCausalPersistenceAdapter();
