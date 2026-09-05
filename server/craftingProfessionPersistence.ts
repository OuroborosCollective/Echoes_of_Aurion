import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { aurionProfessionOutputBatches, aurionProfessionReceipts, aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import type { getDb } from "./db";
import type { CraftingAffix, CraftingPlan } from "./craftingProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { canonicalScopedMasteryKey, masteryKeys, resolveCoupledMasteries, type ScopedMasteryEvent, type ScopedMasteryKey } from "./scopedMasteryProtocol";
import { professionMasteryKeys, professionOutputOriginAt, resolveProfessionMasteryOperation, type ProfessionOperationEnvelope } from "./professionMasteryProtocol";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "select" | "insert" | "update">;
const digest = (value: unknown) => createHash("sha256").update(stableCatalogStringify(value)).digest("hex");
const actor = (userId: number) => `player:${userId}`;

export type CraftingOutputTemplate = { baseItemKey: string; quality: "normal" | "magic" | "rare" | "set" | "unique"; itemLevel: number; affixes: CraftingAffix[] };

function eventFromRow(row: typeof aurionScopedMasteryEvents.$inferSelect): ScopedMasteryEvent {
  const event = JSON.parse(row.eventJson) as ScopedMasteryEvent;
  if (digest(event) !== row.eventHash || event.receiptId !== row.professionReceiptId || event.idempotencyKey !== row.id || event.serverValidated !== true || canonicalScopedMasteryKey(event.key) !== row.scopeKey) throw new Error("SCOPED_MASTERY_EVENT_CORRUPT");
  return event;
}

async function masteryReadback(reader: Reader, userId: number, keys: readonly ScopedMasteryKey[]) {
  const rows = await reader.select().from(aurionScopedMasteryEvents).where(and(eq(aurionScopedMasteryEvents.userId, userId), inArray(aurionScopedMasteryEvents.scopeKey, keys.map(canonicalScopedMasteryKey))));
  return resolveCoupledMasteries({ actorId: actor(userId), keys, events: rows.map(eventFromRow) });
}

/** Called only inside craftItemForUser's locked transaction, before consuming the input. */
export async function prepareCraftingProfession(tx: Reader, input: {
  userId: number; plan: CraftingPlan; receiptId: string; receiptDigest: string;
  resolutionIndex: number; inputItem: { id: string; baseItemKey: string; itemLevel: number }; serverSeed: string;
}) {
  const identity = { professionId: "blacksmith" as const, activityKind: "craft" as const, activityId: input.plan.recipe.key, outputItemId: input.plan.output.baseItemKey };
  const keys = professionMasteryKeys(identity);
  const current = await masteryReadback(tx, input.userId, keys);
  const item = current.find(state => state.key.scopeType === "item")!;
  const resolved = resolveProfessionMasteryOperation({
    operation: {
      ...identity, operationId: `craft_${input.receiptDigest}`, actorId: actor(input.userId),
      sourceReceiptId: input.receiptId, sourceEvidenceDigest: input.receiptDigest,
      serverSeed: input.serverSeed, resolutionIndex: input.resolutionIndex,
      baseOutputQuantityExact: "1", masteryLevelExact: item.progression.levelExact,
      qualityScoreExact: item.qualityScoreExact,
      // A confirmed craft consumes a previously unused origin in one server resolution.
      activeDurationTicks: 1, repetitionStreak: 0, distinctContextCount: 1,
      resources: [{ originId: input.inputItem.id, itemId: input.inputItem.baseItemKey, quantityExact: "1" }],
    },
    xp: { professionXpExact: input.plan.recipe.craftingXpExact, activityXpExact: input.plan.recipe.craftingXpExact, itemXpExact: input.plan.recipe.craftingXpExact, qualityGainExact: "1" },
    currentByKey: Object.fromEntries(current.map(state => [canonicalScopedMasteryKey(state.key), state])),
  });
  const template: CraftingOutputTemplate = {
    baseItemKey: input.plan.output.baseItemKey, quality: input.plan.output.quality,
    itemLevel: input.inputItem.itemLevel,
    affixes: input.plan.output.affixes.map(affix => ({ ...affix, stats: Object.fromEntries(Object.entries(affix.stats).map(([key, value]) => [key, Math.floor(value * resolved.envelope.modifiers.qualityPowerBps / 10_000)])) })),
  };
  return { ...resolved, template, outputId: professionOutputOriginAt(resolved.envelope, "0") };
}

/** No transaction or alternative crafting service is opened by this persistence helper. */
export async function commitCraftingProfession(tx: Writer, userId: number, prepared: Awaited<ReturnType<typeof prepareCraftingProfession>>) {
  const { envelope, masteryEvents, template } = prepared;
  // The persisted digest binds every envelope field and the exact output
  // template. The protocol's operation hash alone does not cover stored bytes.
  await tx.insert(aurionProfessionReceipts).values({ id: envelope.receiptId, userId, sourceCraftingReceiptId: envelope.sourceReceiptId, operationId: envelope.operationId, commitHash: digest({ envelope, template }), envelopeJson: stableCatalogStringify(envelope) });
  await tx.insert(aurionScopedMasteryEvents).values(masteryEvents.map(event => ({ id: event.idempotencyKey, userId, scopeKey: canonicalScopedMasteryKey(event.key), professionReceiptId: envelope.receiptId, eventHash: digest(event), eventJson: stableCatalogStringify(event) })));
  await tx.insert(aurionProfessionOutputBatches).values({ professionReceiptId: envelope.receiptId, sourceCraftingReceiptId: envelope.sourceReceiptId, ownerUserId: userId, totalQuantityExact: envelope.yield.totalQuantityExact, nextOutputIndexExact: "1", templateJson: stableCatalogStringify(template) });
  const readback = await readCraftingProfession(tx, userId, envelope.sourceReceiptId, envelope.receiptId);
  if (!readback || readback.envelope.commitHash !== envelope.commitHash || stableCatalogStringify(readback.masteryStates) !== stableCatalogStringify(prepared.masteryStates)) throw new Error("PROFESSION_COMMIT_READBACK_FAILED");
  return readback;
}

export async function readCraftingProfession(reader: Reader, userId: number, sourceCraftingReceiptId: string, expectedReceiptId: string | null) {
  if (!expectedReceiptId) return null; // Historical crafts are never retroactively credited.
  const row = (await reader.select().from(aurionProfessionReceipts).where(and(eq(aurionProfessionReceipts.id, expectedReceiptId), eq(aurionProfessionReceipts.userId, userId), eq(aurionProfessionReceipts.sourceCraftingReceiptId, sourceCraftingReceiptId))).limit(1))[0];
  if (!row) throw new Error("PROFESSION_RECEIPT_MISSING");
  const batch = (await reader.select().from(aurionProfessionOutputBatches).where(and(eq(aurionProfessionOutputBatches.professionReceiptId, row.id), eq(aurionProfessionOutputBatches.ownerUserId, userId))).limit(1))[0];
  const stored = verifyStoredCraftingOutput(row, batch, userId);
  const { envelope } = stored;
  const events = await reader.select().from(aurionScopedMasteryEvents).where(and(eq(aurionScopedMasteryEvents.userId, userId), eq(aurionScopedMasteryEvents.professionReceiptId, row.id)));
  const expectedKeys = envelope.masteryKeys.map(canonicalScopedMasteryKey).sort();
  if (JSON.stringify(events.map(event => canonicalScopedMasteryKey(eventFromRow(event).key)).sort()) !== JSON.stringify(expectedKeys)) throw new Error("PROFESSION_EVENTS_INCOMPLETE");
  return { ...stored, masteryStates: await masteryReadback(reader, userId, envelope.masteryKeys) };
}

function verifyStoredCraftingOutput(row: typeof aurionProfessionReceipts.$inferSelect | null, batch: typeof aurionProfessionOutputBatches.$inferSelect | undefined, userId: number) {
  if (!row) throw new Error("PROFESSION_RECEIPT_MISSING");
  const envelope = JSON.parse(row.envelopeJson) as ProfessionOperationEnvelope;
  if (row.userId !== userId || envelope.receiptId !== row.id || envelope.actorId !== actor(userId) || envelope.operationId !== row.operationId || envelope.sourceReceiptId !== row.sourceCraftingReceiptId) throw new Error("PROFESSION_RECEIPT_CORRUPT");
  if (!batch || batch.ownerUserId !== userId || batch.professionReceiptId !== row.id || batch.sourceCraftingReceiptId !== row.sourceCraftingReceiptId || batch.totalQuantityExact !== envelope.yield.totalQuantityExact || !/^[1-9][0-9]*$/.test(batch.totalQuantityExact) || !/^[1-9][0-9]*$/.test(batch.nextOutputIndexExact) || BigInt(batch.nextOutputIndexExact) > BigInt(batch.totalQuantityExact)) throw new Error("PROFESSION_OUTPUT_BATCH_CORRUPT");
  const template = JSON.parse(batch.templateJson) as CraftingOutputTemplate;
  if (digest({ envelope, template }) !== row.commitHash) throw new Error("PROFESSION_STORED_CONTENT_CORRUPT");
  return { envelope, remainingQuantityExact: (BigInt(batch.totalQuantityExact) - BigInt(batch.nextOutputIndexExact)).toString(), nextOutputIndexExact: batch.nextOutputIndexExact };
}

export async function readPendingCraftingOutputs(reader: Reader, userId: number) {
  // Completed batches cannot crowd unclaimed outputs out of the bounded page.
  const rows = await reader.select({ batch: aurionProfessionOutputBatches, receipt: aurionProfessionReceipts })
    .from(aurionProfessionOutputBatches)
    .leftJoin(aurionProfessionReceipts, eq(aurionProfessionReceipts.id, aurionProfessionOutputBatches.professionReceiptId))
    .where(and(eq(aurionProfessionOutputBatches.ownerUserId, userId), ne(aurionProfessionOutputBatches.totalQuantityExact, aurionProfessionOutputBatches.nextOutputIndexExact)))
    .orderBy(asc(aurionProfessionOutputBatches.professionReceiptId)).limit(100);
  return rows.map(({ batch, receipt }) => {
    const stored = verifyStoredCraftingOutput(receipt, batch, userId);
    return { receiptId: batch.sourceCraftingReceiptId, professionReceiptId: batch.professionReceiptId, nextOutputIndexExact: stored.nextOutputIndexExact, remainingQuantityExact: stored.remainingQuantityExact };
  });
}

export async function readCraftingMastery(reader: Reader, userId: number) {
  return masteryReadback(reader, userId, [masteryKeys.profession("blacksmith"), masteryKeys.recipe("temper_aurion_spear"), masteryKeys.item("aurion_spear")]);
}
