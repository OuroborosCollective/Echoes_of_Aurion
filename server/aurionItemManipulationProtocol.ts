import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { resolveLootAffixesForManipulation, lootItemPower, type AurionEquipmentSlot, type AurionItemCategory, type AurionLootQuality, type ResolvedLootAffix } from "./aurionLootProtocol";

import { aurionLootCatalogV2 } from "./aurionLootCatalog";
import { itemManipulationSourceEvidenceHash } from "./economy/economicSourceEvidence";

export const AURION_ITEM_MANIPULATION_RULESET_VERSION = "aurion-item-manipulation.v2" as const;
export const aurionItemOperations = ["craft", "reforge", "augment", "upgrade", "socket", "shaping", "salvage", "repair"] as const;
export type AurionItemOperation = (typeof aurionItemOperations)[number];

export type ItemManipulationItem = Readonly<{
  id: string;
  deterministicHash: string;
  baseItemDefinitionId: string;
  category: AurionItemCategory;
  quality: AurionLootQuality;
  itemLevelExact: string;
  itemPower: number;
  affixes: readonly ResolvedLootAffix[];
  equipmentSlot?: AurionEquipmentSlot;
  setId?: string;
  contextHash?: string;
  socketCount: number;
  durabilityBps: number;
}>;

export type ItemManipulationRecipe = Readonly<{
  id: string;
  version: string;
  operation: AurionItemOperation;
  outputItemDefinitionId?: string;
  allowedCategories: readonly AurionItemCategory[];
  allowedAffixIds: readonly string[];
  maxAffixSlots: number;
  requiredCapability: string;
  maxItemLevelExact?: string;
  materialRequirements: Readonly<Record<string, number>>;
  salvageYield: Readonly<Record<string, number>>;
}>;

export type ItemManipulationInput = Readonly<{
  operation: AurionItemOperation;
  receiptId: string;
  inputItemHashes: readonly string[];
  recipe: ItemManipulationRecipe;
  sourceItem?: ItemManipulationItem;
  materialItemHashes?: readonly string[];
  craftingStateHash?: string;
  materials: Readonly<Record<string, number>>;
  stationCapability: string;
  operationIndex: number;
}>;

export type ItemManipulationResult = Readonly<{
  operation: AurionItemOperation;
  receiptId: string;
  recipeId: string;
  recipeVersion: string;
  consumedMaterials: Readonly<Record<string, number>>;
  consumedItemHashes: readonly string[];
  output?: ItemManipulationItem;
  salvageYield?: Readonly<Record<string, number>>;
  sourceEvidenceHash: string;
  deterministicHash: string;
}>;

const textCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const exact = (value: string, label: string): bigint => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label}_INVALID`);
  return BigInt(value);
};
const nonEmpty = (value: string, code: string) => { if (!value.trim()) throw new Error(code); };
const canonicalRecord = (value: Readonly<Record<string, number>>, code: string): Readonly<Record<string, number>> => {
  const entries = Object.entries(value).sort(([a], [b]) => textCompare(a, b));
  const result: Record<string, number> = {};
  for (const [key, quantity] of entries) {
    nonEmpty(key, code);
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error(code);
    if (quantity > 0) result[key] = quantity;
  }
  return Object.freeze(result);
};

function canonicalMaterials(recipe: ItemManipulationRecipe, materials: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const required = canonicalRecord(recipe.materialRequirements, "AURION_ITEM_MATERIAL_REQUIREMENT_INVALID");
  const available = canonicalRecord(materials, "AURION_ITEM_MATERIAL_INPUT_INVALID");
  for (const [id, quantity] of Object.entries(required)) if ((available[id] ?? 0) < quantity) throw new Error("AURION_ITEM_INSUFFICIENT_MATERIALS");
  for (const id of Object.keys(available)) if (!(id in required)) throw new Error("AURION_ITEM_UNEXPECTED_MATERIAL");
  return required;
}

function stableAffixIds(recipe: ItemManipulationRecipe): readonly string[] {
  const ids = [...new Set(recipe.allowedAffixIds)].sort(textCompare);
  if (ids.length !== recipe.allowedAffixIds.length || ids.some(id => !id.trim())) throw new Error("AURION_ITEM_AFFIX_CATALOG_INVALID");
  return Object.freeze(ids);
}

function assertCommon(input: ItemManipulationInput): Readonly<Record<string, number>> {
  if (input.operation !== input.recipe.operation) throw new Error("AURION_ITEM_OPERATION_RECIPE_MISMATCH");
  if (!aurionItemOperations.includes(input.operation)) throw new Error("AURION_ITEM_OPERATION_INVALID");
  nonEmpty(input.receiptId, "AURION_ITEM_RECEIPT_REQUIRED");
  nonEmpty(input.recipe.id, "AURION_ITEM_RECIPE_REQUIRED");
  nonEmpty(input.recipe.version, "AURION_ITEM_RECIPE_VERSION_REQUIRED");
  nonEmpty(input.stationCapability, "AURION_ITEM_CAPABILITY_REQUIRED");
  if (input.stationCapability !== input.recipe.requiredCapability) throw new Error("AURION_ITEM_CAPABILITY_MISMATCH");
  if (!Number.isSafeInteger(input.operationIndex) || input.operationIndex < 0) throw new Error("AURION_ITEM_OPERATION_INDEX_INVALID");
  if (!Number.isSafeInteger(input.recipe.maxAffixSlots) || input.recipe.maxAffixSlots < 0 || input.recipe.maxAffixSlots > 5) throw new Error("AURION_ITEM_AFFIX_SLOT_BOUND_INVALID");
  if (input.craftingStateHash !== undefined && !/^sha256:[a-f0-9]{64}$/.test(input.craftingStateHash)) throw new Error("AURION_ITEM_CRAFTING_STATE_INVALID");
  if (input.materialItemHashes?.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error("AURION_ITEM_MATERIAL_HASH_INVALID");
  if (input.inputItemHashes.some(hash => !/^[a-f0-9]{64}$/.test(hash)) || new Set(input.inputItemHashes).size !== input.inputItemHashes.length) throw new Error("AURION_ITEM_INPUT_HASH_INVALID");
  stableAffixIds(input.recipe);
  return canonicalMaterials(input.recipe, input.materials);
}

function seed(input: ItemManipulationInput, label: string): string {
  return canonicalSha256({ domain: "aurion.item-manipulation.roll.v2", ruleSetVersion: AURION_ITEM_MANIPULATION_RULESET_VERSION, receiptId: input.receiptId, inputItemHashes: [...input.inputItemHashes, ...(input.materialItemHashes ?? [])].sort(textCompare), recipeVersion: input.recipe.version, operationIndex: input.operationIndex, craftingStateHash: input.craftingStateHash, label });
}

function outputFor(input: ItemManipulationInput): ItemManipulationItem | undefined {
  const source = input.sourceItem;
  if (input.operation !== "craft" && !source) throw new Error("AURION_ITEM_SOURCE_REQUIRED");
  if (input.operation === "craft" && (source || input.inputItemHashes.length)) throw new Error("AURION_ITEM_CRAFT_SOURCE_INVALID");
  if (source && (!input.recipe.allowedCategories.includes(source.category))) throw new Error("AURION_ITEM_CATEGORY_NOT_ALLOWED");
  if (source && (input.inputItemHashes.length !== 1 || input.inputItemHashes[0] !== source.deterministicHash)) throw new Error("AURION_ITEM_SOURCE_HASH_MISMATCH");
  if (source && (!Number.isSafeInteger(source.socketCount) || source.socketCount < 0 || source.socketCount > 5 || !Number.isSafeInteger(source.durabilityBps) || source.durabilityBps < 0 || source.durabilityBps > 10_000 || !Number.isSafeInteger(source.itemPower) || source.itemPower < 0)) throw new Error("AURION_ITEM_SOURCE_STATE_INVALID");
  const level = source ? exact(source.itemLevelExact, "AURION_ITEM_SOURCE_LEVEL") : 1n;
  if (level < 1n) throw new Error("AURION_ITEM_SOURCE_LEVEL_INVALID");
  const nextLevel = input.operation === "upgrade" ? level + 1n : level;
  if (nextLevel.toString().length > 128 || (input.recipe.maxItemLevelExact && nextLevel > exact(input.recipe.maxItemLevelExact, "AURION_ITEM_MAX_LEVEL"))) throw new Error("AURION_ITEM_LEVEL_CAP");
  if (input.operation === "salvage") return undefined;
  const definitionId = input.recipe.outputItemDefinitionId ?? source?.baseItemDefinitionId;
  const base = aurionLootCatalogV2.baseItems.find(base => base.id === definitionId);
  if (!base || !input.recipe.allowedCategories.includes(base.category)) throw new Error("AURION_ITEM_DEFINITION_INVALID");
  if (source && input.operation !== "shaping" && base.id !== source.baseItemDefinitionId) throw new Error("AURION_ITEM_BASE_CHANGE_FORBIDDEN");
  if (source?.setId && !aurionLootCatalogV2.sets.some(set => set.id === source.setId && set.pieceBaseItemIds.includes(base.id))) throw new Error("AURION_ITEM_SET_MISMATCH");
  const allowed = stableAffixIds(input.recipe);
  if (allowed.some(id => !aurionLootCatalogV2.affixes.some(affix => affix.id === id))) throw new Error("AURION_ITEM_AFFIX_CATALOG_INVALID");
  const context = {
    worldId: "echoes-of-aurion-global", zoneId: "personal-workbench", monsterArchetypeId: input.recipe.id,
    encounterReceiptId: input.receiptId, ruleSetVersion: AURION_ITEM_MANIPULATION_RULESET_VERSION, contentVersion: input.recipe.version,
    resolutionIndex: input.operationIndex, playerLevelExact: nextLevel.toString(), zoneLevelExact: nextLevel.toString(),
    monsterLevelExact: nextLevel.toString(), luckBps: 0, serverSeedDigest: seed(input, "operation"),
  };
  const retained = input.operation === "craft" || input.operation === "reforge" ? [] : source?.affixes ?? [];
  const count = input.operation === "craft" || input.operation === "augment" ? 1 : input.operation === "reforge" ? Math.max(1, source!.affixes.length) : 0;
  if (retained.length + count > input.recipe.maxAffixSlots) throw new Error("AURION_ITEM_AFFIX_SLOTS_FULL");
  const affixes = resolveLootAffixesForManipulation({ context, base, levelExact: nextLevel.toString(),
    catalog: count ? aurionLootCatalogV2.affixes.filter(affix => allowed.includes(affix.id) || retained.some(prior => prior.id === affix.id)) : aurionLootCatalogV2.affixes,
    count, retained });
  const socketCount = (source?.socketCount ?? 0) + (input.operation === "socket" ? 1 : 0);
  if (socketCount > input.recipe.maxAffixSlots) throw new Error("AURION_ITEM_SOCKET_CAP");
  const item = {
    id: `item:${canonicalSha256({ receiptId: input.receiptId, operationIndex: input.operationIndex }).slice(7, 55)}`,
    deterministicHash: "", baseItemDefinitionId: base.id, category: base.category, equipmentSlot: base.equipmentSlot,
    quality: (source?.quality === "normal" || source?.quality === "magic") && affixes.length > 1 ? "rare" as const : source?.quality === "normal" && affixes.length ? "magic" as const : source?.quality ?? "magic" as AurionLootQuality, itemLevelExact: nextLevel.toString(),
    itemPower: lootItemPower(base, affixes), affixes, setId: source?.setId,
    socketCount, durabilityBps: input.operation === "repair" ? 10_000 : source?.durabilityBps ?? 10_000,
    contextHash: seed(input, "context").slice(7),
  };
  const deterministicHash = canonicalSha256({ domain: "aurion.item-manipulation.item.v2", ...item });
  return Object.freeze({ ...item, deterministicHash: deterministicHash.slice(7) });
}

export function resolveAurionItemManipulation(input: ItemManipulationInput): ItemManipulationResult {
  const consumedMaterials = assertCommon(input);
  const output = outputFor(input);
  const salvageYield = input.operation === "salvage" ? canonicalRecord(input.recipe.salvageYield, "AURION_ITEM_SALVAGE_YIELD_INVALID") : undefined;
  if (input.operation === "salvage" && !input.sourceItem) throw new Error("AURION_ITEM_SOURCE_REQUIRED");
  const sourceEvidenceHash = itemManipulationSourceEvidenceHash({ receiptId: input.receiptId, operation: input.operation,
    recipeId: input.recipe.id, recipeVersion: input.recipe.version, craftingStateHash: input.craftingStateHash,
    recipe: { ...input.recipe, allowedCategories: [...input.recipe.allowedCategories].sort(textCompare), allowedAffixIds: stableAffixIds(input.recipe) },
    consumedItemHashes: [...input.inputItemHashes, ...(input.materialItemHashes ?? [])].sort(textCompare), consumedMaterials,
    output: output ?? null, salvageYield: salvageYield ?? null });
  const deterministicHash = canonicalSha256({ domain: "aurion.item-manipulation.receipt.v2", ruleSetVersion: AURION_ITEM_MANIPULATION_RULESET_VERSION, sourceEvidenceHash, rollSeed: seed(input, "operation") });
  return Object.freeze({ operation: input.operation, receiptId: input.receiptId, recipeId: input.recipe.id, recipeVersion: input.recipe.version, consumedMaterials, consumedItemHashes: Object.freeze([...input.inputItemHashes].sort(textCompare)), output, salvageYield, sourceEvidenceHash, deterministicHash });
}
