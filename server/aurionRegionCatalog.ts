export const regionArchetypeKeys = [
  "observatory_threshold",
  "windhollow",
  "emberfall",
  "cinder_vault",
  "clockwork_woods",
  "frostcrown_march",
  "sunwatch_bastion",
  "whispering_frontier",
  "tidescar_coast",
  "starfall_ruins",
] as const;

export type RegionArchetypeKey = (typeof regionArchetypeKeys)[number];

export const regionEventKinds = [
  "caravan_fair",
  "leyline_tempest",
  "succession_crisis",
  "ancestral_migration",
  "masterwork_demand",
  "dungeon_breach",
  "harvest_tide",
  "border_congress",
] as const;

export type RegionEventKind = (typeof regionEventKinds)[number];

export const dungeonAffixKeys = [
  "volatile_leylines",
  "ironbound_host",
  "ancestral_echoes",
  "famine_pressure",
  "caravan_siege",
  "political_unrest",
  "masterwork_cache",
  "shifting_paths",
  "resonant_guardians",
  "scarcity_bloom",
] as const;

export type DungeonAffixKey = (typeof dungeonAffixKeys)[number];

export type ResourceRequirement = Readonly<{
  resourceKey: string;
  masteryScope: string;
  masteryKey: string;
  requiredMasteryLevelExact: string;
  economyRole: string;
}>;

export type RegionArchetype = Readonly<{
  key: RegionArchetypeKey;
  name: string;
  signatureBiome: string;
  faction: string;
  economyRole: string;
  baseDangerBps: number;
  baseRewardBps: number;
  referencePlayerDpsExact: string;
  referencePlayerEffectiveHpExact: string;
  dungeonKey: string;
  resources: readonly ResourceRequirement[];
}>;

export type RegionEventDefinition = Readonly<{
  dangerDeltaBps: number;
  scarcityBonusBps: number;
  rewardBonusBps: number;
  politicsBonusBps: number;
  masteryScopes: readonly string[];
  npcDirective: string;
}>;

export type DungeonAffix = Readonly<{
  key: DungeonAffixKey;
  dangerDeltaBps: number;
  rewardDeltaBps: number;
  economyEffect: string;
  politicsEffect: string;
}>;

const resource = (
  resourceKey: string,
  masteryScope: string,
  masteryKey: string,
  requiredMasteryLevelExact: string,
  economyRole: string,
): ResourceRequirement =>
  Object.freeze({
    resourceKey,
    masteryScope,
    masteryKey,
    requiredMasteryLevelExact,
    economyRole,
  });

const region = (
  key: RegionArchetypeKey,
  name: string,
  signatureBiome: string,
  faction: string,
  economyRole: string,
  baseDangerBps: number,
  baseRewardBps: number,
  referencePlayerDpsExact: string,
  referencePlayerEffectiveHpExact: string,
  dungeonKey: string,
  resources: readonly ResourceRequirement[],
): RegionArchetype =>
  Object.freeze({
    key,
    name,
    signatureBiome,
    faction,
    economyRole,
    baseDangerBps,
    baseRewardBps,
    referencePlayerDpsExact,
    referencePlayerEffectiveHpExact,
    dungeonKey,
    resources: Object.freeze([...resources]),
  });

