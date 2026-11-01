import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, lt, lte, sql as sqlDrizzle } from "drizzle-orm";
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
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import type { GlobalWorldCanonicalState } from "../../shared/aurionGlobalWorldContract";
import { operationalDate } from "../../shared/operationalClock";
import type { CanonicalZoneState } from "./zoneCanonicalState";
import type { AurionCombatVictoryEvidence } from "../../shared/aurionQuestContract";
import { drainCombatQuestProjections, persistAurionCombatVictoryEvidenceInTransaction } from "../aurionCombatVictoryPersistence";
import type { CausalPersistenceAdapter, PersistedCheckpoint, RecordedTickEntry } from "./tickRecorder";

import { archiveReceiptPayload, BoundedCausalArchivePacker, CAUSAL_ARCHIVE_PACKET_MAX_BYTES, causalArchiveHash } from "./archivePacking";

function stableJson(value: unknown): string { return JSON.stringify(value); }

// Replay-run IDs are persistence identities only; canonical run dimensions remain
// explicit columns. Keep the storage key bounded independently of world/zone names.
export function replayRunPersistenceId(): string {
  return `run_${randomUUID().replaceAll("-", "")}`;
}

function compactCausalPersistenceId(
  prefix: "rcpt" | "chk",
  identity: { worldId: string; zoneId: string; tick: number },
): string {
  const digest = createHash("sha256")
    .update(stableJson(identity), "utf8")
    .digest("hex")
    .slice(0, 56);
  return `${prefix}_${digest}`;
}

export function causalReceiptPersistenceId(
  receipt: Pick<AurionCausalTickReceipt, "worldId" | "zoneId" | "tick">,
): string {
  return compactCausalPersistenceId("rcpt", {
    worldId: receipt.worldId,
    zoneId: receipt.zoneId,
    tick: receipt.tick,
  });
}

export function causalCheckpointPersistenceId(
  worldId: string,
  zoneId: string,
  tick: number,
): string {
  return compactCausalPersistenceId("chk", { worldId, zoneId, tick });
}

export class MariaDBCausalPersistenceAdapter implements CausalPersistenceAdapter {
  async saveReceipt(receipt: AurionCausalTickReceipt, intents?: AurionZoneIntent[], combatVictories?: readonly AurionCombatVictoryEvidence[]): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    const id = causalReceiptPersistenceId(receipt);
    const inputJson = intents ? stableJson(intents) : null;
    const stageReceiptsJson = receipt.schema === AURION_CAUSAL_TICK_SCHEMA_V2 ? stableJson(receipt.stages) : null;
    // A confirmed tick must never survive without its combat evidence/outbox.
    await db.transaction(async tx => {
      try {
        await tx.insert(aurionCausalTickReceipts).values({
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
        // Natural-key readback preserves idempotency for receipts created before
        // compact hashed IDs were introduced. Historical primary keys are never rewritten.
        const [existing] = await tx.select().from(aurionCausalTickReceipts).where(and(
          eq(aurionCausalTickReceipts.worldId, receipt.worldId),
          eq(aurionCausalTickReceipts.zoneId, receipt.zoneId),
          eq(aurionCausalTickReceipts.tick, receipt.tick),
        )).limit(1);
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
      for (const victory of combatVictories ?? []) {
        await persistAurionCombatVictoryEvidenceInTransaction(tx, victory);
      }
    });
  }

  async projectPendingCombatVictories(): Promise<void> {
    const { adminQuestService } = await import("../routes/aurionQuestRouter");
    await drainCombatQuestProjections((userId, receiptId, instanceIds) =>
      adminQuestService.applyConfirmedCombatVictory(userId, receiptId, instanceIds));
  }

  async saveCheckpoint(zoneId: string, tick: number, stateHash: string, state: CanonicalZoneState): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    const id = causalCheckpointPersistenceId(state.worldId, zoneId, tick);
    const snapshotJson = stableJson(state);
    try {
      await db.insert(aurionCausalCheckpoints).values({ id, worldId: state.worldId, zoneId, tick, snapshotHash: stateHash, snapshotJson });
    } catch (error) {
      // Same rollout rule as receipts: match the canonical natural key so
      // checkpoints written with the historical textual ID remain idempotent.
      const [existing] = await db.select().from(aurionCausalCheckpoints).where(and(
        eq(aurionCausalCheckpoints.worldId, state.worldId),
        eq(aurionCausalCheckpoints.zoneId, zoneId),
        eq(aurionCausalCheckpoints.tick, tick),
      )).limit(1);
      if (!existing) throw error;
      if (existing.snapshotHash !== stateHash || existing.snapshotJson !== snapshotJson) throw new Error(`CAUSAL_CHECKPOINT_CONFLICT:${id}`);
    }
  }

  async saveReplayRun(run: { worldId: string; zoneId: string; fromTick: number; toTick: number; sourceRevision: string; runtimeRuleset: string; status: "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE"; firstDivergentStage?: string; expectedHash?: string; observedHash?: string }): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    await db.insert(aurionReplayRuns).values({
      id: replayRunPersistenceId(),
      worldId: run.worldId, zoneId: run.zoneId, fromTick: run.fromTick, toTick: run.toTick,
      sourceRevision: run.sourceRevision, runtimeRuleset: run.runtimeRuleset, status: run.status,
      firstDivergentStage: run.firstDivergentStage, expectedHash: run.expectedHash, observedHash: run.observedHash,
    });
  }

