export const AX1_CRAFTING_SOURCE_REVISION = "d356881538dae23c3aa97364a5596d48b6ac3079" as const;
export const AX1_CRAFTING_CONTENT_VERSION = "ax1-crafting-catalog-v1" as const;

export type Ax1CraftingProfessionId =
  | "carpenter"
  | "blacksmith"
  | "alchemist"
  | "tailor"
  | "leatherworker";

export type Ax1CraftingRarity = "common" | "uncommon" | "rare";

export interface Ax1CraftingIngredient {
  readonly itemId: string;
  readonly name: string;
  readonly icon: string;
  readonly quantity: number;
}

export interface Ax1CraftingRecipe {
  readonly id: string;
  readonly name: string;
  readonly germanName: string;
  readonly professionId: Ax1CraftingProfessionId;
  readonly requiredLevel: number;
  readonly xpReward: number;
  readonly craftTimeSeconds: number;
  readonly outputItemId: string;
  readonly outputQuantity: number;
  readonly category: string;
  readonly icon: string;
  readonly rarity: Ax1CraftingRarity;
  readonly description: string;
  readonly ingredients: readonly Ax1CraftingIngredient[];
}

export interface Ax1CraftingProfessionDefinition {
  readonly id: Ax1CraftingProfessionId;
  readonly germanName: string;
  readonly icon: string;
}

export const AX1_CRAFTING_PROFESSIONS: readonly Ax1CraftingProfessionDefinition[] = Object.freeze([
  Object.freeze({ id: "carpenter", germanName: "Tischler", icon: "🪚" }),
  Object.freeze({ id: "blacksmith", germanName: "Schmied", icon: "⚒️" }),
  Object.freeze({ id: "alchemist", germanName: "Alchemist", icon: "🧪" }),
  Object.freeze({ id: "tailor", germanName: "Schneider", icon: "🧵" }),
  Object.freeze({ id: "leatherworker", germanName: "Ledermeister", icon: "🥋" }),
]);

function ingredient(itemId: string, name: string, icon: string, quantity: number): Ax1CraftingIngredient {
  return Object.freeze({ itemId, name, icon, quantity });
}

function recipe(value: Ax1CraftingRecipe): Ax1CraftingRecipe {
  return Object.freeze({ ...value, ingredients: Object.freeze([...value.ingredients]) });
}

/**
 * Canonical static crafting content restored from AX1 source revision
 * d356881538dae23c3aa97364a5596d48b6ac3079.
 *
 * This file intentionally contains presentation/content facts only. It does not
 * roll rewards, read wall-clock time, mutate inventory or decide gameplay state.
 */
