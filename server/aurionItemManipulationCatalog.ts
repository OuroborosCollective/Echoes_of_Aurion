import { aurionLootCatalogV2 } from "./aurionLootCatalog";
import { aurionItemOperations, type ItemManipulationRecipe } from "./aurionItemManipulationProtocol";

export const AURION_MANIPULATION_CONTENT_VERSION = "aurion-crafting-content.v2";
// The basic hand-tool workbench is an Aurion profile capability at level 1.
// Clients cannot supply a station, recipe, tool stats, skill multiplier or affix pool.
export const aurionItemManipulationRecipes: readonly ItemManipulationRecipe[] = Object.freeze(aurionItemOperations.map(operation => Object.freeze<ItemManipulationRecipe>({
  id: `aurion-${operation}-v2`, version: AURION_MANIPULATION_CONTENT_VERSION, operation,
  outputItemDefinitionId: operation === "craft" ? "weapon-blade-v2" : operation === "shaping" ? "weapon-spear-v2" : undefined,
  allowedCategories: operation === "craft" || operation === "shaping" ? ["weapon" as const] : ["weapon" as const, "armor" as const, "accessory" as const, "focus" as const, "relic" as const],
  allowedAffixIds: aurionLootCatalogV2.affixes.map(affix => affix.id).sort(), maxAffixSlots: 5,
  requiredCapability: "personal-workbench", maxItemLevelExact: "100",
  materialRequirements: operation === "salvage" ? {} : { [operation === "socket" || operation === "shaping" ? "component-shaping-echo-clay-v2" : "component-craft-star-iron-v2"]: operation === "craft" ? 2 : 1 },
  salvageYield: operation === "salvage" ? { "component-craft-star-iron-v2": 1 } : {},
})));
export function getAurionItemManipulationRecipe(id: string): ItemManipulationRecipe {
  const recipe = aurionItemManipulationRecipes.find(recipe => recipe.id === id);
  if (!recipe) throw new Error("AURION_ITEM_RECIPE_NOT_FOUND");
  return recipe;
}
