import { createHash } from "node:crypto";

export const AURION_CRAFTING_RULESET_VERSION = "aurion-crafting-v1" as const;
export const AURION_CRAFTING_CONTENT_VERSION = "aurion-crafting-content-v1" as const;

export type CraftingItemQuality = "normal" | "magic" | "rare" | "set" | "unique";
export type CraftingAffix = {
  key: string;
  slot: "prefix" | "suffix";
  stats: Readonly<Record<string, number>>;
};

export type AurionCraftingRecipe = {
  key: "temper_aurion_spear";
  title: string;
  requiredLevel: number;
  input: {
    baseItemKey: "aurion_spear";
    quality: "normal";
    minItemLevel: number;
  };
  output: {
    baseItemKey: "aurion_spear";
    quality: "magic";
    affixes: readonly CraftingAffix[];
  };
  craftingXpExact: string;
  ruleSetVersion: typeof AURION_CRAFTING_RULESET_VERSION;
  contentVersion: typeof AURION_CRAFTING_CONTENT_VERSION;
};

export type CraftingInputItem = {
  id: string;
  baseItemKey: string;
  quality: CraftingItemQuality;
  itemLevel: number;
};

export type CraftingPlan = {
  recipe: AurionCraftingRecipe;
  inputItemId: string;
  output: AurionCraftingRecipe["output"];
  recipeDigest: string;
};

export type CraftingPlanFailure = "recipe_not_found" | "level_too_low" | "input_not_eligible";

function stableStats(stats: Readonly<Record<string, number>>): string {
  return Object.entries(stats)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

function stableAffixes(affixes: readonly CraftingAffix[]): string {
  return [...affixes]
    .sort((left, right) => `${left.slot}:${left.key}`.localeCompare(`${right.slot}:${right.key}`))
    .map(affix => `${affix.slot}:${affix.key}:${stableStats(affix.stats)}`)
    .join("|");
}

function digest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

const recipes: readonly AurionCraftingRecipe[] = Object.freeze([
  Object.freeze({
    key: "temper_aurion_spear",
    title: "Aurionspeer tempern",
    requiredLevel: 1,
    input: Object.freeze({ baseItemKey: "aurion_spear", quality: "normal", minItemLevel: 1 }),
    output: Object.freeze({
      baseItemKey: "aurion_spear",
      quality: "magic",
      affixes: Object.freeze([
        Object.freeze({ key: "tempered", slot: "prefix", stats: Object.freeze({ power: 2 }) }),
      ]),
    }),
    craftingXpExact: "6",
    ruleSetVersion: AURION_CRAFTING_RULESET_VERSION,
    contentVersion: AURION_CRAFTING_CONTENT_VERSION,
  }),
]);

export function listAurionCraftingRecipes(): readonly AurionCraftingRecipe[] {
  return recipes;
}

export function getAurionCraftingRecipe(recipeKey: string): AurionCraftingRecipe | undefined {
  return recipes.find(recipe => recipe.key === recipeKey);
}

export function craftingRecipeDigest(recipe: AurionCraftingRecipe): string {
  return digest([
    "AURION_CRAFTING_RECIPE_V1",
    recipe.key,
    recipe.requiredLevel.toString(),
    recipe.input.baseItemKey,
    recipe.input.quality,
    recipe.input.minItemLevel.toString(),
    recipe.output.baseItemKey,
    recipe.output.quality,
    stableAffixes(recipe.output.affixes),
    recipe.craftingXpExact,
    recipe.ruleSetVersion,
    recipe.contentVersion,
  ]);
}

export function resolveAurionCraftingPlan(input: {
  recipeKey: string;
  playerLevel: number;
  item: CraftingInputItem;
}): { ok: true; plan: CraftingPlan } | { ok: false; reason: CraftingPlanFailure } {
  const recipe = getAurionCraftingRecipe(input.recipeKey);
  if (!recipe) return { ok: false, reason: "recipe_not_found" };
  if (input.playerLevel < recipe.requiredLevel) return { ok: false, reason: "level_too_low" };
  const eligible = input.item.baseItemKey === recipe.input.baseItemKey &&
    input.item.quality === recipe.input.quality &&
    input.item.itemLevel >= recipe.input.minItemLevel;
  if (!eligible) return { ok: false, reason: "input_not_eligible" };
  return {
    ok: true,
    plan: {
      recipe,
      inputItemId: input.item.id,
      output: recipe.output,
      recipeDigest: craftingRecipeDigest(recipe),
    },
  };
}

export function resolveCraftingResolutionIndex(priorCraftCount: number): number {
  if (!Number.isSafeInteger(priorCraftCount) || priorCraftCount < 0) throw new Error("Ungültiger Crafting-Auflösungsindex.");
  return priorCraftCount + 1;
}

export function craftingReceiptDigest(input: {
  userId: number;
  idempotencyKey: string;
  plan: CraftingPlan;
  resolutionIndex: number;
}): string {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new Error("Ungültige Spielerkennung für Crafting-Receipt.");
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new Error("Ungültiger Crafting-Idempotenzschlüssel.");
  if (!Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 1) throw new Error("Ungültiger Crafting-Auflösungsindex.");
  return digest([
    "AURION_CRAFT_RECEIPT_V1",
    input.userId.toString(),
    input.idempotencyKey,
    input.plan.inputItemId,
    input.plan.recipe.key,
    input.plan.recipeDigest,
    input.resolutionIndex.toString(),
  ]);
}
