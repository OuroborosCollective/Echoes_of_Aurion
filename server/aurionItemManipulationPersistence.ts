import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { aurionItemInstancesV2, craftingReceipts, playerProfiles } from "../drizzle/schema";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { readCraftingMastery } from "./craftingProfessionPersistence";
import { getDb } from "./db";
import { assertV2InventoryIdentity, readCanonicalInventoryState } from "./aurionInventoryBackendAdapter";
import { aurionInventoryStateHash } from "./aurionInventoryTransactionProtocol";
import { inventoryItemShapeHash, inventoryMaxQuantityExact, inventoryMergeKey } from "./aurionInventoryStackIdentity";
import { getAurionItemManipulationRecipe } from "./aurionItemManipulationCatalog";
import { aurionLootCatalogV2 } from "./aurionLootCatalog";
import { lootItemPower } from "./aurionLootProtocol";
import { AURION_ITEM_MANIPULATION_RULESET_VERSION, resolveAurionItemManipulation, type ItemManipulationItem, type ItemManipulationResult } from "./aurionItemManipulationProtocol";

const token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
export const itemManipulationCommandSchema = z.object({
  recipeId: token, sourceItemId: token.optional(), materialItemIds: z.array(token).max(32),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
  expectedRevisionExact: z.string().regex(/^(0|[1-9][0-9]*)$/).max(128),
  expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();
export type ItemManipulationCommand = z.infer<typeof itemManipulationCommandSchema>;
type ItemRow = typeof aurionItemInstancesV2.$inferSelect;
type StoredResult = { result: ItemManipulationResult; beforeStateHash: string; afterStateHash: string; revisionExact: string; outputs: ItemRow[] };

export function manipulationItemFromRow(row: ItemRow): ItemManipulationItem {
  assertV2InventoryIdentity(row);
  return { id: row.id, deterministicHash: row.deterministicHash, baseItemDefinitionId: row.baseItemDefinitionId,
    category: row.category, quality: row.quality, itemLevelExact: row.itemLevelExact, itemPower: row.itemPower,
    affixes: JSON.parse(row.affixesJson), equipmentSlot: row.equipmentSlot ?? undefined, setId: row.setId ?? undefined,
    socketCount: row.socketCount, durabilityBps: row.durabilityBps };
}
export function manipulationOutputMatchesRow(output: ItemManipulationItem, row: ItemRow): boolean {
  const item = manipulationItemFromRow(row);
  return canonicalSha256(item) === canonicalSha256({ ...output, contextHash: undefined });
}

/** One shared owner lock, item authority and MariaDB transaction, with receipt-bound replay. */
export async function executeAurionItemManipulation(userId: number, raw: ItemManipulationCommand) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("OWNER_USER_ID_INVALID");
  const command = itemManipulationCommandSchema.parse(raw);
  command.materialItemIds.sort();
  if (new Set(command.materialItemIds).size !== command.materialItemIds.length || command.materialItemIds.includes(command.sourceItemId ?? "")) throw new Error("AURION_ITEM_INPUT_DUPLICATE");
  const recipe = getAurionItemManipulationRecipe(command.recipeId);
  const commandHash = canonicalSha256({ domain: "aurion.manipulation.command.v2", userId, command });
  const key = `manip:${userId}:${command.idempotencyKey}`;
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).for("update"))[0];
    if (!profile || profile.level < 1) throw new Error("AURION_ITEM_CAPABILITY_REQUIRED");
    const prior = (await tx.select().from(craftingReceipts).where(eq(craftingReceipts.idempotencyKey, key)))[0];
    if (prior) {
      if (prior.commandHash !== commandHash || prior.userId !== userId || !prior.resultJson) throw new Error("AURION_ITEM_IDEMPOTENCY_CONFLICT");
      const stored = JSON.parse(prior.resultJson) as StoredResult;
      if (canonicalSha256(stored).slice(7) !== prior.receiptDigest) throw new Error("AURION_ITEM_RECEIPT_CORRUPT");
      // Return the immutable effect receipt; current ownership/status can legitimately change later.
      return { applied: false, receipt: prior, ...stored };
    }
    const revision = profile.inventoryRevisionExact;
    const before = await readCanonicalInventoryState(tx, userId, revision);
    if (revision !== command.expectedRevisionExact || aurionInventoryStateHash(before) !== command.expectedStateHash) throw new Error("INVENTORY_STALE_STATE");
    const ids = [...command.materialItemIds, ...(command.sourceItemId ? [command.sourceItemId] : [])].sort();
    const rows = ids.length ? await tx.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.id, ids), eq(aurionItemInstancesV2.status, "owned"))).orderBy(aurionItemInstancesV2.id).for("update") : [];
    if (rows.length !== ids.length) throw new Error("AURION_ITEM_OWNED_INPUT_REQUIRED");
    rows.forEach(assertV2InventoryIdentity);
    const source = rows.find(row => row.id === command.sourceItemId);
    if ((recipe.operation === "craft") !== !source) throw new Error("AURION_ITEM_SOURCE_REQUIRED");
    if (source && source.quantityExact !== "1") throw new Error("AURION_ITEM_SOURCE_QUANTITY_INVALID");
    const materials = rows.filter(row => row.id !== command.sourceItemId);
    const available: Record<string, number> = {};
    for (const row of materials) {
      if (!(row.baseItemDefinitionId in recipe.materialRequirements) || row.category !== (row.baseItemDefinitionId.startsWith("component-shaping-") ? "shaping_component" : "crafting_component")) throw new Error("AURION_ITEM_UNEXPECTED_MATERIAL");
      const total = BigInt(available[row.baseItemDefinitionId] ?? 0) + BigInt(row.quantityExact);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("AURION_ITEM_MATERIAL_OVERFLOW");
      available[row.baseItemDefinitionId] = Number(total);
    }
    const count = (await tx.select({ count: sql<number>`count(*)` }).from(craftingReceipts).where(eq(craftingReceipts.userId, userId)))[0]?.count ?? 0;
    const operationIndex = Number(count) + 1;
    if (!Number.isSafeInteger(operationIndex) || operationIndex > 2_147_483_647) throw new Error("AURION_ITEM_OPERATION_INDEX_OVERFLOW");
    const receiptId = `craft_${canonicalSha256({ userId, key, commandHash, operationIndex, recipe }).slice(7, 55)}`;
    const mastery = await readCraftingMastery(tx, userId, { professionId: "blacksmith", activityId: recipe.id, outputItemId: recipe.outputItemDefinitionId ?? source!.baseItemDefinitionId });
    const craftingStateHash = canonicalSha256({ capability: "personal-workbench", tools: "aurion-basic-hand-tools.v1", playerLevel: profile.level, mastery });
    const result = resolveAurionItemManipulation({ operation: recipe.operation, receiptId, recipe, operationIndex, craftingStateHash,
      inputItemHashes: source ? [source.deterministicHash] : [], materialItemHashes: materials.map(row => row.deterministicHash),
      sourceItem: source ? manipulationItemFromRow(source) : undefined, materials: available, stationCapability: "personal-workbench" });
    // Validate the entire plan before any writes. Material allocation follows canonical stack IDs.
    const remaining = { ...result.consumedMaterials };
    for (const row of materials) {
      const needed = remaining[row.baseItemDefinitionId] ?? 0;
      const used = BigInt(needed) < BigInt(row.quantityExact) ? BigInt(needed) : BigInt(row.quantityExact);
      remaining[row.baseItemDefinitionId] = needed - Number(used);
      if (!used) continue;
      const quantity = BigInt(row.quantityExact) - used;
      await tx.update(aurionItemInstancesV2).set({ quantityExact: String(quantity), status: quantity ? "owned" : "consumed" }).where(eq(aurionItemInstancesV2.id, row.id));
    }
    if (source) await tx.update(aurionItemInstancesV2).set({ quantityExact: "0", status: "consumed" }).where(eq(aurionItemInstancesV2.id, source.id));
    let output = result.output;
    let quantityExact = "1";
    if (result.salvageYield) {
      const yields = Object.entries(result.salvageYield);
      if (yields.length !== 1) throw new Error("AURION_ITEM_SALVAGE_OUTPUT_BOUND");
      const [id, quantity] = yields[0]!;
      const base = aurionLootCatalogV2.baseItems.find(base => base.id === id);
      if (!base || base.category !== "crafting_component") throw new Error("AURION_ITEM_SALVAGE_DEFINITION_INVALID");
      output = { id: `item:${canonicalSha256({ receiptId, salvage: id }).slice(7, 55)}`, deterministicHash: canonicalSha256({ receiptId, salvageYield: result.salvageYield }).slice(7), baseItemDefinitionId: id,
        category: base.category, quality: "normal", itemLevelExact: "1", itemPower: lootItemPower(base, []), affixes: [], socketCount: 0, durabilityBps: 10000 };
      quantityExact = String(quantity);
    }
    if (!output) throw new Error("AURION_ITEM_OUTPUT_REQUIRED");
    const shape = { definitionId: output.baseItemDefinitionId, category: output.category, equipmentSlot: output.equipmentSlot ?? null,
      quality: output.quality, levelExact: output.itemLevelExact, affixesJson: JSON.stringify(output.affixes), setId: output.setId ?? null, itemPower: output.itemPower };
    await tx.insert(aurionItemInstancesV2).values({ id: output.id, ownerUserId: userId, craftingReceiptId: receiptId, originItemId: source?.id ?? null,
      baseItemDefinitionId: shape.definitionId, category: output.category, equipmentSlot: shape.equipmentSlot, quality: output.quality,
      itemLevelExact: output.itemLevelExact, affixesJson: shape.affixesJson, setId: shape.setId, itemPower: output.itemPower,
      deterministicHash: output.deterministicHash, socketCount: output.socketCount, durabilityBps: output.durabilityBps,
      quantityExact, maxQuantityExact: inventoryMaxQuantityExact(shape), mergeKey: inventoryMergeKey(shape), provenanceHash: inventoryItemShapeHash(shape) });
    const nextRevision = String(BigInt(revision) + 1n);
    if (nextRevision.length > 128) throw new Error("INVENTORY_REVISION_OVERFLOW");
    await tx.update(playerProfiles).set({ inventoryRevisionExact: nextRevision }).where(eq(playerProfiles.userId, userId));
    const after = await readCanonicalInventoryState(tx, userId, nextRevision);
    const outputs = await tx.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.craftingReceiptId, receiptId));
    if (outputs.length !== 1 || !manipulationOutputMatchesRow(output, outputs[0]!) || outputs[0]!.quantityExact !== quantityExact) throw new Error("AURION_ITEM_OUTPUT_READBACK_FAILED");
    const stored: StoredResult = JSON.parse(JSON.stringify({ result, beforeStateHash: aurionInventoryStateHash(before), afterStateHash: aurionInventoryStateHash(after), revisionExact: nextRevision, outputs }));
    await tx.insert(craftingReceipts).values({ id: receiptId, userId, recipeKey: recipe.id, recipeDigest: canonicalSha256(recipe).slice(7), ruleSetVersion: AURION_ITEM_MANIPULATION_RULESET_VERSION,
      contentVersion: recipe.version, inputItemId: source?.id ?? materials[0]!.id, receiptDigest: canonicalSha256(stored).slice(7), resolutionIndex: operationIndex, idempotencyKey: key,
      commandHash, resultJson: JSON.stringify(stored) });
    const receipt = (await tx.select().from(craftingReceipts).where(eq(craftingReceipts.id, receiptId)))[0]!;
    // Serialize DB timestamps consistently in the immutable stored receipt.
    return { applied: true, receipt, ...JSON.parse(receipt.resultJson!) as StoredResult };
  });
}

export async function readAurionItemManipulation(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const { readAurionInventorySnapshot } = await import("./aurionInventoryBackendAdapter");
  const { aurionItemManipulationRecipes } = await import("./aurionItemManipulationCatalog");
  const receipts = await db.select().from(craftingReceipts).where(and(eq(craftingReceipts.userId, userId), eq(craftingReceipts.ruleSetVersion, AURION_ITEM_MANIPULATION_RULESET_VERSION))).orderBy(craftingReceipts.resolutionIndex).limit(100);
  return { recipes: aurionItemManipulationRecipes, inventory: await readAurionInventorySnapshot(userId), receipts };
}
