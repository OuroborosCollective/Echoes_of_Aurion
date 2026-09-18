import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  aurionCausalTickReceipts,
  aurionCrossZoneTransferReceipts,
  aurionCrossZoneTransfers,
  aurionEntityZoneOwnership,
} from "../../drizzle/aurionCausalitySchema";
import {
  advanceCrossZoneHandover,
  computeTargetAcceptanceReceiptHash,
  prepareCrossZoneHandover,
  verifyCrossZoneHandover,
  type AurionCrossZoneHandoverStatus,
  type AurionCrossZoneHandoverV2,
  type AurionCrossZonePayload,
} from "../../shared/aurionCrossZoneHandoverContract";
import { operationalDate } from "../../shared/operationalClock";
import { getDb } from "../db";
import type { CanonicalTransferPayload } from "./zoneCanonicalState";

export interface CrossZoneTransferRecord {
  id: string;
  sourceWorldId: string;
  sourceZoneId: string;
  sourceTick: number;
  targetWorldId: string;
  targetZoneId: string;
  targetTick?: number;
  transferHash: string;
  payload: CanonicalTransferPayload;
  status: "PENDING" | "CONSUMED" | "REJECTED";
}

export type AurionEntityZoneOwner = Readonly<{
  entityId: string;
  worldId: string;
  zoneId: string;
  mode: "ACTIVE" | "FROZEN";
  activeTransferId: string | null;
  generation: number;
}>;

export type CrossZoneTransferExplanation = Readonly<{
  transfer: AurionCrossZoneHandoverV2;
  owner: AurionEntityZoneOwner | null;
  receipts: readonly AurionCrossZoneHandoverV2[];
  chainValid: boolean;
  ownerInvariantValid: boolean;
  resumableAction: "FREEZE_SOURCE" | "AWAIT_TARGET" | "FINALIZE" | "NONE";
}>;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const V2_STATES = new Set<AurionCrossZoneHandoverStatus>([
  "PREPARED",
  "SOURCE_FROZEN",
  "TARGET_ACCEPTED",
  "SOURCE_FINALIZED",
  "COMMITTED",
  "REJECTED",
  "EXPIRED",
  "UNPROVABLE",
]);

function ownerFromRow(row: typeof aurionEntityZoneOwnership.$inferSelect): AurionEntityZoneOwner {
  return Object.freeze({
    entityId: row.entityId,
    worldId: row.worldId,
    zoneId: row.zoneId,
    mode: row.mode,
    activeTransferId: row.activeTransferId,
    generation: row.generation,
  });
}

function parseV2TransferRow(row: typeof aurionCrossZoneTransfers.$inferSelect): AurionCrossZoneHandoverV2 {
  if (
    row.handoverVersion !== 2 ||
    !row.entityId ||
    !row.sourceReceiptHash ||
    !row.sourceStateHash ||
    !row.payloadHash ||
    !row.transferReceiptHash ||
    !V2_STATES.has(row.status as AurionCrossZoneHandoverStatus)
  ) {
    throw new Error("CROSS_ZONE_V2_ROW_UNPROVABLE");
  }
  const payload = JSON.parse(row.payloadJson) as AurionCrossZonePayload;
  const receipt: AurionCrossZoneHandoverV2 = {
    schema: "aurion.cross-zone-handover.v2",
    transferId: row.id,
    entityId: row.entityId,
    sourceWorldId: row.sourceWorldId,
    sourceZoneId: row.sourceZoneId,
    sourceTick: row.sourceTick,
    sourceReceiptHash: row.sourceReceiptHash,
    sourceStateHash: row.sourceStateHash,
    targetWorldId: row.targetWorldId,
    targetZoneId: row.targetZoneId,
    payload,
    payloadHash: row.payloadHash,
    targetAcceptedTick: row.targetAcceptedTick,
    targetReceiptHash: row.targetReceiptHash,
    status: row.status as AurionCrossZoneHandoverStatus,
    previousTransferReceiptHash: row.previousTransferReceiptHash,
    transferReceiptHash: row.transferReceiptHash,
  };
  if (!verifyCrossZoneHandover(receipt)) throw new Error("CROSS_ZONE_V2_ROW_HASH_MISMATCH");
  return Object.freeze(receipt);
}

