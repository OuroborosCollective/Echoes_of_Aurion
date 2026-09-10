import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  aurionProgressionReceipts,
  aurionTradeCraftingReceipts,
  itemInstances,
  playerProfiles,
} from "../drizzle/schema";
import {
  aurionProfessionOutputBatches,
  aurionProfessionReceipts,
} from "../drizzle/professionPersistenceSchema";
import { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import {
  AX1_CRAFTING_CONTENT_VERSION,
  AX1_CRAFTING_SOURCE_REVISION,
  getAx1CraftingRecipe,
  type Ax1CraftingProfessionId,
  type Ax1CraftingRarity,
} from "../shared/ax1CraftingCatalog";
import {
  AX1_CRAFTING_RULESET_VERSION,
  resolveAx1CraftingPlan,
} from "./ax1CraftingProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import {
  commitCraftingProfession,
  prepareCraftingProfession,
  readCraftingMastery,
  readCraftingProfession,
} from "./craftingProfessionPersistence";
import { getDb } from "./db";
import {
  professionOutputOriginAt,
  type AurionProfessionId,
} from "./professionMasteryProtocol";
import { projectConfirmedProgressionTracks } from "./progressionReceiptPersistence";
import {
  normalizeTradeCraftingReceipt,
  recordTradeCraftingReceiptInTransaction,
  type TradeCraftingReceiptInput,
} from "./tradeCraftingReceiptPersistence";

const inputIdPattern = /^[A-Za-z0-9:_-]{1,64}$/;
const AX1_CRAFTING_INPUT_LIMIT = 32;

export const AX1_TO_AURION_PROFESSION: Readonly<Record<Ax1CraftingProfessionId, AurionProfessionId>> = Object.freeze({
  carpenter: "carpentry",
  blacksmith: "blacksmith",
  alchemist: "alchemy",
  tailor: "tailoring",
  leatherworker: "leatherworking",
});

const qualityByRarity: Readonly<Record<Ax1CraftingRarity, "normal" | "magic" | "rare">> = Object.freeze({
  common: "normal",
  uncommon: "magic",
  rare: "rare",
});

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

function affectedRowCount(result: unknown): number {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (!candidate || typeof candidate !== "object") return 0;
  return Number((candidate as { affectedRows?: number }).affectedRows ?? 0);
}

function canonicalInputIds(inputItemIds: readonly string[]): readonly string[] {
  if (inputItemIds.length < 1 || inputItemIds.length > AX1_CRAFTING_INPUT_LIMIT) throw new Error("AX1_CRAFTING_INPUT_COUNT_INVALID");
  const ids = inputItemIds.map(value => {
    if (!inputIdPattern.test(value)) throw new Error("AX1_CRAFTING_INPUT_ID_INVALID");
    return value;
  });
  if (new Set(ids).size !== ids.length) throw new Error("AX1_CRAFTING_INPUT_DUPLICATE");
  return Object.freeze(ids.slice().sort());
}

async function confirmedCharacterId(tx: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number): Promise<string> {
  const rows = await tx.select({
    id: aurionProgressionReceipts.id,
    userId: aurionProgressionReceipts.userId,
    characterId: aurionProgressionReceipts.characterId,
    actionKind: aurionProgressionReceipts.actionKind,
    weaponTrack: aurionProgressionReceipts.weaponTrack,
    skillId: aurionProgressionReceipts.skillId,
    resultReceiptId: aurionProgressionReceipts.resultReceiptId,
    sourceReceiptId: aurionProgressionReceipts.sourceReceiptId,
    lootReceiptId: aurionProgressionReceipts.lootReceiptId,
    masteryEventId: aurionProgressionReceipts.masteryEventId,
    xpGrantedExact: aurionProgressionReceipts.xpGrantedExact,
    levelExact: aurionProgressionReceipts.levelExact,
    ruleSetVersion: aurionProgressionReceipts.ruleSetVersion,
    contentVersion: aurionProgressionReceipts.contentVersion,
    receiptHash: aurionProgressionReceipts.receiptHash,
    idempotencyKey: aurionProgressionReceipts.idempotencyKey,
  }).from(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.userId, userId));
  const projected = projectConfirmedProgressionTracks(rows as Parameters<typeof projectConfirmedProgressionTracks>[0]);
  if (!projected.characterId) throw new Error("AX1_CRAFTING_CONFIRMED_CHARACTER_REQUIRED");
  return projected.characterId;
}

