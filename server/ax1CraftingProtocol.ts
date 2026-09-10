import { createHash } from "node:crypto";
import {
  AX1_CRAFTING_CONTENT_VERSION,
  AX1_CRAFTING_SOURCE_REVISION,
  getAx1CraftingRecipe,
  type Ax1CraftingIngredient,
  type Ax1CraftingProfessionId,
  type Ax1CraftingRecipe,
} from "../shared/ax1CraftingCatalog";

export const AX1_CRAFTING_RULESET_VERSION = "ax1-crafting-rules-v1" as const;
export const AX1_CRAFTING_INPUT_LIMIT = 64 as const;

export interface Ax1CraftingInputItem {
  readonly id: string;
  readonly baseItemKey: string;
}

export interface Ax1CraftingPlan {
  readonly recipeId: string;
  readonly recipeDigest: string;
  readonly professionId: Ax1CraftingProfessionId;
  readonly professionLevel: number;
  readonly inputItemIds: readonly string[];
  readonly inputBundleDigest: string;
  readonly outputItemId: string;
  readonly outputQuantity: number;
  readonly xpReward: number;
  readonly contentVersion: typeof AX1_CRAFTING_CONTENT_VERSION;
  readonly ruleSetVersion: typeof AX1_CRAFTING_RULESET_VERSION;
  readonly sourceRevision: typeof AX1_CRAFTING_SOURCE_REVISION;
  readonly deterministicHash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeIdentifier(value: string, maximumLength: number, errorCode: string): void {
  if (!value || value.length > maximumLength || !/^[A-Za-z0-9:_-]+$/.test(value)) {
    throw new Error(errorCode);
  }
}

function canonicalIngredients(ingredients: readonly Ax1CraftingIngredient[]): readonly [string, number][] {
  return Object.freeze(
    ingredients
      .map(ingredient => [ingredient.itemId, ingredient.quantity] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function recipePayload(recipe: Ax1CraftingRecipe): object {
  return {
    sourceRevision: AX1_CRAFTING_SOURCE_REVISION,
    contentVersion: AX1_CRAFTING_CONTENT_VERSION,
    id: recipe.id,
    name: recipe.name,
    germanName: recipe.germanName,
    professionId: recipe.professionId,
    requiredLevel: recipe.requiredLevel,
    xpReward: recipe.xpReward,
    craftTimeSeconds: recipe.craftTimeSeconds,
    outputItemId: recipe.outputItemId,
    outputQuantity: recipe.outputQuantity,
    category: recipe.category,
    rarity: recipe.rarity,
    ingredients: canonicalIngredients(recipe.ingredients),
  };
}

export function ax1CraftingRecipeDigest(recipeId: string): string {
  const recipe = getAx1CraftingRecipe(recipeId);
  if (!recipe) throw new Error("AX1_CRAFTING_RECIPE_UNKNOWN");
  return sha256(JSON.stringify(recipePayload(recipe)));
}

function expectedMaterialCounts(recipe: Ax1CraftingRecipe): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const ingredient of recipe.ingredients) {
    if (!Number.isSafeInteger(ingredient.quantity) || ingredient.quantity < 1) {
      throw new Error("AX1_CRAFTING_CATALOG_QUANTITY_INVALID");
    }
    counts.set(ingredient.itemId, (counts.get(ingredient.itemId) ?? 0) + ingredient.quantity);
  }
  return counts;
}

export function canonicalizeAx1CraftingInputs(inputs: readonly Ax1CraftingInputItem[]): readonly Ax1CraftingInputItem[] {
  if (inputs.length < 1 || inputs.length > AX1_CRAFTING_INPUT_LIMIT) {
    throw new Error("AX1_CRAFTING_INPUT_COUNT_INVALID");
  }

  const seen = new Set<string>();
  const normalized = inputs.map(input => {
    assertSafeIdentifier(input.id, 64, "AX1_CRAFTING_INPUT_ID_INVALID");
    assertSafeIdentifier(input.baseItemKey, 96, "AX1_CRAFTING_INPUT_ITEM_KEY_INVALID");
    if (seen.has(input.id)) throw new Error("AX1_CRAFTING_INPUT_DUPLICATE");
    seen.add(input.id);
    return Object.freeze({ id: input.id, baseItemKey: input.baseItemKey });
  });

  normalized.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(normalized);
}

export function resolveAx1CraftingPlan(values: {
  readonly recipeId: string;
  readonly professionLevel: number;
  readonly inputs: readonly Ax1CraftingInputItem[];
}): Ax1CraftingPlan {
  assertSafeIdentifier(values.recipeId, 96, "AX1_CRAFTING_RECIPE_ID_INVALID");
  const recipe = getAx1CraftingRecipe(values.recipeId);
  if (!recipe) throw new Error("AX1_CRAFTING_RECIPE_UNKNOWN");
  if (!Number.isSafeInteger(values.professionLevel) || values.professionLevel < 1 || values.professionLevel > 100) {
    throw new Error("AX1_CRAFTING_PROFESSION_LEVEL_INVALID");
  }
  if (values.professionLevel < recipe.requiredLevel) {
    throw new Error("AX1_CRAFTING_PROFESSION_LEVEL_TOO_LOW");
  }

  const inputs = canonicalizeAx1CraftingInputs(values.inputs);
  const expected = expectedMaterialCounts(recipe);
  const expectedTotal = Array.from(expected.values()).reduce((sum, quantity) => sum + quantity, 0);
  if (inputs.length !== expectedTotal) throw new Error("AX1_CRAFTING_MATERIAL_COUNT_MISMATCH");

  const actual = new Map<string, number>();
  for (const input of inputs) actual.set(input.baseItemKey, (actual.get(input.baseItemKey) ?? 0) + 1);

  for (const [materialId, expectedQuantity] of expected.entries()) {
    if ((actual.get(materialId) ?? 0) !== expectedQuantity) {
      throw new Error("AX1_CRAFTING_MATERIAL_REQUIREMENT_MISMATCH");
    }
  }
  for (const materialId of actual.keys()) {
    if (!expected.has(materialId)) throw new Error("AX1_CRAFTING_MATERIAL_UNEXPECTED");
  }

  const recipeDigest = ax1CraftingRecipeDigest(recipe.id);
  const inputBundleDigest = sha256(JSON.stringify(inputs.map(input => [input.id, input.baseItemKey])));
  const deterministicHash = sha256(JSON.stringify({
    sourceRevision: AX1_CRAFTING_SOURCE_REVISION,
    contentVersion: AX1_CRAFTING_CONTENT_VERSION,
    ruleSetVersion: AX1_CRAFTING_RULESET_VERSION,
    recipeId: recipe.id,
    recipeDigest,
    professionId: recipe.professionId,
    professionLevel: values.professionLevel,
    inputBundleDigest,
    inputItemIds: inputs.map(input => input.id),
    outputItemId: recipe.outputItemId,
    outputQuantity: recipe.outputQuantity,
    xpReward: recipe.xpReward,
  }));

  return Object.freeze({
    recipeId: recipe.id,
    recipeDigest,
    professionId: recipe.professionId,
    professionLevel: values.professionLevel,
    inputItemIds: Object.freeze(inputs.map(input => input.id)),
    inputBundleDigest,
    outputItemId: recipe.outputItemId,
    outputQuantity: recipe.outputQuantity,
    xpReward: recipe.xpReward,
    contentVersion: AX1_CRAFTING_CONTENT_VERSION,
    ruleSetVersion: AX1_CRAFTING_RULESET_VERSION,
    sourceRevision: AX1_CRAFTING_SOURCE_REVISION,
    deterministicHash,
  });
}
