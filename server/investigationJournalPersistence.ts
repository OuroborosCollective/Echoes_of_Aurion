import { eq } from "drizzle-orm";
import {
  aurionInvestigationDeductionReceipts,
} from "../drizzle/schema";
import {
  investigationDeductionRequestSchema,
  type InvestigationDeductionRequest,
} from "../shared/investigationClientContract";
import {
  buildInvestigationGraph,
  validateDeductionIntent,
  verifyDeductionReceipt,
  type DeductionIntent,
  type DeductionReceipt,
} from "../shared/investigationGraphProtocol";
import {
  buildInvestigationJournal,
  type InvestigationJournal,
  type JournalGuidance,
} from "../shared/investigationJournalProtocol";
import { projectRumorClaims } from "../shared/rumorProjectionProtocol";
import { getDb } from "./db";
import { readConfirmedNpcInformationLineage } from "./npcInformationPropagation";
import { AURION_WORLD_CHECKPOINT_WORLD_ID } from "./worldCheckpointProtocol";
import type { NpcTransaction } from "./npcMultiMemoryPersistence";

type DeductionRow = typeof aurionInvestigationDeductionReceipts.$inferSelect;

function playerViewerId(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("INVESTIGATION_USER_ID_INVALID");
  // Keep account IDs in a distinct namespace from NPC IDs used by the #781 audience rules.
  return "player:" + userId;
}

async function buildContext(
  viewerId: string,
  guidance: JournalGuidance,
  transaction?: NpcTransaction,
) {
  const receipts = await readConfirmedNpcInformationLineage(AURION_WORLD_CHECKPOINT_WORLD_ID, transaction);
  const atIndex = receipts.reduce((latest, receipt) => Math.max(latest, receipt.logicalIndex), 0);
  const projection = projectRumorClaims({
    viewerId,
    worldId: AURION_WORLD_CHECKPOINT_WORLD_ID,
    atIndex,
    receipts,
    // Player-to-NPC trust is not currently modeled. No implicit trust grants LOCAL disclosure.
    viewerTrustBpsByActor: {},
  });
  const graph = buildInvestigationGraph({ projection });
  const journal = buildInvestigationJournal({ projection, graph, guidance });
  return { graph, journal };
}

/** Read only the authenticated user's deterministic, server-built journal. */
export async function readInvestigationJournalForUser(
  userId: number,
  guidance: JournalGuidance,
): Promise<InvestigationJournal> {
  return (await buildContext(playerViewerId(userId), guidance)).journal;
}

function decodeDeductionRow(row: DeductionRow): DeductionReceipt {
  let selectedClaimIds: unknown;
  try {
    selectedClaimIds = JSON.parse(row.selectedClaimIdsJson);
  } catch {
    throw new Error("DEDUCTION_RECEIPT_CORRUPT");
  }
  if (!Array.isArray(selectedClaimIds) || selectedClaimIds.some(value => typeof value !== "string") ||
      row.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID || row.result !== "validated") {
    throw new Error("DEDUCTION_RECEIPT_CORRUPT");
  }
  try {
    return verifyDeductionReceipt({
      id: row.id,
      actorId: row.actorId,
      deductionType: row.deductionType,
      selectedClaimIds,
      sourceProjectionHash: row.sourceProjectionHash,
      graphHash: row.graphHash,
      result: row.result,
      receiptHash: row.receiptHash,
    });
  } catch {
    throw new Error("DEDUCTION_RECEIPT_CORRUPT");
  }
}

/** Independent post-commit readback for the persisted deduction receipt. */
export async function readPersistedInvestigationDeductionReceipt(id: string): Promise<DeductionReceipt> {
  const db = await getDb();
  if (!db) throw new Error("INVESTIGATION_DATABASE_UNAVAILABLE");
  const row = (await db.select().from(aurionInvestigationDeductionReceipts)
    .where(eq(aurionInvestigationDeductionReceipts.id, id)).limit(1))[0];
  if (!row) throw new Error("DEDUCTION_RECEIPT_READBACK_REQUIRED");
  return decodeDeductionRow(row);
}

/**
 * Rebuild the current graph and validate the client intent in the same MariaDB
 * transaction that appends the receipt. A stale projection or actor mismatch
 * therefore writes nothing; no claim, NPC memory, reward, or world state changes.
 */
export async function validateAndRecordInvestigationDeduction(
  userId: number,
  request: InvestigationDeductionRequest,
): Promise<DeductionReceipt> {
  const viewerId = playerViewerId(userId);
  const selection = investigationDeductionRequestSchema.parse(request);
  const db = await getDb();
  if (!db) throw new Error("INVESTIGATION_DATABASE_UNAVAILABLE");

  const committed = await db.transaction(async tx => {
    const { graph } = await buildContext(viewerId, "plot", tx);
    const intent: DeductionIntent = {
      actorId: viewerId,
      selectedClaimIds: selection.selectedClaimIds,
      deductionType: selection.deductionType,
      sourceProjectionHash: selection.sourceProjectionHash,
    };
    const receipt = validateDeductionIntent({ intent, graph });
    const prior = (await tx.select().from(aurionInvestigationDeductionReceipts)
      .where(eq(aurionInvestigationDeductionReceipts.id, receipt.id)).limit(1))[0];
    if (prior) {
      const stored = decodeDeductionRow(prior);
      if (stored.receiptHash !== receipt.receiptHash) throw new Error("DEDUCTION_RECEIPT_IDEMPOTENCY_CONFLICT");
      return stored;
    }

    await tx.insert(aurionInvestigationDeductionReceipts).values({
      id: receipt.id,
      actorId: receipt.actorId,
      worldId: AURION_WORLD_CHECKPOINT_WORLD_ID,
      deductionType: receipt.deductionType,
      selectedClaimIdsJson: JSON.stringify(receipt.selectedClaimIds),
      sourceProjectionHash: receipt.sourceProjectionHash,
      graphHash: receipt.graphHash,
      result: receipt.result,
      receiptHash: receipt.receiptHash,
    });
    const row = (await tx.select().from(aurionInvestigationDeductionReceipts)
      .where(eq(aurionInvestigationDeductionReceipts.id, receipt.id)).limit(1))[0];
    if (!row) throw new Error("DEDUCTION_RECEIPT_READBACK_REQUIRED");
    const stored = decodeDeductionRow(row);
    if (stored.receiptHash !== receipt.receiptHash) throw new Error("DEDUCTION_RECEIPT_READBACK_MISMATCH");
    return stored;
  });

  const readback = await readPersistedInvestigationDeductionReceipt(committed.id);
  if (readback.receiptHash !== committed.receiptHash) throw new Error("DEDUCTION_RECEIPT_READBACK_MISMATCH");
  return readback;
}