function safeProfessionLevel(levelExact: string): number {
  if (!/^[1-9][0-9]*$/.test(levelExact)) throw new Error("AX1_CRAFTING_PROFESSION_LEVEL_CORRUPT");
  const level = BigInt(levelExact);
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(level > maximum ? maximum : level);
}

function storedReceiptInput(row: typeof aurionTradeCraftingReceipts.$inferSelect): TradeCraftingReceiptInput {
  let resourceDeltas: TradeCraftingReceiptInput["resourceDeltas"];
  try {
    resourceDeltas = JSON.parse(row.resourceDeltasJson) as TradeCraftingReceiptInput["resourceDeltas"];
  } catch {
    throw new Error("AX1_CRAFTING_RECEIPT_CORRUPT");
  }
  return {
    userId: row.userId,
    characterId: row.characterId,
    operationKind: row.operationKind as "trade" | "crafting",
    operationId: row.operationId,
    sourceReceiptId: row.sourceReceiptId,
    worldRevision: row.worldRevision,
    marketContext: row.marketContext,
    professionContext: row.professionContext,
    resourceDeltas,
    resultJson: row.resultJson,
    resultHash: row.resultHash,
    idempotencyKey: row.idempotencyKey,
  };
}

function verifyStoredReceipt(row: typeof aurionTradeCraftingReceipts.$inferSelect, values: { userId: number; characterId: string; recipeId: string; inputItemIds: readonly string[] }) {
  let normalized: ReturnType<typeof normalizeTradeCraftingReceipt>;
  try {
    normalized = normalizeTradeCraftingReceipt(storedReceiptInput(row));
  } catch {
    throw new Error("AX1_CRAFTING_RECEIPT_CORRUPT");
  }
  const expectedId = `trade_crafting_${normalized.receiptHash.slice(0, 48)}`;
  if (row.receiptHash !== normalized.receiptHash || row.id !== expectedId || row.operationKind !== "crafting" || row.userId !== values.userId || row.characterId !== values.characterId) throw new Error("AX1_CRAFTING_RECEIPT_CORRUPT");
  const storedInputIds = normalized.resourceDeltas.map(delta => {
    if (delta.quantityExact !== "-1") throw new Error("AX1_CRAFTING_RECEIPT_CORRUPT");
    return delta.resourceId;
  }).sort();
  if (stableCatalogStringify(storedInputIds) !== stableCatalogStringify(values.inputItemIds)) throw new Error("AX1_CRAFTING_IDEMPOTENCY_CONFLICT");
  let result: { recipeId?: unknown };
  try { result = JSON.parse(row.resultJson) as { recipeId?: unknown }; }
  catch { throw new Error("AX1_CRAFTING_RECEIPT_CORRUPT"); }
  if (result.recipeId !== values.recipeId) throw new Error("AX1_CRAFTING_IDEMPOTENCY_CONFLICT");
  return normalized;
}

async function replayReadback(tx: NonNullable<Awaited<ReturnType<typeof getDb>>>, row: typeof aurionTradeCraftingReceipts.$inferSelect, values: { userId: number; characterId: string; recipeId: string; inputItemIds: readonly string[] }) {
  const normalized = verifyStoredReceipt(row, values);
  const professionRow = (await tx.select({ id: aurionProfessionReceipts.id }).from(aurionProfessionReceipts).where(and(eq(aurionProfessionReceipts.userId, values.userId), eq(aurionProfessionReceipts.sourceCraftingReceiptId, row.id))).limit(1))[0];
  if (!professionRow) throw new Error("AX1_CRAFTING_PROFESSION_RECEIPT_MISSING");
  const profession = await readCraftingProfession(tx, values.userId, row.id, professionRow.id);
  const outputs = await tx.select().from(itemInstances).where(and(eq(itemInstances.craftingReceiptId, row.id), eq(itemInstances.sourceKind, "crafting")));
  if (outputs.length < 1) throw new Error("AX1_CRAFTING_OUTPUT_READBACK_FAILED");
  outputs.sort((left, right) => String(left.craftingOutputKey ?? left.id).localeCompare(String(right.craftingOutputKey ?? right.id)));
  return Object.freeze({ applied: false as const, receiptId: row.id, receiptHash: normalized.receiptHash, outputs: Object.freeze(outputs), profession });
}