export const AX1_CRAFTING_RECIPES: readonly Ax1CraftingRecipe[] = Object.freeze([
  recipe({
    id: "recipe_carpenter_holzkiste",
    name: "Reinforced Storage Crate",
    germanName: "Holzkiste",
    professionId: "carpenter",
    requiredLevel: 1,
    xpReward: 35,
    craftTimeSeconds: 2,
    outputItemId: "item_carpenter_holzkiste",
    outputQuantity: 1,
    category: "Möbel & Lager",
    icon: "📦",
    rarity: "common",
    description: "Eine geräumige Holzkiste mit Eisenbeschlägen zur sicheren Aufbewahrung von Gütern.",
    ingredients: [
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 4),
      ingredient("mat_ore_copper", "Kupfererz-Brocken", "🪨", 1),
    ],
  }),
  recipe({
    id: "recipe_carpenter_haustuer",
    name: "Carved Manor Entrance Door",
    germanName: "Haustür",
    professionId: "carpenter",
    requiredLevel: 3,
    xpReward: 65,
    craftTimeSeconds: 3,
    outputItemId: "item_carpenter_haustuer",
    outputQuantity: 1,
    category: "Bauten & Portale",
    icon: "🚪",
    rarity: "uncommon",
    description: "Eine massive, handgeschnitzte Haustür aus Eichenbalken mit bronzenem Riegelwerk.",
    ingredients: [
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 6),
      ingredient("mat_ore_copper", "Kupfererz-Brocken", "🪨", 2),
    ],
  }),
  recipe({
    id: "recipe_carpenter_werkbank",
    name: "Carpenter Master Workbench",
    germanName: "Schreiner Werkbank",
    professionId: "carpenter",
    requiredLevel: 5,
    xpReward: 110,
    craftTimeSeconds: 4,
    outputItemId: "item_carpenter_werkbank",
    outputQuantity: 1,
    category: "Werkzeug & Handwerk",
    icon: "🪑",
    rarity: "rare",
    description: "Eine schwere Schreiner-Werkbank mit Spannzwingen, Hobeln und Messwerkzeugen.",
    ingredients: [
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 8),
      ingredient("mat_ore_copper", "Kupfererz-Brocken", "🪨", 4),
      ingredient("mat_leather_raw", "Gegerbtes Rohleder", "🥋", 2),
    ],
  }),
  recipe({
    id: "recipe_carpenter_holzhacke",
    name: "Sturdy Wooden Hoe",
    germanName: "Holzhacke",
    professionId: "carpenter",
    requiredLevel: 2,
    xpReward: 45,
    craftTimeSeconds: 2,
    outputItemId: "item_carpenter_holzhacke",
    outputQuantity: 1,
    category: "Werkzeuge",
    icon: "⛏️",
    rarity: "common",
    description: "Eine bewährte Holzhacke zur Auflockerung harter Schollen und Rodung von Gestrüpp.",
    ingredients: [
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 3),
      ingredient("mat_leather_raw", "Gegerbtes Rohleder", "🥋", 1),
    ],
  }),
  recipe({
    id: "recipe_carpenter_eichenschild",
    name: "Reinforced Oak Round Shield",
    germanName: "Eichen-Rundschild",
    professionId: "carpenter",
    requiredLevel: 4,
    xpReward: 75,
    craftTimeSeconds: 3,
    outputItemId: "item_carpenter_eichenschild",
    outputQuantity: 1,
    category: "Rüstung & Schilde",
    icon: "🛡️",
    rarity: "uncommon",
    description: "Gekrümmter Schild aus harter Mooreiche mit Lederbezug und Bronzebuckel.",
    ingredients: [
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 5),
      ingredient("mat_leather_raw", "Gegerbtes Rohleder", "🥋", 2),
    ],
  }),
  recipe({
    id: "recipe_blacksmith_bronzeschwert",
    name: "Forged Bronze Blade",
    germanName: "Bronzeschwert",
    professionId: "blacksmith",
    requiredLevel: 1,
    xpReward: 40,
    craftTimeSeconds: 2.5,
    outputItemId: "item_smith_bronzeschwert",
    outputQuantity: 1,
    category: "Waffen",
    icon: "⚔️",
    rarity: "common",
    description: "Ein sauber gehärtetes Bronzeschwert mit geschliffener Schneide.",
    ingredients: [
      ingredient("mat_ore_copper", "Kupfererz-Brocken", "🪨", 4),
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 1),
    ],
  }),
  recipe({
    id: "recipe_blacksmith_plattenharnisch",
    name: "Iron Guard Cuirass",
    germanName: "Eisen-Plattenharnisch",
    professionId: "blacksmith",
    requiredLevel: 4,
    xpReward: 90,
    craftTimeSeconds: 4,
    outputItemId: "item_smith_plattenharnisch",
    outputQuantity: 1,
    category: "Rüstung",
    icon: "🛡️",
    rarity: "rare",
    description: "Schwere geschmiedete Brustplatte mit Wappenprägung und Schulterflanschen.",
    ingredients: [
      ingredient("mat_ore_copper", "Kupfererz-Brocken", "🪨", 8),
      ingredient("mat_leather_raw", "Gegerbtes Rohleder", "🥋", 3),
    ],
  }),
  recipe({
    id: "recipe_alchemist_heiltrank",
    name: "Greater Healing Draught",
    germanName: "Starker Heiltrank",
    professionId: "alchemist",
    requiredLevel: 1,
    xpReward: 30,
    craftTimeSeconds: 1.5,
    outputItemId: "item_alch_heiltrank",
    outputQuantity: 2,
    category: "Tränke & Elixiere",
    icon: "🧪",
    rarity: "common",
    description: "Rot leuchtende Mixtur aus Sonnenwurz und klarem Quellwasser.",
    ingredients: [
      ingredient("mat_herb_sunroot", "Sonnenwurz-Blüte", "🌿", 2),
      ingredient("mat_wheat_amber", "Ätherweizen-Bündel", "🌾", 1),
    ],
  }),
  recipe({
    id: "recipe_alchemist_aetherelixier",
    name: "Aetherial Mana Elixir",
    germanName: "Aether-Manatrank",
    professionId: "alchemist",
    requiredLevel: 2,
    xpReward: 50,
    craftTimeSeconds: 2,
    outputItemId: "item_alch_aetherelixier",
    outputQuantity: 2,
    category: "Tränke & Elixiere",
    icon: "💧",
    rarity: "uncommon",
    description: "Blau phosphoreszierende Essenz zur Wiederherstellung von Mana und Dampfenergie.",
    ingredients: [
      ingredient("mat_herb_sunroot", "Sonnenwurz-Blüte", "🌿", 2),
      ingredient("mat_dust_aether", "Leuchtender Ätherstaub", "✨", 1),
    ],
  }),
  recipe({
    id: "recipe_tailor_novizenrobe",
    name: "Silken Acolyte Robe",
    germanName: "Seiden-Novizenrobe",
    professionId: "tailor",
    requiredLevel: 2,
    xpReward: 55,
    craftTimeSeconds: 3,
    outputItemId: "item_tailor_novizenrobe",
    outputQuantity: 1,
    category: "Stoffrüstung",
    icon: "👘",
    rarity: "uncommon",
    description: "Aus Flachsfasern und Seide gewirkte Robe mit gestickten Schutzkreisen.",
    ingredients: [
      ingredient("mat_wheat_amber", "Ätherweizen-Bündel", "🌾", 4),
      ingredient("mat_dust_aether", "Leuchtender Ätherstaub", "✨", 1),
    ],
  }),
  recipe({
    id: "recipe_leather_stiefel",
    name: "Stalker Leather Boots",
    germanName: "Robuste Jägerstiefel",
    professionId: "leatherworker",
    requiredLevel: 2,
    xpReward: 50,
    craftTimeSeconds: 2.5,
    outputItemId: "item_leather_stiefel",
    outputQuantity: 1,
    category: "Lederrüstung",
    icon: "🥾",
    rarity: "uncommon",
    description: "Leise, wasserdichte Pirschstiefel mit doppelter Ledersohle.",
    ingredients: [
      ingredient("mat_leather_raw", "Gegerbtes Rohleder", "🥋", 4),
      ingredient("mat_wood_oak", "Eichenholz-Scheit", "🪵", 1),
    ],
  }),
]);

const RECIPE_BY_ID = new Map(AX1_CRAFTING_RECIPES.map(value => [value.id, value] as const));

export function getAx1CraftingRecipe(recipeId: string): Ax1CraftingRecipe | undefined {
  return RECIPE_BY_ID.get(recipeId);
}

export function listAx1CraftingRecipes(professionId?: Ax1CraftingProfessionId): readonly Ax1CraftingRecipe[] {
  return professionId
    ? Object.freeze(AX1_CRAFTING_RECIPES.filter(value => value.professionId === professionId))
    : AX1_CRAFTING_RECIPES;
}