function transferValues(receipt: AurionCrossZoneHandoverV2) {
  return {
    handoverVersion: 2,
    entityId: receipt.entityId,
    sourceWorldId: receipt.sourceWorldId,
    sourceZoneId: receipt.sourceZoneId,
    sourceTick: receipt.sourceTick,
    sourceReceiptHash: receipt.sourceReceiptHash,
    sourceStateHash: receipt.sourceStateHash,
    targetWorldId: receipt.targetWorldId,
    targetZoneId: receipt.targetZoneId,
    targetTick: receipt.targetAcceptedTick,
    targetAcceptedTick: receipt.targetAcceptedTick,
    targetReceiptHash: receipt.targetReceiptHash,
    transferHash: receipt.payloadHash,
    payloadHash: receipt.payloadHash,
    payloadJson: JSON.stringify(receipt.payload),
    transferReceiptHash: receipt.transferReceiptHash,
    previousTransferReceiptHash: receipt.previousTransferReceiptHash,
    status: receipt.status,
  } as const;
}

async function lockedTransfer(tx: DatabaseTransaction, transferId: string) {
  return (await tx.select().from(aurionCrossZoneTransfers)
    .where(eq(aurionCrossZoneTransfers.id, transferId)).limit(1).for("update"))[0] ?? null;
}

async function lockedOwner(tx: DatabaseTransaction, entityId: string) {
  return (await tx.select().from(aurionEntityZoneOwnership)
    .where(eq(aurionEntityZoneOwnership.entityId, entityId)).limit(1).for("update"))[0] ?? null;
}

async function nextReceiptSequence(tx: DatabaseTransaction, transferId: string): Promise<number> {
  const [latest] = await tx.select({ sequence: aurionCrossZoneTransferReceipts.sequence })
    .from(aurionCrossZoneTransferReceipts)
    .where(eq(aurionCrossZoneTransferReceipts.transferId, transferId))
    .orderBy(desc(aurionCrossZoneTransferReceipts.sequence))
    .limit(1)
    .for("update");
  return (latest?.sequence ?? 0) + 1;
}

async function appendTransition(
  tx: DatabaseTransaction,
  receipt: AurionCrossZoneHandoverV2,
  sequence?: number,
): Promise<number> {
  const resolvedSequence = sequence ?? await nextReceiptSequence(tx, receipt.transferId);
  await tx.insert(aurionCrossZoneTransferReceipts).values({
    id: `xfrc_${receipt.transferId}_${String(resolvedSequence).padStart(4, "0")}`,
    transferId: receipt.transferId,
    sequence: resolvedSequence,
    entityId: receipt.entityId,
    status: receipt.status,
    transferReceiptHash: receipt.transferReceiptHash,
    previousTransferReceiptHash: receipt.previousTransferReceiptHash,
    receiptJson: JSON.stringify(receipt),
  });
  return resolvedSequence;
}

async function updateCurrentTransfer(tx: DatabaseTransaction, receipt: AurionCrossZoneHandoverV2): Promise<void> {
  await tx.update(aurionCrossZoneTransfers).set(transferValues(receipt))
    .where(eq(aurionCrossZoneTransfers.id, receipt.transferId));
}

function sameTransferIdentity(left: AurionCrossZoneHandoverV2, right: AurionCrossZoneHandoverV2): boolean {
  return left.entityId === right.entityId &&
    left.sourceWorldId === right.sourceWorldId &&
    left.sourceZoneId === right.sourceZoneId &&
    left.sourceTick === right.sourceTick &&
    left.sourceReceiptHash === right.sourceReceiptHash &&
    left.sourceStateHash === right.sourceStateHash &&
    left.targetWorldId === right.targetWorldId &&
    left.targetZoneId === right.targetZoneId &&
    left.payloadHash === right.payloadHash;
}