export const regionArchetypes: readonly RegionArchetype[] = Object.freeze([
  region(
    "observatory_threshold",
    "Schwelle der Sternwarte",
    "highland",
    "Aether Circle",
    "navigation, novice research and observatory diplomacy",
    8000,
    8500,
    "80",
    "6500",
    "asterion_underworks",
    [
      resource("aether_shard", "gathering", "gathering:aether_shard", "1", "staple"),
      resource("star_chart_fragment", "navigation", "navigation:observatory", "25", "strategic"),
    ],
  ),
  region(
    "windhollow",
    "Windhollow",
    "plains",
    "Wayfarer Compact",
    "herbs, wind routes and caravan junctions",
    10000,
    9500,
    "95",
    "7200",
    "windglass_grotto",
    [
      resource("whisper_herb", "gathering", "gathering:herbalism", "10", "craft"),
      resource("gale_silk", "profession", "profession:weaving", "70", "luxury"),
    ],
  ),
  region(
    "emberfall",
    "Emberfall-Marsch",
    "ashland",
    "Ironwardens",
    "ore, smelting, alchemy heat and frontier taxation",
    13000,
    11000,
    "115",
    "8200",
    "ember_smeltery",
    [
      resource("cinder_ore", "gathering", "gathering:mining", "30", "craft"),
      resource("solar_salt", "profession", "profession:alchemy", "120", "strategic"),
    ],
  ),
  region(
    "cinder_vault",
    "Aschengewölbe",
    "ruins",
    "Veiled Covenant",
    "dungeon relics, set materials and political leverage",
    20000,
    13500,
    "140",
    "9500",
    "cinder_vault",
    [
      resource("glutwaechter_relic", "combat_action", "combat_action:boss_salvage", "80", "ritual"),
      resource("covenant_ember", "politics", "politics:covenant", "150", "strategic"),
    ],
  ),
  region(
    "clockwork_woods",
    "Clockwork Woods",
    "forest",
    "Clockwork Artisans",
    "timber, gears, furniture wood and machine-beast salvage",
    11500,
    10000,
    "105",
    "7600",
    "rootgear_foundry",
    [
      resource("resonant_timber", "profession", "profession:carpentry", "1", "craft"),
      resource("ancient_gearwood", "item", "item:ancient_gearwood", "250", "luxury"),
    ],
  ),
  region(
    "frostcrown_march",
    "Frostkronen-Marsch",
    "highland",
    "Frost Crown Wardens",
    "cold metals, defensive caravans and border sovereignty",
    15000,
    11500,
    "125",
    "8800",
    "frostcrown_keep",
    [
      resource("frost_iron", "gathering", "gathering:mining", "100", "strategic"),
      resource("winterheart_resin", "profession", "profession:enchanting", "300", "ritual"),
    ],
  ),
  region(
    "sunwatch_bastion",
    "Sunwatch-Bastion",
    "plains",
    "Sunward Concord",
    "grain, law, military contracts and solar crafting",
    12000,
    10500,
    "110",
    "8100",
    "sunwatch_catacombs",
    [
      resource("sungrain", "gathering", "gathering:farming", "20", "staple"),
      resource("concord_sealwax", "social", "social:diplomacy", "180", "strategic"),
    ],
  ),
  region(
    "whispering_frontier",
    "Flüsternde Grenze",
    "forest",
    "Free Frontier Guilds",
    "rare herbs, exploration maps and shifting guild territory",
    14000,
    11500,
    "120",
    "8400",
    "whisper_maze",
    [
      resource("memory_moss", "gathering", "gathering:herbalism", "160", "ritual"),
      resource("frontier_map_core", "navigation", "navigation:frontier", "400", "strategic"),
    ],
  ),
  region(
    "tidescar_coast",
    "Tidescar-Küste",
    "coast",
    "Tidebound Houses",
    "fishing, ship timber, salt and interregional trade",
    10500,
    10000,
    "100",
    "7400",
    "drowned_observatory",
    [
      resource("aetherfin", "profession", "profession:fishing", "1", "staple"),
      resource("abyssal_pearl", "item", "item:abyssal_pearl", "500", "luxury"),
    ],
  ),
  region(
    "starfall_ruins",
    "Starfall-Ruinen",
    "ruins",
    "Archive Remnants",
    "ancient schematics, enchantment catalysts and history",
    18000,
    12500,
    "135",
    "9200",
    "starfall_archive",
    [
      resource("fallen_star_alloy", "profession", "profession:smithing", "350", "luxury"),
      resource("archive_echo", "social", "social:scholarship", "600", "ritual"),
    ],
  ),
]);

const scopes = (...values: string[]) => Object.freeze(values);

