import { and, asc, eq, inArray } from "drizzle-orm";
import { aurionInventoryReceipts, aurionItemInstancesV2, itemInstances, playerProfiles, type AurionInventoryReceipt as AurionInventoryReceiptRow } from "../drizzle/schema";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  aurionInventoryStateHash,
  resolveAurionInventoryTransaction,
  type AurionInventoryCommand,
  type AurionInventoryReceipt,
  type AurionInventoryStack,
  type AurionInventoryState,
  type AurionInventoryTransactionResult,
} from "./aurionInventoryTransactionProtocol";
import { getDb } from "./db";
import { inventoryItemShapeHash, inventoryMaxQuantityExact, inventoryMergeKey, legacyInventoryMergeKey, legacyInventoryProvenanceHash } from "./aurionInventoryStackIdentity";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type InventoryTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const visibleStatuses = ["owned", "equipped", "pending_pickup"] as const;

type DbItem = Readonly<{
  version: "legacy" | "aurion_v2";
  id: string;
  ownerUserId: number;
  definitionId: string;
  provenanceHash: string;
  mergeKey: string;
  quantityExact: string;
  maxQuantityExact: string;
  status: "owned" | "equipped" | "pending_pickup";
}>;

function parseExact(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label}_INVALID`);
  return BigInt(value);
}

function normalizeIdempotencyKey(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  return value;
}

function normalizeStateRevision(value: string): string {
  const revision = parseExact(value, "REVISION");
  return revision.toString(10);
}

function stackFromLegacy(row: typeof itemInstances.$inferSelect): AurionInventoryStack {
  const quantityExact = row.quantityExact || "1";
  const maxQuantityExact = row.maxQuantityExact || "1";
  if (!row.mergeKey || !row.provenanceHash) {
    return {
      id: row.id,
      version: "legacy",
      definitionId: row.baseItemKey,
      provenanceHash: legacyInventoryProvenanceHash(row.id),
      mergeKey: legacyInventoryMergeKey(row.id),
      quantityExact,
      maxQuantityExact,
    };
  }
  return {
    id: row.id,
    version: "legacy",
    definitionId: row.baseItemKey,
    provenanceHash: row.provenanceHash,
    mergeKey: row.mergeKey,
    quantityExact,
    maxQuantityExact,
  };
}

function stackFromV2(row: typeof aurionItemInstancesV2.$inferSelect): AurionInventoryStack {
  const quantityExact = row.quantityExact || "1";
  const maxQuantityExact = row.maxQuantityExact || "1";
  if (!row.mergeKey || !row.provenanceHash) throw new Error("INVENTORY_ITEM_IDENTITY_MISSING");
  return {
    id: row.id,
    version: "aurion_v2",
    definitionId: row.baseItemDefinitionId,
    provenanceHash: row.provenanceHash,
    mergeKey: row.mergeKey,
    quantityExact,
    maxQuantityExact,
  };
}

function stateFromStacks(userId: number, revisionExact: string, stacks: readonly AurionInventoryStack[]): AurionInventoryState {
  return Object.freeze({
    ownerUserId: userId,
    revisionExact: normalizeStateRevision(revisionExact),
    stacks: Object.freeze([...stacks].sort((a, b) => a.id.localeCompare(b.id))),
  });
}

async function readCanonicalInventoryState(tx: InventoryTransaction, userId: number, revisionExact: string, lock = true): Promise<AurionInventoryState> {
  const legacyQuery = tx.select().from(itemInstances).where(
    and(eq(itemInstances.ownerUserId, userId), inArray(itemInstances.status, [...visibleStatuses])),
  ).orderBy(asc(itemInstances.id));
  const v2Query = tx.select().from(aurionItemInstancesV2).where(
    and(eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.status, [...visibleStatuses])),
  ).orderBy(asc(aurionItemInstancesV2.id));
  const legacy = lock ? await legacyQuery.for("update") : await legacyQuery;
  const v2 = lock ? await v2Query.for("update") : await v2Query;

  const ids = new Set<string>();
  const stacks: AurionInventoryStack[] = [];
  for (const row of legacy) {
    if (ids.has(row.id)) throw new Error("INVENTORY_ITEM_ID_COLLISION");
    ids.add(row.id);
    stacks.push(stackFromLegacy(row));
  }
  for (const row of v2) {
    if (ids.has(row.id)) throw new Error("INVENTORY_ITEM_ID_COLLISION");
    ids.add(row.id);
    stacks.push(stackFromV2(row));
  }
  return stateFromStacks(userId, revisionExact, stacks);
}

async function readPlayerRevision(tx: InventoryTransaction, userId: number) {
  const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).for("update"))[0];
  if (!profile) throw new Error("PLAYER_PROFILE_REQUIRED");
  return normalizeStateRevision(profile.inventoryRevisionExact || "0");
}

function assertV2InventoryIdentity(row: typeof aurionItemInstancesV2.$inferSelect): void {
  const shape = {
    definitionId: row.baseItemDefinitionId, category: row.category, equipmentSlot: row.equipmentSlot,
    quality: row.quality, levelExact: row.itemLevelExact, affixesJson: row.affixesJson,
    setId: row.setId, itemPower: row.itemPower,
  };
  if (row.provenanceHash !== inventoryItemShapeHash(shape)) throw new Error("INVENTORY_SOURCE_PROVENANCE_MISMATCH");
  if (row.mergeKey !== inventoryMergeKey(shape)) throw new Error("INVENTORY_SOURCE_MERGE_KEY_MISMATCH");
  if (row.maxQuantityExact !== inventoryMaxQuantityExact({ category: row.category, equipmentSlot: row.equipmentSlot })) throw new Error("INVENTORY_SOURCE_CAPACITY_MISMATCH");
}

function dbItemForLegacy(row: typeof itemInstances.$inferSelect): DbItem {
  return {
    version: "legacy",
    id: row.id,
    ownerUserId: row.ownerUserId,
    definitionId: row.baseItemKey,
    provenanceHash: row.provenanceHash || legacyInventoryProvenanceHash(row.id),
    mergeKey: row.mergeKey || legacyInventoryMergeKey(row.id),
    quantityExact: row.quantityExact || "1",
    maxQuantityExact: row.maxQuantityExact || "1",
    status: row.status as DbItem["status"],
  };
}

function dbItemForV2(row: typeof aurionItemInstancesV2.$inferSelect): DbItem {
  return {
    version: "aurion_v2",
    id: row.id,
    ownerUserId: row.ownerUserId,
    definitionId: row.baseItemDefinitionId,
    provenanceHash: row.provenanceHash,
    mergeKey: row.mergeKey,
    quantityExact: row.quantityExact,
    maxQuantityExact: row.maxQuantityExact,
    status: row.status as DbItem["status"],
  };
}

async function findOwnedItem(tx: InventoryTransaction, userId: number, id: string): Promise<{ item: DbItem; v2?: typeof aurionItemInstancesV2.$inferSelect; legacy?: typeof itemInstances.$inferSelect }> {
  const legacyRows = await tx.select().from(itemInstances).where(and(eq(itemInstances.id, id), eq(itemInstances.ownerUserId, userId), inArray(itemInstances.status, [...visibleStatuses]))).for("update");
  const v2Rows = await tx.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.id, id), eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.status, [...visibleStatuses]))).for("update");
  if (legacyRows.length && v2Rows.length) throw new Error("INVENTORY_ITEM_ID_COLLISION");
  if (legacyRows[0]) return { item: dbItemForLegacy(legacyRows[0]), legacy: legacyRows[0] };
  if (v2Rows[0]) return { item: dbItemForV2(v2Rows[0]), v2: v2Rows[0] };
  throw new Error("OWNED_ITEM_REQUIRED");
}

async function assertSplitIdFree(tx: InventoryTransaction, id: string): Promise<void> {
  const legacy = await tx.select({ id: itemInstances.id }).from(itemInstances).where(eq(itemInstances.id, id)).limit(1);
  const v2 = await tx.select({ id: aurionItemInstancesV2.id }).from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, id)).limit(1);
  if (legacy.length || v2.length) throw new Error("INVENTORY_SPLIT_ID_COLLISION");
}

function receiptHash(receipt: AurionInventoryReceipt): string {
  return canonicalSha256({
    domain: "aurion.inventory.receipt.v1",
    id: receipt.receiptId,
    idempotencyKey: receipt.idempotencyKey,
    commandHash: receipt.commandHash,
    beforeStateHash: receipt.beforeStateHash,
    afterStateHash: receipt.afterStateHash,
    resultHash: receipt.resultHash,
  });
}

function receiptFromRow(row: typeof aurionInventoryReceipts.$inferSelect): AurionInventoryReceipt {
  const after = JSON.parse(row.afterStateJson) as AurionInventoryState;
  const normalizedAfter = stateFromStacks(row.userId, row.afterRevisionExact, after.stacks);
  if (aurionInventoryStateHash(normalizedAfter) !== row.afterStateHash) throw new Error("INVENTORY_RECEIPT_STATE_HASH_MISMATCH");
  const expectedHash = receiptHash({
    receiptId: row.id,
    idempotencyKey: row.idempotencyKey,
    commandHash: row.commandHash,
    beforeStateHash: row.beforeStateHash,
    afterStateHash: row.afterStateHash,
    operation: row.operation,
    after: normalizedAfter,
    resultHash: row.resultHash,
    ruleSetVersion: row.resultJson ? "aurion.inventory.transaction.v1" : "aurion.inventory.transaction.v1",
  });
  if (expectedHash !== row.receiptHash) throw new Error("INVENTORY_RECEIPT_HASH_MISMATCH");
  return Object.freeze({
    receiptId: row.id,
    idempotencyKey: row.idempotencyKey,
    commandHash: row.commandHash,
    beforeStateHash: row.beforeStateHash,
    afterStateHash: row.afterStateHash,
    operation: row.operation,
    after: normalizedAfter,
    resultHash: row.resultHash,
    ruleSetVersion: "aurion.inventory.transaction.v1",
  });
}

function resultHashMatches(row: typeof aurionInventoryReceipts.$inferSelect, receipt: AurionInventoryReceipt): void {
  const resultJson = JSON.parse(row.resultJson) as { stateHash?: string; receiptId?: string };
  if (resultJson.receiptId !== receipt.receiptId || resultJson.stateHash !== receipt.afterStateHash) throw new Error("INVENTORY_RESULT_READBACK_MISMATCH");
}

async function loadPriorReceipt(tx: InventoryTransaction, userId: number, key: string): Promise<typeof aurionInventoryReceipts.$inferSelect | null> {
  return (await tx.select().from(aurionInventoryReceipts).where(and(
    eq(aurionInventoryReceipts.userId, userId),
    eq(aurionInventoryReceipts.idempotencyKey, key),
  )).limit(1))[0] ?? null;
}

async function updateLegacyItem(tx: InventoryTransaction, row: typeof itemInstances.$inferSelect, quantityExact: string, consumed: boolean): Promise<void> {
  await tx.update(itemInstances).set({
    quantityExact,
    status: consumed ? "consumed" : "owned",
  }).where(and(eq(itemInstances.id, row.id), eq(itemInstances.ownerUserId, row.ownerUserId)));
}

async function updateV2Item(tx: InventoryTransaction, row: typeof aurionItemInstancesV2.$inferSelect, quantityExact: string, consumed: boolean): Promise<void> {
  await tx.update(aurionItemInstancesV2).set({
    quantityExact,
    status: consumed ? "consumed" : "owned",
  }).where(and(eq(aurionItemInstancesV2.id, row.id), eq(aurionItemInstancesV2.ownerUserId, row.ownerUserId)));
}

async function applyDatabaseTransition(
  tx: InventoryTransaction,
  userId: number,
  command: AurionInventoryCommand,
  before: AurionInventoryState,
  after: AurionInventoryState,
  receipt: AurionInventoryReceipt,
  sourceRecord: Awaited<ReturnType<typeof findOwnedItem>>,
  targetRecord: Awaited<ReturnType<typeof findOwnedItem>> | null,
): Promise<void> {
  const afterById = new Map(after.stacks.map(stack => [stack.id, stack]));
  const sourceAfter = afterById.get(command.sourceStackId);

  if (command.operation === "merge") {
    if (!targetRecord || !sourceRecord.v2 || !targetRecord.v2) throw new Error("STACK_OPERATION_REQUIRES_V2");
    if (sourceRecord.item.maxQuantityExact === "1" || targetRecord.item.maxQuantityExact === "1") throw new Error("STACK_OPERATION_NOT_STACKABLE");
    const targetAfter = afterById.get(command.targetStackId);
    if (!targetAfter) throw new Error("INVENTORY_TARGET_AFTER_STATE_MISSING");
    if (!sourceAfter) await updateV2Item(tx, sourceRecord.v2, "0", true);
    else await updateV2Item(tx, sourceRecord.v2, sourceAfter.quantityExact, false);
    await updateV2Item(tx, targetRecord.v2, targetAfter.quantityExact, false);
    return;
  }

  if (command.operation === "split") {
    if (!sourceRecord.v2) throw new Error("STACK_OPERATION_REQUIRES_V2");
    if (sourceRecord.item.maxQuantityExact === "1") throw new Error("STACK_OPERATION_NOT_STACKABLE");
    if (!sourceAfter) throw new Error("INVENTORY_SPLIT_SOURCE_MISSING");
    const split = after.stacks.find(stack => stack.id !== command.sourceStackId && !before.stacks.some(previous => previous.id === stack.id));
    if (!split) throw new Error("INVENTORY_SPLIT_RESULT_MISSING");
    await assertSplitIdFree(tx, split.id);
    const source = sourceRecord.v2;
    assertV2InventoryIdentity(source);
    const expectedIdentity = inventoryItemShapeHash({
      definitionId: source.baseItemDefinitionId,
      category: source.category,
      equipmentSlot: source.equipmentSlot,
      quality: source.quality,
      levelExact: source.itemLevelExact,
      affixesJson: source.affixesJson,
      setId: source.setId,
      itemPower: source.itemPower,
    });
    if (expectedIdentity !== source.provenanceHash) {
      throw new Error("INVENTORY_SOURCE_PROVENANCE_MISMATCH");
    }
    await updateV2Item(tx, source, sourceAfter.quantityExact, false);
    await tx.insert(aurionItemInstancesV2).values({
      id: split.id,
      ownerUserId: userId,
      lootReceiptId: null,
      inventoryReceiptId: receipt.receiptId,
      originItemId: source.id,
      baseItemDefinitionId: source.baseItemDefinitionId,
      category: source.category,
      equipmentSlot: source.equipmentSlot,
      quality: source.quality,
      itemLevelExact: source.itemLevelExact,
      affixesJson: source.affixesJson,
      setId: source.setId,
      itemPower: source.itemPower,
      deterministicHash: source.deterministicHash,
      quantityExact: split.quantityExact,
      maxQuantityExact: source.maxQuantityExact,
      mergeKey: source.mergeKey,
      provenanceHash: source.provenanceHash,
      status: "owned",
    });
    return;
  }


  if (sourceRecord.item.status !== "owned") throw new Error("INVENTORY_ITEM_NOT_USABLE");
  if (!sourceAfter) {
    if (sourceRecord.v2) await updateV2Item(tx, sourceRecord.v2, "0", true);
    else if (sourceRecord.legacy) await updateLegacyItem(tx, sourceRecord.legacy, "0", true);
    else throw new Error("INVENTORY_SOURCE_RECORD_MISSING");
  } else {
    if (sourceRecord.v2) await updateV2Item(tx, sourceRecord.v2, sourceAfter.quantityExact, false);
    else if (sourceRecord.legacy) await updateLegacyItem(tx, sourceRecord.legacy, sourceAfter.quantityExact, false);
    else throw new Error("INVENTORY_SOURCE_RECORD_MISSING");
  }
}

export async function readAurionInventorySnapshot(userId: number): Promise<Readonly<{ revisionExact: string; stateHash: string }>> {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("OWNER_USER_ID_INVALID");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    const revision = await readPlayerRevision(tx, userId);
    const state = await readCanonicalInventoryState(tx, userId, revision, false);
    return Object.freeze({ revisionExact: revision, stateHash: aurionInventoryStateHash(state) });
  });
}

export async function executeAurionInventoryTransaction(input: Readonly<{
  userId: number;
  command: AurionInventoryCommand;
  idempotencyKey: string;
  expectedRevisionExact: string;
  expectedStateHash: string;
  testFailurePoint?: "afterItemWrites";
}>): Promise<AurionInventoryTransactionResult> {
  if (!Number.isSafeInteger(input.userId) || input.userId < 1) throw new Error("OWNER_USER_ID_INVALID");
  const key = normalizeIdempotencyKey(input.idempotencyKey);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  return db.transaction(async tx => {
    const currentRevision = await readPlayerRevision(tx, input.userId);
    const prior = await loadPriorReceipt(tx, input.userId, key);

    if (prior) {
      const priorReceipt = receiptFromRow(prior);
      const replay = resolveAurionInventoryTransaction({
        before: priorReceipt.after,
        command: input.command,
        idempotencyKey: key,
        priorReceipt,
      });
      resultHashMatches(prior, priorReceipt);
      return replay;
    }

    const expectedRevision = normalizeStateRevision(input.expectedRevisionExact);
    if (expectedRevision !== currentRevision) throw new Error("INVENTORY_STALE_REVISION");

    const before = await readCanonicalInventoryState(tx, input.userId, currentRevision);
    const beforeHash = aurionInventoryStateHash(before);
    if (beforeHash !== input.expectedStateHash) throw new Error("INVENTORY_STALE_STATE");

    const sourceRecord = await findOwnedItem(tx, input.userId, input.command.sourceStackId);
    if (sourceRecord.item.status !== "owned") throw new Error("INVENTORY_ITEM_NOT_TRANSITIONABLE");

    let targetRecord: Awaited<ReturnType<typeof findOwnedItem>> | null = null;
    if (input.command.operation === "merge") {
      if (input.command.targetStackId === input.command.sourceStackId) throw new Error("MERGE_SELF_REFERENCE");
      targetRecord = await findOwnedItem(tx, input.userId, input.command.targetStackId);
      if (targetRecord.item.status !== "owned") throw new Error("INVENTORY_ITEM_NOT_TRANSITIONABLE");
    }

    const resolved = resolveAurionInventoryTransaction({
      before,
      command: input.command,
      idempotencyKey: key,
    });
    const receipt = resolved.receipt;

    await applyDatabaseTransition(tx, input.userId, input.command, before, resolved.state, receipt, sourceRecord, targetRecord);

    const nextRevision = (BigInt(currentRevision) + 1n).toString(10);
    if (resolved.state.revisionExact !== nextRevision) throw new Error("INVENTORY_REVISION_TRANSITION_MISMATCH");
    await tx.update(playerProfiles).set({ inventoryRevisionExact: nextRevision }).where(eq(playerProfiles.userId, input.userId));

    if (input.testFailurePoint === "afterItemWrites") throw new Error("INVENTORY_TEST_ROLLBACK");

    const after = await readCanonicalInventoryState(tx, input.userId, nextRevision);
    const afterHash = aurionInventoryStateHash(after);
    if (afterHash !== resolved.receipt.afterStateHash) throw new Error("INVENTORY_AFTER_STATE_READBACK_MISMATCH");

    const storedReceiptHash = receiptHash(receipt);
    await tx.insert(aurionInventoryReceipts).values({
      id: receipt.receiptId,
      userId: input.userId,
      operation: receipt.operation,
      idempotencyKey: receipt.idempotencyKey,
      commandHash: receipt.commandHash,
      beforeRevisionExact: before.revisionExact,
      afterRevisionExact: nextRevision,
      beforeStateHash: receipt.beforeStateHash,
      afterStateHash: receipt.afterStateHash,
      beforeStateJson: JSON.stringify(before),
      afterStateJson: JSON.stringify(after),
      resultJson: JSON.stringify({ receiptId: receipt.receiptId, stateHash: afterHash, operation: receipt.operation }),
      resultHash: receipt.resultHash,
      receiptHash: storedReceiptHash,
    });

    return resolved;
  });
}

export function replayAurionInventoryReceipts(rows: readonly {
  userId: number;
  beforeRevisionExact: string;
  afterRevisionExact: string;
  beforeStateHash: string;
  afterStateHash: string;
  beforeStateJson: string;
  afterStateJson: string;
  resultHash: string;
}[]): AurionInventoryState {
  let previousAfter: AurionInventoryState | null = null;
  let expectedRevision: bigint | null = null;
  let finalState: AurionInventoryState | null = null;
  for (const row of [...rows].sort((a, b) => Number(BigInt(a.afterRevisionExact) - BigInt(b.afterRevisionExact)))) {
    const before = JSON.parse(row.beforeStateJson) as AurionInventoryState;
    const after = JSON.parse(row.afterStateJson) as AurionInventoryState;
    if (aurionInventoryStateHash(stateFromStacks(row.userId, row.beforeRevisionExact, before.stacks)) !== row.beforeStateHash) throw new Error("INVENTORY_REPLAY_BEFORE_HASH_MISMATCH");
    if (aurionInventoryStateHash(stateFromStacks(row.userId, row.afterRevisionExact, after.stacks)) !== row.afterStateHash) throw new Error("INVENTORY_REPLAY_AFTER_HASH_MISMATCH");
    const beforeRevision = BigInt(row.beforeRevisionExact);
    const afterRevision = BigInt(row.afterRevisionExact);
    if (afterRevision !== beforeRevision + 1n) throw new Error("INVENTORY_REPLAY_REVISION_GAP");
    if (expectedRevision !== null && beforeRevision !== expectedRevision) throw new Error("INVENTORY_REPLAY_REVISION_CONFLICT");
    if (previousAfter && row.beforeStateHash !== aurionInventoryStateHash(previousAfter)) throw new Error("INVENTORY_REPLAY_CHAIN_MISMATCH");
    previousAfter = stateFromStacks(row.userId, row.afterRevisionExact, after.stacks);
    expectedRevision = afterRevision;
    finalState = previousAfter;
    const expectedResultHash = canonicalSha256({
      domain: "aurion.inventory.result.v1",
      afterStateHash: row.afterStateHash,
      resultHash: row.resultHash,
    });
    void expectedResultHash;
  }
  if (!finalState) throw new Error("INVENTORY_REPLAY_EMPTY");
  return finalState;
}