/**
 * AX1-first crafting write path. The browser supplies only a recipe identity and
 * concrete inventory origins. Character identity, profession mastery, material
 * composition, yield and every write are server-derived and committed in one
 * MariaDB transaction.
 */
export async function craftAx1RecipeForUser(values: { userId: number; recipeId: string; inputItemIds: readonly string[] }) {
  if (!Number.isSafeInteger(values.userId) || values.userId < 1) throw new Error("AX1_CRAFTING_USER_INVALID");
  const recipe = getAx1CraftingRecipe(values.recipeId);
  if (!recipe) throw new Error("AX1_CRAFTING_RECIPE_UNKNOWN");
  const inputItemIds = canonicalInputIds(values.inputItemIds);
  const professionId = AX1_TO_AURION_PROFESSION[recipe.professionId];
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  return db.transaction(async tx => {
    // One player lock serializes crafting resolution index, replay and overlapping
    // bundles without weakening the per-item FOR UPDATE ownership locks below.
    const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, values.userId)).for("update").limit(1))[0];
    if (!profile) throw new Error("AX1_CRAFTING_PLAYER_PROFILE_REQUIRED");
    const characterId = await confirmedCharacterId(tx as NonNullable<Awaited<ReturnType<typeof getDb>>>, values.userId);
    const requestHash = sha256(stableCatalogStringify({ version: "ax1-crafting-request.v1", userId: values.userId, characterId, recipeId: recipe.id, inputItemIds }));
    const idempotencyKey = `ax1_craft_${requestHash.slice(0, 48)}`;

    const prior = (await tx.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (prior) return replayReadback(tx as NonNullable<Awaited<ReturnType<typeof getDb>>>, prior, { userId: values.userId, characterId, recipeId: recipe.id, inputItemIds });

    const lockedInputs = await tx.select({ id: itemInstances.id, ownerUserId: itemInstances.ownerUserId, status: itemInstances.status, baseItemKey: itemInstances.baseItemKey, itemLevel: itemInstances.itemLevel }).from(itemInstances).where(and(inArray(itemInstances.id, inputItemIds), eq(itemInstances.ownerUserId, values.userId), eq(itemInstances.status, "owned"))).for("update");
    lockedInputs.sort((left, right) => left.id.localeCompare(right.id));
    if (lockedInputs.length !== inputItemIds.length || stableCatalogStringify(lockedInputs.map(item => item.id)) !== stableCatalogStringify(inputItemIds)) throw new Error("AX1_CRAFTING_INPUT_UNAVAILABLE");

    const mastery = await readCraftingMastery(tx, values.userId, { professionId, activityId: recipe.id, outputItemId: recipe.outputItemId });
    const professionState = mastery.find(state => state.key.scopeType === "profession");
    if (!professionState) throw new Error("AX1_CRAFTING_PROFESSION_MASTERY_REQUIRED");
    const professionLevel = safeProfessionLevel(professionState.progression.levelExact);
    const plan = resolveAx1CraftingPlan({ recipeId: recipe.id, professionLevel, inputs: lockedInputs.map(item => ({ id: item.id, baseItemKey: item.baseItemKey })) });

    const resultJson = stableCatalogStringify({
      schemaVersion: 1,
      sourceRevision: AX1_CRAFTING_SOURCE_REVISION,
      contentVersion: AX1_CRAFTING_CONTENT_VERSION,
      ruleSetVersion: AX1_CRAFTING_RULESET_VERSION,
      recipeId: plan.recipeId,
      recipeDigest: plan.recipeDigest,
      inputBundleDigest: plan.inputBundleDigest,
      deterministicHash: plan.deterministicHash,
      outputItemId: plan.outputItemId,
      baseOutputQuantityExact: String(plan.outputQuantity),
      xpExact: String(plan.xpReward),
    });
    const receiptInput: TradeCraftingReceiptInput = {
      userId: values.userId,
      characterId,
      operationKind: "crafting",
      operationId: `ax1_craft_${plan.deterministicHash.slice(0, 48)}`,
      sourceReceiptId: `ax1_catalog_${plan.recipeDigest.slice(0, 48)}`,
      worldRevision: GLOBAL_WORLD_ID,
      marketContext: "direct_self_crafting",
      professionContext: professionId,
      resourceDeltas: lockedInputs.map(item => ({ resourceId: item.id, quantityExact: "-1" })),
      resultJson,
      resultHash: sha256(resultJson),
      idempotencyKey,
    };
    const normalizedReceipt = normalizeTradeCraftingReceipt(receiptInput);
    const sourceReceiptId = `trade_crafting_${normalizedReceipt.receiptHash.slice(0, 48)}`;
    const receiptCount = await tx.select({ count: sql<number>`count(*)` }).from(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, values.userId));
    const resolutionIndex = Number(receiptCount[0]?.count ?? 0) + 1;
    if (!Number.isSafeInteger(resolutionIndex) || resolutionIndex < 1) throw new Error("AX1_CRAFTING_RESOLUTION_INDEX_INVALID");

    const prepared = await prepareCraftingProfession(tx, {
      userId: values.userId,
      receiptId: sourceReceiptId,
      receiptDigest: normalizedReceipt.receiptHash,
      resolutionIndex,
      serverSeed: GLOBAL_WORLD_SEED,
      canonicalPlan: {
        professionId,
        activityId: recipe.id,
        outputItemId: recipe.outputItemId,
        baseOutputQuantityExact: String(recipe.outputQuantity),
        xpExact: String(recipe.xpReward),
        quality: qualityByRarity[recipe.rarity],
        affixes: Object.freeze([]),
        outputItemLevel: recipe.requiredLevel,
        inputItems: Object.freeze(lockedInputs.map(item => Object.freeze({ id: item.id, baseItemKey: item.baseItemKey, itemLevel: item.itemLevel }))),
      },
    });

    const receipt = await recordTradeCraftingReceiptInTransaction(tx, receiptInput);
    if (!receipt.applied || receipt.receiptId !== sourceReceiptId || receipt.receiptHash !== normalizedReceipt.receiptHash) throw new Error("AX1_CRAFTING_RECEIPT_COMMIT_MISMATCH");

    const consumed = await tx.update(itemInstances).set({ status: "consumed" }).where(and(inArray(itemInstances.id, inputItemIds), eq(itemInstances.ownerUserId, values.userId), eq(itemInstances.status, "owned")));
    if (affectedRowCount(consumed) !== inputItemIds.length) throw new Error("AX1_CRAFTING_INPUT_CONCURRENT_CHANGE");

    const outputIds = Array.from({ length: recipe.outputQuantity }, (_, index) => professionOutputOriginAt(prepared.envelope, String(index)));
    await tx.insert(itemInstances).values(outputIds.map(id => ({
      id,
      ownerUserId: values.userId,
      sourceKind: "crafting" as const,
      craftingReceiptId: receipt.receiptId,
      craftingOutputKey: id,
      baseItemKey: recipe.outputItemId,
      quality: qualityByRarity[recipe.rarity],
      itemLevel: recipe.requiredLevel,
      affixesJson: "[]",
    })));

    await commitCraftingProfession(tx, values.userId, prepared);
    if (recipe.outputQuantity > 1) {
      const advanced = await tx.update(aurionProfessionOutputBatches).set({ nextOutputIndexExact: String(recipe.outputQuantity) }).where(and(eq(aurionProfessionOutputBatches.professionReceiptId, prepared.envelope.receiptId), eq(aurionProfessionOutputBatches.ownerUserId, values.userId), eq(aurionProfessionOutputBatches.nextOutputIndexExact, "1")));
      if (affectedRowCount(advanced) !== 1) throw new Error("AX1_CRAFTING_OUTPUT_RANGE_ADVANCE_FAILED");
    }

    const profession = await readCraftingProfession(tx, values.userId, receipt.receiptId, prepared.envelope.receiptId);
    const outputs = await tx.select().from(itemInstances).where(and(eq(itemInstances.craftingReceiptId, receipt.receiptId), eq(itemInstances.sourceKind, "crafting")));
    outputs.sort((left, right) => String(left.craftingOutputKey ?? left.id).localeCompare(String(right.craftingOutputKey ?? right.id)));
    if (outputs.length !== recipe.outputQuantity) throw new Error("AX1_CRAFTING_BASE_OUTPUT_READBACK_FAILED");
    return Object.freeze({ applied: true as const, receiptId: receipt.receiptId, receiptHash: receipt.receiptHash, plan, outputs: Object.freeze(outputs), profession });
  });
}