  async getLatestReceipt(zoneId: string): Promise<AurionCausalTickReceipt | null> {
    // A missing DB is not an empty receipt history: cold activation must fail
    // closed instead of registering a new tick-zero zone over durable receipts.
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    // Bind the complete world/zone prefix of the existing tick index. A zone-only
    // scan sorts the full receipt history and can exceed cold-recovery deadlines.
    const [row] = await db.select().from(aurionCausalTickReceipts).where(and(eq(aurionCausalTickReceipts.worldId, GLOBAL_WORLD_ID), eq(aurionCausalTickReceipts.zoneId, zoneId))).orderBy(desc(aurionCausalTickReceipts.tick)).limit(1);
    return row ? this.mapReceipt(row) : null;
  }

  async getRecordedTick(zoneId: string, tick: number): Promise<RecordedTickEntry | null> {
    const db = await getDb(); if (!db) return null;
    const [receiptRow] = await db.select().from(aurionCausalTickReceipts).where(and(eq(aurionCausalTickReceipts.worldId, GLOBAL_WORLD_ID), eq(aurionCausalTickReceipts.zoneId, zoneId), eq(aurionCausalTickReceipts.tick, tick))).limit(1);
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
      .where(and(eq(aurionCausalCheckpoints.worldId, GLOBAL_WORLD_ID), eq(aurionCausalCheckpoints.zoneId, zoneId), eq(aurionCausalCheckpoints.tick, tick))).limit(1);
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

  async getCheckpointAtOrBefore(zoneId: string, tick: number): Promise<PersistedCheckpoint | null> {
    if (!Number.isSafeInteger(tick) || tick < 0) return null;
    const db = await getDb(); if (!db) return null;
    const [row] = await db.select().from(aurionCausalCheckpoints)
      .where(and(eq(aurionCausalCheckpoints.worldId, GLOBAL_WORLD_ID), eq(aurionCausalCheckpoints.zoneId, zoneId), lte(aurionCausalCheckpoints.tick, tick)))
      .orderBy(desc(aurionCausalCheckpoints.tick))
      .limit(1);
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
      .where(and(eq(aurionCausalTickReceipts.worldId, GLOBAL_WORLD_ID), eq(aurionCausalTickReceipts.zoneId, zoneId), gt(aurionCausalTickReceipts.tick, fromTick - 1), lt(aurionCausalTickReceipts.tick, toTick + 1)))
      .orderBy(aurionCausalTickReceipts.tick);
    return rows.map(row => ({ receipt: this.mapReceipt(row), intents: row.inputJson ? JSON.parse(row.inputJson) as AurionZoneIntent[] : undefined }));
  }


  async archiveOldReceipts(zoneId: string, beforeTick: number): Promise<{ archivedCount: number; archiveId: string; archiveIds: string[]; startTick: number; endTick: number } | null> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    if (!Number.isSafeInteger(beforeTick) || beforeTick < 1) throw new Error("CAUSAL_ARCHIVE_THRESHOLD_INVALID");
    if (beforeTick === 1) return null;

    // Restrict the Node heap independent of the total number of receipts.
    // Transaction-scoped row locks preserve fail-closed archive serialization.
    const ARCHIVE_RECEIPT_PAGE_SIZE = 64;
    const ARCHIVE_MAX_IDS = 100_000;
    return db.transaction(async tx => {
      let sourceWorldId: string | null = null;
      let scannedUntil = 0;

      // Prove complete, contiguous source coverage without loading the entire
      // receipt prefix or JSON evidence into memory.
      while (scannedUntil < beforeTick - 1) {
        const page = await tx.select().from(aurionCausalTickReceipts)
          .where(and(
            eq(aurionCausalTickReceipts.zoneId, zoneId),
            gt(aurionCausalTickReceipts.tick, scannedUntil),
            lt(aurionCausalTickReceipts.tick, beforeTick),
          ))
          .orderBy(aurionCausalTickReceipts.tick)
          .limit(ARCHIVE_RECEIPT_PAGE_SIZE).for("update");
        if (page.length === 0) {
          if (scannedUntil === 0) return null;
          throw new Error("CAUSAL_ARCHIVE_SOURCE_COVERAGE_INCOMPLETE");
        }
        for (const row of page) {
          if (row.tick !== scannedUntil + 1 || (sourceWorldId !== null && row.worldId !== sourceWorldId)) {
            throw new Error("CAUSAL_ARCHIVE_SOURCE_COVERAGE_INCOMPLETE");
          }
          sourceWorldId ??= row.worldId;
          this.mapReceipt(row);
          scannedUntil = row.tick;
        }
      }

      if (sourceWorldId === null) return null;
      const archiveIds: string[] = [];
      const rememberArchiveId = (archiveId: string): void => {
        if (archiveIds.length >= ARCHIVE_MAX_IDS) throw new Error("CAUSAL_ARCHIVE_ID_COUNT_LIMIT");
        archiveIds.push(archiveId);
      };
      let coveredUntil = 0;
      let afterArchiveStart = 0;

      // Each historical archive packet is at most 60 KiB. Read/verify one
      // packet at a time, with separate bounded keyset pages of source rows.
      // Preexisting packet bytes and boundaries remain strictly immutable.
      while (true) {
        const existingPage = await tx.select().from(aurionCausalArchive)
          .where(and(
            eq(aurionCausalArchive.zoneId, zoneId),
            lt(aurionCausalArchive.startTick, beforeTick),
            gt(aurionCausalArchive.startTick, afterArchiveStart),
          ))
          .orderBy(aurionCausalArchive.startTick)
          .limit(1).for("update");
        if (existingPage.length === 0) break;
        const archive = existingPage[0];
        if (archive.worldId !== sourceWorldId || archive.startTick !== coveredUntil + 1
          || archive.endTick < archive.startTick) {
          throw new Error(`CAUSAL_ARCHIVE_COVERAGE_CONFLICT:${archive.id}`);
        }

        let verifiedUntil = archive.startTick - 1;
        let validatedCount = 0;
        const payloadParts: string[] = [];
        let verifiedBytes = 2;
        while (verifiedUntil < archive.endTick) {
          const page = await tx.select().from(aurionCausalTickReceipts)
            .where(and(
              eq(aurionCausalTickReceipts.zoneId, zoneId),
              gt(aurionCausalTickReceipts.tick, verifiedUntil),
              lte(aurionCausalTickReceipts.tick, archive.endTick),
            ))
            .orderBy(aurionCausalTickReceipts.tick)
            .limit(ARCHIVE_RECEIPT_PAGE_SIZE).for("update");
          if (page.length === 0) throw new Error(`CAUSAL_ARCHIVE_CONFLICT:${archive.id}`);
          for (const row of page) {
            if (row.tick !== verifiedUntil + 1 || row.worldId !== sourceWorldId) {
              throw new Error(`CAUSAL_ARCHIVE_CONFLICT:${archive.id}`);
            }
            this.mapReceipt(row);
            const json = stableJson(archiveReceiptPayload(row));
            verifiedBytes += Buffer.byteLength(json, "utf8") + (validatedCount ? 1 : 0);
            if (verifiedBytes > CAUSAL_ARCHIVE_PACKET_MAX_BYTES) {
              throw new Error(`CAUSAL_ARCHIVE_CONFLICT:${archive.id}`);
            }
            payloadParts.push(json);
            verifiedUntil = row.tick;
            validatedCount += 1;
          }
        }
        const expected = `[${payloadParts.join(",")}]`;
        if (archive.receiptCount !== validatedCount ||
          archive.endTick !== archive.startTick + validatedCount - 1 ||
          archive.payloadJson !== expected || archive.archiveHash !== causalArchiveHash(expected)) {
          throw new Error(`CAUSAL_ARCHIVE_CONFLICT:${archive.id}`);
        }
        rememberArchiveId(archive.id);
        coveredUntil = archive.endTick;
        afterArchiveStart = archive.startTick;
      }

      // Commit only the uncovered suffix, keeping at most one uncommitted
      // packet plus one 64-receipt page resident in Node.
      const packer = new BoundedCausalArchivePacker();
      let lastSourceTick = coveredUntil;
      let packetStartTick = coveredUntil + 1;
      let packetLastTick = coveredUntil;
      const persistPacket = async (payloadJson: string, startTick: number, endTick: number): Promise<void> => {
        const archiveId = `arch_${zoneId}_${startTick}_${endTick}`;
        const archiveHash = causalArchiveHash(payloadJson);
        const receiptCount = endTick - startTick + 1;
        await tx.insert(aurionCausalArchive).values({
          id: archiveId, worldId: sourceWorldId!, zoneId, startTick, endTick, receiptCount,
          archiveHash, payloadJson,
        });
        const [readback] = await tx.select().from(aurionCausalArchive)
          .where(eq(aurionCausalArchive.id, archiveId)).limit(1);
        if (!readback || readback.archiveHash !== archiveHash || readback.payloadJson !== payloadJson
          || readback.receiptCount !== receiptCount || readback.startTick !== startTick || readback.endTick !== endTick) {
          throw new Error(`CAUSAL_ARCHIVE_READBACK_MISMATCH:${archiveId}`);
        }
        rememberArchiveId(archiveId);
        coveredUntil = endTick;
      };
      while (lastSourceTick < beforeTick - 1) {
        const page = await tx.select().from(aurionCausalTickReceipts)
          .where(and(
            eq(aurionCausalTickReceipts.zoneId, zoneId),
            gt(aurionCausalTickReceipts.tick, lastSourceTick),
            lt(aurionCausalTickReceipts.tick, beforeTick),
          ))
          .orderBy(aurionCausalTickReceipts.tick)
          .limit(ARCHIVE_RECEIPT_PAGE_SIZE).for("update");
        if (page.length === 0) throw new Error("CAUSAL_ARCHIVE_SOURCE_COVERAGE_INCOMPLETE");
        for (const row of page) {
          if (row.tick !== lastSourceTick + 1 || row.worldId !== sourceWorldId) {
            throw new Error("CAUSAL_ARCHIVE_SOURCE_COVERAGE_INCOMPLETE");
          }
          this.mapReceipt(row);
          const completePacket = packer.push(archiveReceiptPayload(row));
          if (completePacket !== null) {
            await persistPacket(completePacket, packetStartTick, packetLastTick);
            packetStartTick = row.tick;
          }
          packetLastTick = row.tick;
          lastSourceTick = row.tick;
        }
      }
      const finalPacket = packer.finish();
      if (finalPacket !== null) await persistPacket(finalPacket, packetStartTick, packetLastTick);
      if (coveredUntil < beforeTick - 1) throw new Error("CAUSAL_ARCHIVE_CHECKPOINT_NOT_COVERED");
      return {
        archivedCount: coveredUntil,
        archiveId: archiveIds[archiveIds.length - 1],
        archiveIds,
        startTick: 1,
        endTick: coveredUntil,
      };
    });
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
