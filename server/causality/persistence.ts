import { eq, and, desc, gt, lt, gte, lte, sql as sqlDrizzle } from "drizzle-orm";
import { getDb } from "../db";
import { createHash } from "node:crypto";
import { aurionGlobalWorldStates } from "../../drizzle/schema";
import { aurionCausalTickReceipts, aurionCausalCheckpoints, aurionReplayRuns, aurionCausalArchive, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import { GlobalWorldCanonicalState } from "../../shared/aurionGlobalWorldContract";
import { CanonicalZoneState } from "./zoneCanonicalState";
import { CausalPersistenceAdapter, RecordedTickEntry } from "./tickRecorder";

export class MariaDBCausalPersistenceAdapter implements CausalPersistenceAdapter {
  async saveReceipt(receipt: AurionCausalTickReceipt, intents?: AurionZoneIntent[]): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(aurionCausalTickReceipts).values({
      id: `rcpt_${receipt.worldId}_${receipt.zoneId}_${receipt.tick}`,
      worldId: receipt.worldId,
      zoneId: receipt.zoneId,
      tick: receipt.tick,
      revision: receipt.sourceRevision,
      rulesetVersion: receipt.rulesetVersion,
      preStateHash: receipt.preStateHash,
      inputHash: receipt.orderedIntentHash,
      inputJson: intents ? JSON.stringify(intents) : null,
      transitionHash: receipt.transitionHash,
      rngRootHash: receipt.rngRootHash,
      postStateHash: receipt.postStateHash,
      previousReceiptHash: receipt.previousReceiptHash,
      receiptHash: receipt.receiptHash,
    }).onDuplicateKeyUpdate({
      set: {
        receiptHash: receipt.receiptHash,
        inputJson: intents ? JSON.stringify(intents) : null,
      }
    });
  }

  async saveCheckpoint(zoneId: string, tick: number, stateHash: string, state: CanonicalZoneState): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(aurionCausalCheckpoints).values({
      id: `chk_${state.worldId}_${zoneId}_${tick}`,
      worldId: state.worldId,
      zoneId: zoneId,
      tick: tick,
      snapshotHash: stateHash,
      snapshotJson: JSON.stringify(state),
    }).onDuplicateKeyUpdate({
      set: {
        snapshotHash: stateHash,
        snapshotJson: JSON.stringify(state),
      }
    });
  }

  async saveReplayRun(run: {
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
  }): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(aurionReplayRuns).values({
      id: `run_${run.worldId}_${run.zoneId}_${run.fromTick}_${run.toTick}_${Date.now()}`,
      worldId: run.worldId,
      zoneId: run.zoneId,
      fromTick: run.fromTick,
      toTick: run.toTick,
      sourceRevision: run.sourceRevision,
      runtimeRuleset: run.runtimeRuleset,
      status: run.status,
      firstDivergentStage: run.firstDivergentStage,
      expectedHash: run.expectedHash,
      observedHash: run.observedHash,
    });
  }

  async getLatestReceipt(zoneId: string): Promise<AurionCausalTickReceipt | null> {
    const db = await getDb();
    if (!db) return null;

    const results = await db.select()
      .from(aurionCausalTickReceipts)
      .where(eq(aurionCausalTickReceipts.zoneId, zoneId))
      .orderBy(desc(aurionCausalTickReceipts.tick))
      .limit(1);

    if (results.length === 0) return null;

    const r = results[0];
    return this.mapReceipt(r);
  }

  async getRecordedTick(zoneId: string, tick: number): Promise<RecordedTickEntry | null> {
    const db = await getDb();
    if (!db) return null;

    const [receiptRow] = await db.select()
      .from(aurionCausalTickReceipts)
      .where(and(eq(aurionCausalTickReceipts.zoneId, zoneId), eq(aurionCausalTickReceipts.tick, tick)))
      .limit(1);

    if (!receiptRow) return null;

    // Try to find a pre-state checkpoint if tick is 0 or if we have one
    let preState: CanonicalZoneState | undefined;
    const [checkpointRow] = await db.select()
      .from(aurionCausalCheckpoints)
      .where(and(eq(aurionCausalCheckpoints.zoneId, zoneId), eq(aurionCausalCheckpoints.tick, tick - 1)))
      .limit(1);

    if (checkpointRow) {
      preState = JSON.parse(checkpointRow.snapshotJson);
    }

    const intents = receiptRow.inputJson ? JSON.parse(receiptRow.inputJson) : undefined;

    return {
      receipt: this.mapReceipt(receiptRow),
      preState,
      intents,
    };
  }

  async getUnreconciledCheckpoints(limit: number): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(aurionCausalCheckpoints)
      .where(eq(aurionCausalCheckpoints.reconciled, 0))
      .limit(limit);
  }

  async updateCheckpointReconciliation(id: string, status: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(aurionCausalCheckpoints)
      .set({ 
        reconciled: status,
        reconciledAt: new Date()
      })
      .where(eq(aurionCausalCheckpoints.id, id));
  }

  async getTicksInRange(zoneId: string, fromTick: number, toTick: number): Promise<RecordedTickEntry[]> {
    const db = await getDb();
    if (!db) return [];

    // Let's use a proper range query
    const results = await db.execute(sqlDrizzle`
      SELECT * FROM aurionCausalTickReceipts 
      WHERE zoneId = ${zoneId} AND tick >= ${fromTick} AND tick <= ${toTick} 
      ORDER BY tick ASC
    `);

    const entries: RecordedTickEntry[] = [];
    const [rows] = results as any;
    for (const r of rows || []) {
      entries.push({
        receipt: this.mapReceipt(r),
        intents: r.inputJson ? JSON.parse(r.inputJson) : undefined
      });
    }

    return entries;
  }
  
  async getDivergentCheckpoints(zoneId: string, limit: number): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(aurionCausalCheckpoints)
      .where(and(eq(aurionCausalCheckpoints.zoneId, zoneId), eq(aurionCausalCheckpoints.reconciled, -1)))
      .orderBy(desc(aurionCausalCheckpoints.tick))
      .limit(limit);
  }

  async repairZone(zoneId: string, checkpointId: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const [checkpoint] = await db.select()
      .from(aurionCausalCheckpoints)
      .where(eq(aurionCausalCheckpoints.id, checkpointId))
      .limit(1);

    if (!checkpoint || checkpoint.reconciled !== 1) {
      throw new Error("Cannot repair from unreconciled or missing checkpoint.");
    }

    await db.update(aurionGlobalWorldStates)
      .set({
        snapshotJson: checkpoint.snapshotJson,
        snapshotHash: checkpoint.snapshotHash,
        epoch: checkpoint.tick,
        updatedAt: new Date()
      })
      .where(eq(aurionGlobalWorldStates.worldId, checkpoint.worldId));

    // We do NOT delete newer receipts or checkpoints.
    // The chain of evidence is append-only. New ticks after the repair
    // will just branch from the restored checkpoint.
  }

  async archiveOldReceipts(zoneId: string, beforeTick: number): Promise<{ archivedCount: number; archiveId: string } | null> {
    const db = await getDb();
    if (!db) return null;

    // 1. Get verified receipts before target tick
    const receiptsToArchive = await db.select()
      .from(aurionCausalTickReceipts)
      .where(and(
        eq(aurionCausalTickReceipts.zoneId, zoneId),
        lt(aurionCausalTickReceipts.tick, beforeTick)
      ))
      .orderBy(aurionCausalTickReceipts.tick);

    if (receiptsToArchive.length === 0) return null;

    const startTick = receiptsToArchive[0].tick;
    const endTick = receiptsToArchive[receiptsToArchive.length - 1].tick;
    const archiveId = `arch_${zoneId}_${startTick}_${endTick}`;

    // 2. Prepare payload (full lossless summary)
    const payload = receiptsToArchive.map(r => ({
      tick: r.tick,
      receiptHash: r.receiptHash,
      preStateHash: r.preStateHash,
      inputHash: r.inputHash,
      inputJson: r.inputJson,
      transitionHash: r.transitionHash,
      rngRootHash: r.rngRootHash,
      postStateHash: r.postStateHash,
      previousReceiptHash: r.previousReceiptHash,
      rulesetVersion: r.rulesetVersion,
      revision: r.revision
    }));

    const payloadJson = JSON.stringify(payload);
    const archiveHash = createHash('sha256').update(payloadJson).digest('hex');

    // 3. Save to archive
    await db.insert(aurionCausalArchive).values({
      id: archiveId,
      worldId: receiptsToArchive[0].worldId,
      zoneId: zoneId,
      startTick,
      endTick,
      receiptCount: receiptsToArchive.length,
      archiveHash,
      payloadJson,
    });

    // 4. Delete from hot storage
    await db.delete(aurionCausalTickReceipts)
      .where(and(
        eq(aurionCausalTickReceipts.zoneId, zoneId),
        and(
          gte(aurionCausalTickReceipts.tick, startTick),
          lte(aurionCausalTickReceipts.tick, endTick)
        )
      ));

    return { archivedCount: receiptsToArchive.length, archiveId };
  }

  async getArchiveStats(zoneId: string): Promise<{ totalArchives: number; totalArchivedReceipts: number }> {
    const db = await getDb();
    if (!db) return { totalArchives: 0, totalArchivedReceipts: 0 };

    const results = await db.select({
      count: sqlDrizzle<number>`count(*)`,
      totalReceipts: sqlDrizzle<number>`sum(receiptCount)`
    })
    .from(aurionCausalArchive)
    .where(eq(aurionCausalArchive.zoneId, zoneId));

    if (results.length === 0) return { totalArchives: 0, totalArchivedReceipts: 0 };
    return {
      totalArchives: Number(results[0].count) || 0,
      totalArchivedReceipts: Number(results[0].totalReceipts) || 0,
    };
  }

  async saveGlobalWorldProof(proof: GlobalWorldCanonicalState, proofHash: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(aurionGlobalStateProofs).values({
      id: `gprf_${proof.worldId}_${proof.epoch}`,
      worldId: proof.worldId,
      epoch: proof.epoch,
      globalProofHash: proofHash,
      globalProofJson: JSON.stringify(proof),
      status: "VERIFIED",
    }).onDuplicateKeyUpdate({
      set: {
        globalProofHash: proofHash,
        globalProofJson: JSON.stringify(proof),
      }
    });
  }

  async getLatestGlobalProof(worldId: string): Promise<GlobalWorldCanonicalState | null> {
    const db = await getDb();
    if (!db) return null;

    const results = await db.select()
      .from(aurionGlobalStateProofs)
      .where(eq(aurionGlobalStateProofs.worldId, worldId))
      .orderBy(desc(aurionGlobalStateProofs.epoch))
      .limit(1);

    if (results.length === 0) return null;
    return JSON.parse(results[0].globalProofJson);
  }

  private mapReceipt(r: any): AurionCausalTickReceipt {
    return {
      schema: "aurion.causal.tick.v1",
      worldId: r.worldId,
      zoneId: r.zoneId,
      tick: r.tick,
      sourceRevision: r.revision,
      rulesetVersion: r.rulesetVersion,
      preStateHash: r.preStateHash,
      orderedIntentHash: r.inputHash,
      transitionHash: r.transitionHash,
      rngRootHash: r.rngRootHash,
      postStateHash: r.postStateHash,
      previousReceiptHash: r.previousReceiptHash,
      receiptHash: r.receiptHash,
    };
  }
}

export const globalCausalPersistence = new MariaDBCausalPersistenceAdapter();