const event = (
  dangerDeltaBps: number,
  scarcityBonusBps: number,
  rewardBonusBps: number,
  politicsBonusBps: number,
  masteryScopes: readonly string[],
  npcDirective: string,
): RegionEventDefinition =>
  Object.freeze({
    dangerDeltaBps,
    scarcityBonusBps,
    rewardBonusBps,
    politicsBonusBps,
    masteryScopes,
    npcDirective,
  });

export const regionEventDefinitions: Readonly<Record<RegionEventKind, RegionEventDefinition>> = Object.freeze({
  caravan_fair: event(
    -500,
    800,
    900,
    400,
    scopes("social", "profession"),
    "route merchants, guards and crafters toward the regional fair",
  ),
  leyline_tempest: event(
    2000,
    1200,
    1500,
    0,
    scopes("weapon", "gathering"),
    "seek shelter, harvest charged nodes and defend leyline anchors",
  ),
  succession_crisis: event(
    2500,
    500,
    1200,
    2000,
    scopes("politics", "social"),
    "negotiate claims, protect councils and reroute contested trade",
  ),
  ancestral_migration: event(
    400,
    900,
    700,
    900,
    scopes("navigation", "social"),
    "escort migrating families and update settlement memory",
  ),
  masterwork_demand: event(
    0,
    1500,
    1600,
    300,
    scopes("profession", "recipe", "item"),
    "commission regional masterworks and consume surplus materials",
  ),
  dungeon_breach: event(
    3500,
    1000,
    2200,
    800,
    scopes("weapon", "combat_action"),
    "evacuate civilians and form dungeon response parties",
  ),
  harvest_tide: event(
    -700,
    500,
    800,
    200,
    scopes("gathering", "profession"),
    "harvest abundant nodes before the regional tide ends",
  ),
  border_congress: event(
    300,
    600,
    900,
    1800,
    scopes("politics", "social", "navigation"),
    "convene factions and negotiate roads, taxes and borders",
  ),
});

const affix = (
  key: DungeonAffixKey,
  dangerDeltaBps: number,
  rewardDeltaBps: number,
  economyEffect: string,
  politicsEffect: string,
): DungeonAffix =>
  Object.freeze({
    key,
    dangerDeltaBps,
    rewardDeltaBps,
    economyEffect,
    politicsEffect,
  });

export const dungeonAffixDefinitions: Readonly<Record<DungeonAffixKey, DungeonAffix>> = Object.freeze({
  volatile_leylines: affix(
    "volatile_leylines",
    1500,
    900,
    "charged reagents enter alchemy markets",
    "leyline control becomes contested",
  ),
  ironbound_host: affix(
    "ironbound_host",
    2000,
    1000,
    "armor salvage supply rises",
    "guard contracts gain influence",
  ),
  ancestral_echoes: affix(
    "ancestral_echoes",
    1200,
    1100,
    "memory relic demand rises",
    "lineage claims gain weight",
  ),
  famine_pressure: affix(
    "famine_pressure",
    900,
    1300,
    "food scarcity and caravan value rise",
    "stewardship decisions become urgent",
  ),
  caravan_siege: affix(
    "caravan_siege",
    1800,
    1400,
    "trade-route rewards and repair sinks rise",
    "border security standings change",
  ),
  political_unrest: affix(
    "political_unrest",
    1300,
    1200,
    "tax and black-market pressure diverge",
    "diplomacy and leadership choices alter stability",
  ),
  masterwork_cache: affix(
    "masterwork_cache",
    500,
    1500,
    "profession materials and item mastery opportunities rise",
    "artisan guild influence rises",
  ),
  shifting_paths: affix(
    "shifting_paths",
    1000,
    900,
    "navigation maps become valuable",
    "road ownership is renegotiated",
  ),
  resonant_guardians: affix(
    "resonant_guardians",
    2200,
    1500,
    "rare set catalysts enter circulation",
    "factions compete for guardian access",
  ),
  scarcity_bloom: affix(
    "scarcity_bloom",
    700,
    1600,
    "one rare resource blooms while substitutes become scarce",
    "harvest rights become strategic",
  ),
});
