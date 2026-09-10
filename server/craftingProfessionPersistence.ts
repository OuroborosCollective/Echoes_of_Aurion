import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { aurionProfessionOutputBatches, aurionProfessionReceipts, aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import type { getDb } from "./db";
import type { CraftingAffix, CraftingItemQuality, CraftingPlan } from "./craftingProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { canonicalScopedMasteryKey, masteryKeys, resolveCoupledMasteries, type ScopedMasteryEvent, type ScopedMasteryKey } from "./scopedMasteryProtocol";
import { professionMasteryKeys, professionOutputOriginAt, resolveProfessionMasteryOperation, type AurionProfessionId, type ProfessionOperationEnvelope } from "./professionMasteryProtocol";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "select" | "insert" | "update">;
const digest = (value: unknown) => createHash("sha256").update(stableCatalogStringify(value)).digest("hex");
const actor = (userId: number) => `player:${userId}`;

export type CraftingOutputTemplate = { baseItemKey: string; quality: "normal" | "magic" | "rare" | "set" | "unique"; itemLevel: number; affixes: CraftingAffix[] };
export type CraftingProfessionInputItem = Readonly<{ id: string; baseItemKey: string; itemLevel: number }>;
export type CraftingProfessionPlan = Readonly<{
  professionId: AurionProfessionId;
  activityId: string;
  outputItemId: string;
  baseOutputQuantityExact: string;
  xpExact: string;
  quality: CraftingItemQuality;
  affixes: readonly CraftingAffix[];
  outputItemLevel: number;
  inputItems: readonly CraftingProfessionInputItem[];
}>;

type CraftingPreparationInput = Readonly<{
  userId: number;
  receiptId: string;
  receiptDigest: string;
  resolutionIndex: number;
  serverSeed: string;
  /** Legacy single-item caller retained until the AX1 menu cutover is complete. */
  plan?: CraftingPlan;
  inputItem?: CraftingProfessionInputItem;
  /** Canonical path for AX1 and every future multi-material recipe. */
  canonicalPlan?: CraftingProfessionPlan;
}>;

function eventFromRow(row: typeof aurionScopedMasteryEvents.$inferSelect): ScopedMasteryEvent {
  const event = JSON.parse(row.eventJson) as ScopedMasteryEvent;
  if (digest(event) !== row.eventHash || event.receiptId !== row.professionReceiptId || event.idempotencyKey !== row.id || event.serverValidated !== true || canonicalScopedMasteryKey(event.key) !== row.scopeKey) throw new Error("SCOPED_MASTERY_EVENT_CORRUPT");
  return event;
}

async function masteryReadback(reader: Reader, userId: number, keys: readonly ScopedMasteryKey[]) {
  const rows = await reader.select().from(aurionScopedMasteryEvents).where(and(eq(aurionScopedMasteryEvents.userId, userId), inArray(aurionScopedMasteryEvents.scopeKey, keys.map(canonicalScopedMasteryKey))));
  return resolveCoupledMasteries({ actorId: actor(userId), keys, events: rows.map(eventFromRow) });
}

function normalizeCraftingProfessionPlan(input: CraftingPreparationInput): CraftingProfessionPlan {
  if (input.canonicalPlan) {
    if (input.plan || input.inputItem) throw new Error("CRAFTING_PROFESSION_PLAN_AMBIGUOUS");
    if (!Number.isSafeInteger(input.canonicalPlan.outputItemLevel) || input.canonicalPlan.outputItemLevel < 1) throw new Error("CRAFTING_OUTPUT_ITEM_LEVEL_INVALID");
    if (input.canonicalPlan.inputItems.length < 1 || input.canonicalPlan.inputItems.length > 64) throw new Error("CRAFTING_INPUT_COUNT_INVALID");
    return input.canonicalPlan;
  }
  if (!input.plan || !input.inputItem) throw new Error("CRAFTING_PROFESSION_PLAN_REQUIRED");
  return Object.freeze({
    professionId: "blacksmith",
    activityId: input.plan.recipe.key,
    outputItemId: input.plan.output.baseItemKey,
    baseOutputQuantityExact: "1",
    xpExact: input.plan.recipe.craftingXpExact,
    quality: input.plan.output.quality,
    affixes: input.plan.output.affixes,
    outputItemLevel: input.inputItem.itemLevel,
    inputItems: Object.freeze([input.inputItem]),
  });
}

/**
 * Called only inside craftItemForUser's locked MariaDB transaction before input consumption.
 * The legacy one-item plan and AX1 multi-material plans both normalize into this one profession
 * operation. No second crafting service or database authority is created.
 */
export async function prepareCraftingProfession(tx: Reader, input: CraftingPreparationInput) {
  const plan = normalizeCraftingProfessionPlan(input);
  const identity = { professionId: plan.professionId, activityKind: "craft" as const, activityId: plan.activityId, outputItemId: plan.outputItemId };
  const keys = professionMasteryKeys(identity);
  const current = await masteryReadback(tx, input.userId, keys);
  const item = current.find(state => state.key.scopeType === "item")!;
  const resolved = resolveProfessionMasteryOperation({
    operation: {
      ...identity, operationId: `craft_${input.receiptDigest}`, actorId: actor(input.userId),
      sourceReceiptId: input.receiptId, sourceEvidenceDigest: input.receiptDigest,
      serverSeed: input.serverSeed, resolutionIndex: input.resolutionIndex,
      baseOutputQuantityExact: plan.baseOutputQuantityExact, masteryLevelExact: item.progression.levelExact,
      qualityScoreExact: item.qualityScoreExact,
      activeDurationTicks: 1, repetitionStreak: 0, distinctContextCount: 1,
      resources: plan.inputItems.map(resource => ({ originId: resource.id, itemId: resource.baseItemKey, quantityExact: "1" })),
    },
    xp: { professionXpExact: plan.xpExact, activityXpExact: plan.xpExact, itemXpExact: plan.xpExact, qualityGainExact: "1" },
    currentByKey: Object.fromEntries(current.map(state => [canonicalScopedMasteryKey(state.key), state])),
  });
  const template: CraftingOutputTemplate = {
    baseItemKey: plan.outputItemId,
    quality: plan.quality,
    itemLevel: plan.outputItemLevel,
    affixes: plan.affixes.map(affix => ({ ...affix, stats: Object.fromEntries(Object.entries(affix.stats).map(([key, value]) => [key, Math.floor(value * resolved.envelope.modifiers.qualityPowerBps / 10_000)])) })),
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

export async function readCraftingMastery(reader: Reader, userId: number, identity: Readonly<{ professionId: AurionProfessionId; activityId: string; outputItemId: string }> = { professionId: "blacksmith", activityId: "temper_aurion_spear", outputItemId: "aurion_spear" }) {
  return masteryReadback(reader, userId, [masteryKeys.profession(identity.professionId), masteryKeys.recipe(identity.activityId), masteryKeys.item(identity.outputItemId)]);
}
