import type { AurionAffixSlot, AurionItemCategory, LootAffixDefinition, LootBaseDefinition, LootSetDefinition } from "./aurionLootProtocol";

export const AURION_LOOT_CONTENT_VERSION = "aurion-loot-content.v2" as const;
const allCategories: readonly AurionItemCategory[] = ["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"];
const fullAffixSlots: readonly AurionAffixSlot[] = ["prefix", "suffix", "implicit", "corruption", "craft"];

const weaponFamilies = ["blade", "axe", "mace", "spear", "dagger", "bow", "staff", "wand", "hammer", "scythe", "shield", "focus"] as const;
const armorFamilies = ["light", "medium", "heavy"] as const;
const armorParts = ["head", "chest", "hands", "legs", "feet", "belt"] as const;
const accessoryFamilies = ["sun", "moon", "river", "gale", "ember", "stone", "echo", "veil"] as const;

const weaponBaseStats: Readonly<Record<(typeof weaponFamilies)[number], Readonly<Record<string, number>>>> = {
  blade: { power: 9 }, axe: { power: 11 }, mace: { power: 10, stagger: 3 }, spear: { power: 8, reach: 4 }, dagger: { power: 7, speed: 5 }, bow: { power: 8, precision: 4 }, staff: { arcana: 8 }, wand: { arcana: 7, speed: 2 }, hammer: { power: 12, guard: 2 }, scythe: { power: 8, harvest: 4 }, shield: { guard: 11 }, focus: { resonance: 9 },
};

export const aurionLootBaseCatalog: readonly LootBaseDefinition[] = Object.freeze([
  ...weaponFamilies.map((familyId, index) => Object.freeze({
    id: `weapon-${familyId}-v2`, category: "weapon" as const, equipmentSlot: familyId === "shield" ? "off_hand" as const : "main_hand" as const,
    familyId, minItemLevelExact: "1", baseStats: weaponBaseStats[familyId], affixSlots: fullAffixSlots, tags: Object.freeze(["weapon", familyId, index % 2 === 0 ? "martial" : "arcane"]),
  })),
  ...armorFamilies.flatMap((familyId, familyIndex) => armorParts.map((part, partIndex) => Object.freeze({
    id: `armor-${familyId}-${part}-v2`, category: "armor" as const, equipmentSlot: part,
    familyId, minItemLevelExact: "1", baseStats: Object.freeze({ guard: 4 + familyIndex * 3 + partIndex, resilience: familyIndex + 1 }), affixSlots: fullAffixSlots, tags: Object.freeze(["armor", familyId, part]),
  }))),
  ...accessoryFamilies.map((familyId, index) => Object.freeze({
    id: `${index % 2 === 0 ? "ring" : "amulet"}-${familyId}-v2`, category: "accessory" as const, equipmentSlot: index % 2 === 0 ? "ring" as const : "amulet" as const,
    familyId, minItemLevelExact: "1", baseStats: Object.freeze({ resonance: 2 + index, fortune: index % 3 + 1 }), affixSlots: fullAffixSlots, tags: Object.freeze(["accessory", familyId]),
  })),
  ...["ember", "tide", "gale", "stone"].map((familyId, index) => Object.freeze({
    id: `focus-${familyId}-v2`, category: "focus" as const, equipmentSlot: "focus" as const,
    familyId, minItemLevelExact: "1", baseStats: Object.freeze({ arcana: 7 + index, resonance: 3 }), affixSlots: fullAffixSlots, tags: Object.freeze(["focus", familyId, "arcane"]),
  })),
  ...["archive", "observatory"].map((familyId, index) => Object.freeze({
    id: `relic-${familyId}-v2`, category: "relic" as const, equipmentSlot: "relic" as const,
    familyId, minItemLevelExact: "1", baseStats: Object.freeze({ lore: 5 + index, resonance: 4 + index }), affixSlots: fullAffixSlots, tags: Object.freeze(["relic", familyId]),
  })),
  ...["star-iron", "verdant-fiber"].map((familyId, index) => Object.freeze({
    id: `component-craft-${familyId}-v2`, category: "crafting_component" as const,
    familyId, minItemLevelExact: "1", baseStats: Object.freeze({ craftValue: 5 + index }), affixSlots: ["craft"] as const, tags: Object.freeze(["crafting", familyId]),
  })),
  ...["echo-clay", "lumen-resin"].map((familyId, index) => Object.freeze({
    id: `component-shaping-${familyId}-v2`, category: "shaping_component" as const,
    familyId, minItemLevelExact: "1", baseStats: Object.freeze({ shapingValue: 5 + index }), affixSlots: ["craft"] as const, tags: Object.freeze(["shaping", familyId]),
  })),
]);

const affixSeeds = [
  ["might", "power"], ["warding", "guard"], ["resonance", "resonance"], ["clarity", "arcana"], ["fortune", "fortune"], ["swiftness", "speed"], ["vigor", "resilience"], ["precision", "precision"], ["reach", "reach"], ["harvest", "harvest"], ["lore", "lore"], ["tempering", "craftPower"], ["formation", "shapingPower"], ["ember", "emberPower"], ["tide", "tidePower"], ["gale", "galePower"], ["stone", "stonePower"], ["restoration", "restorationPower"],
] as const;
const affixTiers = ["common", "refined", "exalted", "sovereign"] as const;

export const aurionLootAffixCatalog: readonly LootAffixDefinition[] = Object.freeze(affixTiers.flatMap((tier, tierIndex) => affixSeeds.map(([name, stat], index) => {
  const slot = fullAffixSlots[(index + tierIndex) % fullAffixSlots.length]!;
  const minimum = 1 + tierIndex * 25;
  return Object.freeze({
    id: `affix-${tier}-${name}-v2`, slot, groupId: `${tier}-${name}`, minItemLevelExact: String(minimum),
    allowedCategories: allCategories, statRanges: Object.freeze({ [stat]: Object.freeze({ min: 1 + tierIndex + (index % 3), max: 5 + tierIndex * 3 + (index % 5) }) }),
  });
})));

export const aurionLootSetCatalog: readonly LootSetDefinition[] = Object.freeze([
  Object.freeze({ id: "set-astral-regalia-v2", pieceBaseItemIds: ["weapon-blade-v2", "armor-heavy-chest-v2", "ring-sun-v2"], bonusesByPieces: Object.freeze({ "2": Object.freeze({ guard: 8, resonance: 5 }), "3": Object.freeze({ power: 12, arcana: 12 }) }) }),
  Object.freeze({ id: "set-verdant-concord-v2", pieceBaseItemIds: ["weapon-bow-v2", "armor-light-hands-v2", "amulet-moon-v2"], bonusesByPieces: Object.freeze({ "2": Object.freeze({ precision: 7, speed: 4 }), "3": Object.freeze({ restorationPower: 10, stewardship: 6 }) }) }),
  Object.freeze({ id: "set-archive-vigil-v2", pieceBaseItemIds: ["focus-ember-v2", "armor-medium-head-v2", "relic-archive-v2"], bonusesByPieces: Object.freeze({ "2": Object.freeze({ guard: 6, lore: 8 }), "3": Object.freeze({ resonance: 14, arcana: 14 }) }) }),
]);

export const aurionLootCatalogV2 = Object.freeze({
  ruleSetVersion: "aurion-loot.v2",
  contentVersion: AURION_LOOT_CONTENT_VERSION,
  baseItems: aurionLootBaseCatalog,
  affixes: aurionLootAffixCatalog,
  sets: aurionLootSetCatalog,
});