export class AurionCrossZoneSynchronizationService {
  /**
   * Legacy V1 registration remains readable for historical evidence. V2 handover
   * uses the explicit methods below and never treats PENDING/CONSUMED as owner truth.
   */
  async initiateTransfer(
    sourceWorldId: string,
    sourceZoneId: string,
    sourceTick: number,
    targetWorldId: string,
    targetZoneId: string,
    payload: CanonicalTransferPayload
  ): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const payloadJson = JSON.stringify(payload);
    const transferHash = createHash("sha256").update(payloadJson).digest("hex");
    const id = `xfer_${sourceZoneId}_${targetZoneId}_${sourceTick}_${payload.entityId}`;
    await db.insert(aurionCrossZoneTransfers).values({
      id,
      handoverVersion: 1,
      sourceWorldId,
      sourceZoneId,
      sourceTick,
      targetWorldId,
      targetZoneId,
      transferHash,
      payloadJson,
      status: "PENDING",
    }).onDuplicateKeyUpdate({ set: { transferHash, payloadJson } });
    return id;
  }

  async getPendingInboundTransfers(worldId: string, zoneId: string): Promise<CrossZoneTransferRecord[]> {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(aurionCrossZoneTransfers).where(and(
      eq(aurionCrossZoneTransfers.targetWorldId, worldId),
      eq(aurionCrossZoneTransfers.targetZoneId, zoneId),
      eq(aurionCrossZoneTransfers.status, "PENDING"),
    ));
    return rows.map(row => ({
      id: row.id,
      sourceWorldId: row.sourceWorldId,
      sourceZoneId: row.sourceZoneId,
      sourceTick: row.sourceTick,
      targetWorldId: row.targetWorldId,
      targetZoneId: row.targetZoneId,
      targetTick: row.targetTick ?? undefined,
      transferHash: row.transferHash,
      payload: JSON.parse(row.payloadJson) as CanonicalTransferPayload,
      status: row.status as "PENDING" | "CONSUMED" | "REJECTED",
    }));
  }

  async consumeTransfers(transferIds: string[], targetTick: number): Promise<void> {
    if (transferIds.length === 0) return;
    const db = await getDb();
    if (!db) return;
    await db.update(aurionCrossZoneTransfers).set({
      status: "CONSUMED",
      targetTick,
      consumedAt: operationalDate(),
    }).where(and(
      eq(aurionCrossZoneTransfers.handoverVersion, 1),
      isNull(aurionCrossZoneTransfers.consumedAt),
      inArray(aurionCrossZoneTransfers.id, transferIds),
    ));
  }

  async registerAuthoritativeOwner(input: {
    entityId: string;
    worldId: string;
    zoneId: string;
  }): Promise<AurionEntityZoneOwner> {
    if (!input.entityId.trim() || !input.worldId.trim() || !input.zoneId.trim()) {
      throw new Error("CROSS_ZONE_OWNER_IDENTITY_INVALID");
    }
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    return db.transaction(async tx => {
      await tx.insert(aurionEntityZoneOwnership).values({
        entityId: input.entityId,
        worldId: input.worldId,
        zoneId: input.zoneId,
        mode: "ACTIVE",
        activeTransferId: null,
        generation: 0,
      }).onDuplicateKeyUpdate({ set: { entityId: input.entityId } });
      const row = await lockedOwner(tx, input.entityId);
      if (!row) throw new Error("CROSS_ZONE_OWNER_REGISTRATION_FAILED");
      if (row.worldId !== input.worldId || row.zoneId !== input.zoneId) {
        throw new Error("CROSS_ZONE_OWNER_CONFLICT");
      }
      if (row.activeTransferId !== null || row.mode !== "ACTIVE") {
        throw new Error("CROSS_ZONE_OWNER_TRANSFER_IN_PROGRESS");
      }
      return ownerFromRow(row);
    });
  }

  async prepareHandover(input: {
    entityId: string;
    sourceWorldId: string;
    sourceZoneId: string;
    sourceTick: number;
    sourceReceiptHash: string;
    sourceStateHash: string;
    targetWorldId: string;
    targetZoneId: string;
    payload: AurionCrossZonePayload;
  }): Promise<AurionCrossZoneHandoverV2> {
    const prepared = prepareCrossZoneHandover(input);
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    return db.transaction(async tx => {
      const existingRow = await lockedTransfer(tx, prepared.transferId);
      if (existingRow) {
        const existing = parseV2TransferRow(existingRow);
        if (!sameTransferIdentity(existing, prepared)) throw new Error("CROSS_ZONE_TRANSFER_IDEMPOTENCY_CONFLICT");
        return existing;
      }

      const [sourceReceipt] = await tx.select().from(aurionCausalTickReceipts).where(and(
        eq(aurionCausalTickReceipts.worldId, input.sourceWorldId),
        eq(aurionCausalTickReceipts.zoneId, input.sourceZoneId),
        eq(aurionCausalTickReceipts.tick, input.sourceTick),
        eq(aurionCausalTickReceipts.receiptHash, input.sourceReceiptHash),
      )).limit(1).for("update");
      if (!sourceReceipt || sourceReceipt.postStateHash !== input.sourceStateHash) {
        throw new Error("CROSS_ZONE_SOURCE_RECEIPT_UNPROVABLE");
      }

      const owner = await lockedOwner(tx, input.entityId);
      if (!owner) throw new Error("CROSS_ZONE_OWNER_REQUIRED");
      if (owner.worldId !== input.sourceWorldId || owner.zoneId !== input.sourceZoneId) {
        throw new Error("CROSS_ZONE_SOURCE_NOT_OWNER");
      }
      // A concurrent identical prepare may have committed while this transaction
      // waited on the per-entity ownership lock. Re-read after the lock so it is
      // idempotent instead of surfacing a duplicate-key race.
      const concurrentRow = await lockedTransfer(tx, prepared.transferId);
      if (concurrentRow) {
        const concurrent = parseV2TransferRow(concurrentRow);
        if (!sameTransferIdentity(concurrent, prepared)) throw new Error("CROSS_ZONE_TRANSFER_IDEMPOTENCY_CONFLICT");
        return concurrent;
      }
      if (owner.activeTransferId && owner.activeTransferId !== prepared.transferId) {
        throw new Error("CROSS_ZONE_ENTITY_TRANSFER_IN_PROGRESS");
      }
      if (owner.mode !== "ACTIVE") throw new Error("CROSS_ZONE_SOURCE_NOT_ACTIVE");

      await tx.update(aurionEntityZoneOwnership).set({ activeTransferId: prepared.transferId })
        .where(eq(aurionEntityZoneOwnership.entityId, input.entityId));
      await tx.insert(aurionCrossZoneTransfers).values({ id: prepared.transferId, ...transferValues(prepared) });
      await appendTransition(tx, prepared, 1);
      return prepared;
    });
  }

  async freezeSource(transferId: string): Promise<AurionCrossZoneHandoverV2> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    return db.transaction(async tx => {
      const row = await lockedTransfer(tx, transferId);
      if (!row) throw new Error("CROSS_ZONE_TRANSFER_NOT_FOUND");
      const current = parseV2TransferRow(row);
      if (["SOURCE_FROZEN", "TARGET_ACCEPTED", "SOURCE_FINALIZED", "COMMITTED"].includes(current.status)) return current;
      if (current.status !== "PREPARED") throw new Error(`CROSS_ZONE_FREEZE_INVALID:${current.status}`);
      const owner = await lockedOwner(tx, current.entityId);
      if (!owner || owner.worldId !== current.sourceWorldId || owner.zoneId !== current.sourceZoneId ||
          owner.activeTransferId !== current.transferId || owner.mode !== "ACTIVE") {
        throw new Error("CROSS_ZONE_SOURCE_OWNER_MISMATCH");
      }
      const next = advanceCrossZoneHandover(current, "SOURCE_FROZEN");
      await tx.update(aurionEntityZoneOwnership).set({ mode: "FROZEN" })
        .where(eq(aurionEntityZoneOwnership.entityId, current.entityId));
      await updateCurrentTransfer(tx, next);
      await appendTransition(tx, next);
      return next;
    });
  }

  async acceptTarget(transferId: string, targetAcceptedTick: number): Promise<AurionCrossZoneHandoverV2> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    return db.transaction(async tx => {
      const row = await lockedTransfer(tx, transferId);
      if (!row) throw new Error("CROSS_ZONE_TRANSFER_NOT_FOUND");
      const current = parseV2TransferRow(row);
      const targetReceiptHash = computeTargetAcceptanceReceiptHash({
        transferId: current.transferId,
        entityId: current.entityId,
        sourceReceiptHash: current.sourceReceiptHash,
        payloadHash: current.payloadHash,
        targetWorldId: current.targetWorldId,
        targetZoneId: current.targetZoneId,
        targetAcceptedTick,
      });
      if (["TARGET_ACCEPTED", "SOURCE_FINALIZED", "COMMITTED"].includes(current.status)) {
        if (current.targetAcceptedTick !== targetAcceptedTick || current.targetReceiptHash !== targetReceiptHash) {
          throw new Error("CROSS_ZONE_DUPLICATE_ACCEPT_CONFLICT");
        }
        return current;
      }
      if (current.status !== "SOURCE_FROZEN") throw new Error(`CROSS_ZONE_TARGET_ACCEPT_INVALID:${current.status}`);
      const owner = await lockedOwner(tx, current.entityId);
      if (!owner || owner.worldId !== current.sourceWorldId || owner.zoneId !== current.sourceZoneId ||
          owner.mode !== "FROZEN" || owner.activeTransferId !== current.transferId) {
        throw new Error("CROSS_ZONE_SOURCE_FREEZE_UNPROVABLE");
      }
      const next = advanceCrossZoneHandover(current, "TARGET_ACCEPTED", { targetAcceptedTick, targetReceiptHash });
      await updateCurrentTransfer(tx, next);
      await appendTransition(tx, next);
      return next;
    });
  }

  async finalizeAndCommit(transferId: string): Promise<AurionCrossZoneHandoverV2> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    return db.transaction(async tx => {
      const row = await lockedTransfer(tx, transferId);
      if (!row) throw new Error("CROSS_ZONE_TRANSFER_NOT_FOUND");
      const current = parseV2TransferRow(row);
      if (current.status === "COMMITTED") return current;
      if (current.status !== "TARGET_ACCEPTED") throw new Error(`CROSS_ZONE_FINALIZE_INVALID:${current.status}`);
      const owner = await lockedOwner(tx, current.entityId);
      if (!owner || owner.worldId !== current.sourceWorldId || owner.zoneId !== current.sourceZoneId ||
          owner.mode !== "FROZEN" || owner.activeTransferId !== current.transferId) {
        throw new Error("CROSS_ZONE_SOURCE_FINALIZE_OWNER_MISMATCH");
      }

      const finalized = advanceCrossZoneHandover(current, "SOURCE_FINALIZED");
      const committed = advanceCrossZoneHandover(finalized, "COMMITTED");
      const firstSequence = await nextReceiptSequence(tx, current.transferId);
      await appendTransition(tx, finalized, firstSequence);
      await appendTransition(tx, committed, firstSequence + 1);
      await tx.update(aurionEntityZoneOwnership).set({
        worldId: current.targetWorldId,
        zoneId: current.targetZoneId,
        mode: "ACTIVE",
        activeTransferId: null,
        generation: owner.generation + 1,
      }).where(eq(aurionEntityZoneOwnership.entityId, current.entityId));
      await updateCurrentTransfer(tx, committed);
      return committed;
    });
  }

  async terminateHandover(
    transferId: string,
    status: "REJECTED" | "EXPIRED" | "UNPROVABLE",
  ): Promise<AurionCrossZoneHandoverV2> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
    return db.transaction(async tx => {
      const row = await lockedTransfer(tx, transferId);
      if (!row) throw new Error("CROSS_ZONE_TRANSFER_NOT_FOUND");
      const current = parseV2TransferRow(row);
      if (current.status === status) return current;
      if (["COMMITTED", "SOURCE_FINALIZED", "REJECTED", "EXPIRED", "UNPROVABLE"].includes(current.status)) {
        throw new Error(`CROSS_ZONE_TERMINATION_INVALID:${current.status}`);
      }
      const owner = await lockedOwner(tx, current.entityId);
      if (!owner || owner.worldId !== current.sourceWorldId || owner.zoneId !== current.sourceZoneId ||
          owner.activeTransferId !== current.transferId) {
        throw new Error("CROSS_ZONE_TERMINATION_OWNER_MISMATCH");
      }
      const next = advanceCrossZoneHandover(current, status);
      await tx.update(aurionEntityZoneOwnership).set({ mode: "ACTIVE", activeTransferId: null })
        .where(eq(aurionEntityZoneOwnership.entityId, current.entityId));
      await updateCurrentTransfer(tx, next);
      await appendTransition(tx, next);
      return next;
    });
  }

  async readAuthoritativeOwner(entityId: string): Promise<AurionEntityZoneOwner | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(aurionEntityZoneOwnership)
      .where(eq(aurionEntityZoneOwnership.entityId, entityId)).limit(1);
    return row ? ownerFromRow(row) : null;
  }

  async explainTransfer(transferId: string): Promise<CrossZoneTransferExplanation | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(aurionCrossZoneTransfers)
      .where(eq(aurionCrossZoneTransfers.id, transferId)).limit(1);
    if (!row || row.handoverVersion !== 2) return null;
    const transfer = parseV2TransferRow(row);
    const rows = await db.select().from(aurionCrossZoneTransferReceipts)
      .where(eq(aurionCrossZoneTransferReceipts.transferId, transferId))
      .orderBy(aurionCrossZoneTransferReceipts.sequence);
    const receipts = rows.map(receiptRow => {
      const parsed = JSON.parse(receiptRow.receiptJson) as AurionCrossZoneHandoverV2;
      if (!verifyCrossZoneHandover(parsed) || parsed.transferReceiptHash !== receiptRow.transferReceiptHash) {
        throw new Error("CROSS_ZONE_RECEIPT_READBACK_INVALID");
      }
      return Object.freeze(parsed);
    });
    let chainValid = receipts.length > 0;
    for (let index = 0; index < receipts.length; index += 1) {
      const receipt = receipts[index]!;
      const expectedPrevious = index === 0 ? null : receipts[index - 1]!.transferReceiptHash;
      if (receipt.previousTransferReceiptHash !== expectedPrevious) chainValid = false;
    }
    const owner = await this.readAuthoritativeOwner(transfer.entityId);
    const sourceOwned = owner?.worldId === transfer.sourceWorldId && owner?.zoneId === transfer.sourceZoneId;
    const targetOwned = owner?.worldId === transfer.targetWorldId && owner?.zoneId === transfer.targetZoneId;
    const ownerInvariantValid = Boolean(owner) && (
      transfer.status === "COMMITTED"
        ? targetOwned && owner?.mode === "ACTIVE" && owner.activeTransferId === null
        : ["REJECTED", "EXPIRED", "UNPROVABLE"].includes(transfer.status)
          ? sourceOwned && owner?.mode === "ACTIVE" && owner.activeTransferId === null
          : sourceOwned && owner?.activeTransferId === transfer.transferId &&
            (transfer.status === "PREPARED" ? owner?.mode === "ACTIVE" : owner?.mode === "FROZEN")
    );
    const resumableAction =
      transfer.status === "PREPARED" ? "FREEZE_SOURCE" :
      transfer.status === "SOURCE_FROZEN" ? "AWAIT_TARGET" :
      transfer.status === "TARGET_ACCEPTED" ? "FINALIZE" : "NONE";
    return Object.freeze({
      transfer,
      owner,
      receipts: Object.freeze(receipts),
      chainValid,
      ownerInvariantValid,
      resumableAction,
    });
  }
}

export const globalCrossZoneSyncService = new AurionCrossZoneSynchronizationService();
