import type { EncounterKey, QuestKey } from "./gameplayProtocol";
import { decideNpcGoal, resolveNpcNeeds, resolvePolityState, resolveWorldReaction, type NpcNeedKey, type PolityState, type WorldReaction, type WorldSignal } from "./wasdAurionProtocol";
import { resolveCaravanMissions, resolveGuild, resolveGuildTerritoryEffect, resolveMarketPrices, resolveSettlement } from "./wasdAurionCivilizationProtocol";
import { resolveCombatStrike, resolveExpeditionLayout, resolveMonsterSpawn, resolveSpellCast } from "./wasdAurionExpeditionProtocol";

export type OpenWorldZoneKey = "observatory_threshold" | "windhollow" | "emberfall" | "cinder_vault";
export type OpenWorldCommand = "move" | "attack" | "interact" | "return_to_tower";
export type PointOfInterestKind = "portal" | "npc" | "encounter" | "landmark";
export type TerrainSurfaceKey = "grass" | "flower_meadow" | "earth" | "farmland" | "garden_parcels" | "starpath" | "starpath_crossing";
export type TerrainTile = { x: number; z: number; surface: TerrainSurfaceKey };
export type WorldPropKind = "flower_shrub" | "starpath_marker" | "garden_border";
export type OpenWorldTerrainSnapshot = {
  chunkSizeMeters: 32;
  tileSizeMeters: 4;
  columns: 8;
  rows: 8;
  atlas: { sizePixels: 1024; cellsPerAxis: 4; cellPixels: 256; surfaces: readonly TerrainSurfaceKey[] };
  roads: { tileCount: 14; fieldTileTarget: 20; gardenTileTarget: 5 };
  tiles: readonly TerrainTile[];
};

export type OpenWorldProfile = {
  level: number;
  completed: readonly QuestKey[];
  activeQuest: QuestKey | null;
  canEnterDungeon: boolean;
};

export type OpenWorldSnapshot = {
  revision: 1;
  zoneId: OpenWorldZoneKey;
  zoneTier: 0 | 1 | 2 | 3;
  displayName: string;
  entryNarrative: string;
  encounter: { activeCount: number; budget: number; maximumVisible: number };
  primaryEncounter: null | { id: string; label: string; encounterKey: EncounterKey; narrative: string };
  pointsOfInterest: readonly { id: string; kind: PointOfInterestKind; state: "locked" | "available" | "completed"; label: string }[];
  npcs: readonly { id: "lyra" | "orun"; displayName: string; role: string; memory: { local: readonly string[]; social: readonly string[]; quest: readonly string[] }; autonomy: { needs: Readonly<Record<NpcNeedKey, number>>; goal: string; decisionHash: string; dialectId: string; comprehensionThreshold: number } }[];
  terrain: OpenWorldTerrainSnapshot;
  props: readonly { kind: WorldPropKind; tileX: number; tileZ: number; rotationY: number; scale: number }[];
  world: { worldSeed: "echoes-of-aurion-v1"; resolutionIndex: number; reaction: WorldReaction };
  polity: PolityState;
  civilization: {
    settlement: ReturnType<typeof resolveSettlement>;
    market: readonly ReturnType<typeof resolveMarketPrices>[number][];
    caravanMissions: readonly ReturnType<typeof resolveCaravanMissions>[number][];
    guild: ReturnType<typeof resolveGuild>;
    territoryEffect: ReturnType<typeof resolveGuildTerritoryEffect>;
  };
  expedition: {
    layout: ReturnType<typeof resolveExpeditionLayout>;
    leadMonster: ReturnType<typeof resolveMonsterSpawn>;
    openingStrike: ReturnType<typeof resolveCombatStrike>;
    spellPreview: ReturnType<typeof resolveSpellCast>;
  };
  allowedCommands: readonly OpenWorldCommand[];
};

export function encounterBudget(level: number, zoneTier: number): number {
  return Math.min(24, Math.max(6, 6 + Math.floor(Math.max(1, level) / 4) + 2 * Math.max(0, zoneTier)));
}

export function maximumVisibleEnemies(level: number): number {
  return Math.min(18, 10 + 2 * Math.floor(Math.max(1, level) / 10));
}

const terrainAtlasSurfaces = ["grass", "flower_meadow", "earth", "farmland", "garden_parcels", "starpath", "starpath_crossing"] as const;
const starpathRoads = new Set(["3:0", "3:1", "3:2", "3:3", "3:4", "3:5", "3:6", "0:4", "1:4", "2:4", "4:4", "5:4", "6:4", "7:4"]);
const fieldTiles = new Set(["0:0", "1:0", "0:1", "1:1", "0:2", "5:0", "6:0", "7:0", "5:1", "6:1", "7:1", "5:2", "6:2", "7:2", "0:5", "1:5", "0:6", "1:6", "0:7", "1:7"]);
const gardenTiles = new Set(["5:5", "6:5", "7:5", "6:6", "7:6"]);

function terrainBaseFor(zoneId: OpenWorldZoneKey): TerrainSurfaceKey {
  if (zoneId === "windhollow") return "flower_meadow";
  if (zoneId === "emberfall" || zoneId === "cinder_vault") return "earth";
  return "grass";
}

export function buildOpenWorldTerrain(zoneId: OpenWorldZoneKey): OpenWorldTerrainSnapshot {
  const base = terrainBaseFor(zoneId);
  const tiles: TerrainTile[] = [];
  for (let z = 0; z < 8; z += 1) {
    for (let x = 0; x < 8; x += 1) {
      const key = `${x}:${z}`;
      let surface: TerrainSurfaceKey = base;
      if (key === "3:4") surface = "starpath_crossing";
      else if (starpathRoads.has(key)) surface = "starpath";
      else if (zoneId === "emberfall" && gardenTiles.has(key)) surface = "garden_parcels";
      else if (fieldTiles.has(key)) surface = zoneId === "emberfall" ? "farmland" : zoneId === "cinder_vault" ? "earth" : base;
      tiles.push({ x, z, surface });
    }
  }
  return {
    chunkSizeMeters: 32,
    tileSizeMeters: 4,
    columns: 8,
    rows: 8,
    atlas: { sizePixels: 1024, cellsPerAxis: 4, cellPixels: 256, surfaces: terrainAtlasSurfaces },
    roads: { tileCount: 14, fieldTileTarget: 20, gardenTileTarget: 5 },
    tiles,
  };
}

function propsForZone(zoneId: OpenWorldZoneKey): OpenWorldSnapshot["props"] {
  if (zoneId === "windhollow") return [
    { kind: "starpath_marker", tileX: 3, tileZ: 4, rotationY: 0, scale: 1 },
    { kind: "flower_shrub", tileX: 1, tileZ: 6, rotationY: 0.4, scale: 0.85 },
    { kind: "flower_shrub", tileX: 6, tileZ: 2, rotationY: -0.6, scale: 0.72 },
  ];
  if (zoneId === "emberfall") return [
    { kind: "starpath_marker", tileX: 3, tileZ: 4, rotationY: 0, scale: 1 },
    { kind: "garden_border", tileX: 1, tileZ: 1, rotationY: 0, scale: 0.85 },
    { kind: "garden_border", tileX: 5, tileZ: 6, rotationY: Math.PI / 2, scale: 0.78 },
  ];
  return [{ kind: "starpath_marker", tileX: 3, tileZ: 4, rotationY: 0, scale: 1 }];
}

export function zoneForOpenWorldProgress(input: OpenWorldProfile): OpenWorldZoneKey {
  if (input.canEnterDungeon) return "cinder_vault";
  if (input.completed.includes("archive_of_echoes")) return "emberfall";
  if (input.completed.includes("astral_call")) return "windhollow";
  return "observatory_threshold";
}

function npcAutonomy(input: { npcId: "lyra" | "orun"; reaction: WorldReaction; resolutionIndex: number; dialectId: string; baseNeeds: Readonly<Record<NpcNeedKey, number>> }) {
  const needs = resolveNpcNeeds({
    current: input.baseNeeds,
    events: (Object.entries(input.reaction.npcNeedDeltas) as [NpcNeedKey, number][]).map(([need, delta]) => ({ id: `world:${input.reaction.id}:${input.npcId}:${need}`, need, delta, sourceReceiptId: input.reaction.id, resolutionIndex: input.resolutionIndex })),
  });
  const decision = decideNpcGoal({ npcId: input.npcId, needs, observationIds: input.reaction.signalIds, resolutionIndex: input.resolutionIndex });
  return { needs, goal: decision.goal, decisionHash: decision.decisionHash, dialectId: input.dialectId, comprehensionThreshold: 0.6 };
}

function npcReadModels(input: OpenWorldProfile, reaction: WorldReaction) {
  const hasAstralCall = input.completed.includes("astral_call");
  const hasArchive = input.completed.includes("archive_of_echoes");
  const active = input.activeQuest;
  const resolutionIndex = reaction.resolutionIndex;
  return [
    {
      id: "lyra" as const,
      displayName: "Lyra von der Sternwarte",
      role: "Grenzbotin und Hüterin der Rückkehrsteine",
      memory: {
        local: hasAstralCall ? ["Du hast den Asterion-Sentinel gebrochen und den ersten Pfad geöffnet."] : ["Der Turm erkennt deine Resonanz, doch der äußere Pfad ist noch unruhig."],
        social: hasArchive ? ["Die Archivwächter sprechen wieder von einem sicheren Übergang durch den Windhain."] : ["Windhollow meldet unstete Wisps nahe der ersten Brücke."],
        quest: active === "ember_key" ? ["Das Solarium wartet auf deine letzte Stabilisierung."] : ["Kein weiterer Auftrag von Lyra ist zurzeit aktiv."],
      },
      autonomy: npcAutonomy({ npcId: "lyra", reaction, resolutionIndex, dialectId: "observatory", baseNeeds: { safety: 0.78, resources: 0.52, belonging: 0.62, status: 0.58, wealth: 0.4, power: 0.35 } }),
    },
    {
      id: "orun" as const,
      displayName: "Orun, Archivhüter",
      role: "Kartograph der versunkenen Pfade",
      memory: {
        local: hasArchive ? ["Du hast die Echo-Tafel entschlüsselt; ihre Koordinaten führen Richtung Emberfall."] : ["Die Archive antworten erst, wenn du den Ruf der Sternwarte vollendet hast."],
        social: hasAstralCall ? ["Die Windhollow-Karten zeigen eine neue Resonanzlinie am Rand des Sonnenfalls."] : ["Keine bestätigte Außenroute wurde an das Archiv gemeldet."],
        quest: active === "archive_of_echoes" ? ["Die versunkene Halle ist dein nächster klarer Auftrag."] : ["Orun bewahrt die Karte, bis der Questpfad es zulässt."],
      },
      autonomy: npcAutonomy({ npcId: "orun", reaction, resolutionIndex, dialectId: "archive", baseNeeds: { safety: 0.7, resources: 0.5, belonging: 0.46, status: 0.64, wealth: 0.38, power: 0.28 } }),
    },
  ] as const;
}

function worldSignalsFor(input: OpenWorldProfile, zoneId: OpenWorldZoneKey, resolutionIndex: number): WorldSignal[] {
  const signals: WorldSignal[] = [];
  if (input.activeQuest) signals.push({ id: `quest:${input.activeQuest}`, kind: "resonance", regionId: zoneId, magnitude: 0.3, sourceReceiptId: `quest-state:${input.activeQuest}`, resolutionIndex });
  if (input.completed.length > 0) signals.push({ id: `progress:${input.completed.length}`, kind: "player_event", regionId: zoneId, magnitude: Math.min(1, input.completed.length * 0.2), sourceReceiptId: `quest-completed:${input.completed.slice().sort().join(",")}`, resolutionIndex });
  if (zoneId === "emberfall" || zoneId === "cinder_vault") signals.push({ id: `hazard:${zoneId}`, kind: "hazard", regionId: zoneId, magnitude: zoneId === "cinder_vault" ? 0.7 : 0.35, sourceReceiptId: `zone:${zoneId}`, resolutionIndex });
  return signals;
}

function primaryEncounterFor(input: OpenWorldProfile): OpenWorldSnapshot["primaryEncounter"] {
  if (input.activeQuest === "astral_call") return { id: "asterion-sentinel", label: "Asterion-Sentinel", encounterKey: "asterion", narrative: "Ein Resonanzanker antwortet auf deine Waffen- und Echo-Signale." };
  if (input.activeQuest === "archive_of_echoes") return { id: "archive-warden", label: "Archivwächter", encounterKey: "archive", narrative: "Der versunkene Hüter blockiert den Zugang zur Echo-Tafel." };
  if (input.activeQuest === "ember_key") return { id: "solarium-echo", label: "Solarium-Echo", encounterKey: "solarium", narrative: "Die letzte Flamme lässt nur eine serverbestätigte Stabilisierung zu." };
  if (input.canEnterDungeon) return { id: "cinder-guardian", label: "Glutwächter", encounterKey: "cinder_vault", narrative: "Der geborgene Schlüssel erlaubt den Eintritt ins Aschengewölbe." };
  return null;
}

export function buildOpenWorldSnapshot(input: OpenWorldProfile): OpenWorldSnapshot {
  const zoneId = zoneForOpenWorldProgress(input);
  const zone = {
    observatory_threshold: { tier: 0 as const, displayName: "Schwelle der Sternwarte", narrative: "Vor dem Turm öffnen sich bronzene Sternenpfade; ein Rückkehrstein bindet deine erste Außenroute.", pois: [
      { id: "return-stone", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein der Sternwarte" },
      { id: "lyra-threshold", kind: "npc" as const, state: "available" as const, label: "Lyra, Grenzbotin" },
      { id: "windhollow-gate", kind: "portal" as const, state: input.completed.includes("astral_call") ? "available" as const : "locked" as const, label: "Pfad nach Windhollow" },
    ] },
    windhollow: { tier: 1 as const, displayName: "Windhollow", narrative: "Zwischen schwebenden Basaltwurzeln flackern astrale Wisps über einem verlassenen Wegnetz.", pois: [
      { id: "windhollow-return", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein Windhollow" },
      { id: "lyra-windhollow", kind: "npc" as const, state: "available" as const, label: "Lyra am Sternenpfad" },
      { id: "wisp-grove", kind: "encounter" as const, state: "available" as const, label: "Hain der Astralwisps" },
      { id: "archive-route", kind: "landmark" as const, state: "available" as const, label: "Versunkener Archivpfad" },
    ] },
    emberfall: { tier: 2 as const, displayName: "Emberfall", narrative: "Warme Glutadern durchziehen zerbrochene Observatorien; das Solarium zeichnet sich am Horizont ab.", pois: [
      { id: "emberfall-return", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein Emberfall" },
      { id: "orun-emberfall", kind: "npc" as const, state: "available" as const, label: "Orun, Archivhüter" },
      { id: "solarium-route", kind: "encounter" as const, state: "available" as const, label: "Solarium der letzten Flamme" },
      { id: "cinder-vault-gate", kind: "portal" as const, state: "locked" as const, label: "Tor zum Aschengewölbe" },
    ] },
    cinder_vault: { tier: 3 as const, displayName: "Aschengewölbe", narrative: "Der Glutschlüssel entzündet uralte Runen; hinter dem Tor wartet der Glutwächter auf den ersten Setfund.", pois: [
      { id: "vault-return", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein des Gewölbes" },
      { id: "cinder-guardian", kind: "encounter" as const, state: "available" as const, label: "Glutwächter" },
      { id: "first-relic", kind: "landmark" as const, state: "available" as const, label: "Reliktkammer" },
    ] },
  }[zoneId];
  const maximumVisible = maximumVisibleEnemies(input.level);
  const resolutionIndex = input.level * 1_000 + input.completed.length * 10 + (input.activeQuest ? 1 : 0);
  const signals = worldSignalsFor(input, zoneId, resolutionIndex);
  const world = {
    worldSeed: "echoes-of-aurion-v1" as const,
    resolutionIndex,
    reaction: resolveWorldReaction({ worldSeed: "echoes-of-aurion-v1", regionId: zoneId, resolutionIndex, signals }),
  };
  const polity = resolvePolityState({
    polityId: "asterion_compact",
    governmentType: "council",
    territoryIds: ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"],
    stability: 0.74,
    activeDiplomacy: ["alliance", "trade"],
    warSignals: signals,
  });
  const scarcity = [{
    regionId: zoneId,
    itemId: "resonance_tonic",
    shiftPercentage: -world.reaction.resourceDelta * 0.25 + world.reaction.threatDelta * 0.12,
    x: zone.tier * 16,
    y: 0,
    z: 24,
    resolutionIndex,
    sourceReceiptId: world.reaction.id,
  }];
  const market = resolveMarketPrices({
    regionId: zoneId,
    weatherTone: world.reaction.weatherTone,
    resolutionIndex,
    scarcity,
    listings: [
      { itemId: "resonance_tonic", basePrice: 50, category: "provisions" },
      { itemId: "asterion_iron", basePrice: 140, category: "material" },
    ],
  });
  const civilization = {
    settlement: resolveSettlement({ id: `${zoneId}_settlement`, kind: zone.tier >= 2 ? "city" : "village", ownerId: "asterion_compact", regionId: zoneId, foundedResolutionIndex: 0, prosperity: 0.55 + world.reaction.resourceDelta * 0.15, stability: polity.stability }),
    market,
    caravanMissions: resolveCaravanMissions({ traders: [{ npcId: "asterion_caravan" }], signals: scarcity }),
    guild: resolveGuild({ id: "starwardens", name: "Sternenwächter", founderId: "lyra", members: ["orun"], treasury: 120 }),
    territoryEffect: resolveGuildTerritoryEffect({ npcGuildId: "starwardens", x: zone.tier * 16, y: 24, territoryOwners: { [`${Math.floor((zone.tier * 16) / 64)}:0`]: "starwardens" } }),
  };
  const layout = resolveExpeditionLayout({ expeditionId: `${zoneId}_expedition`, seed: `echoes-of-aurion-v1:${zoneId}`, tier: zone.tier + 1, resolutionIndex });
  const leadMonster = resolveMonsterSpawn({ spawnerId: `${zoneId}_spawner`, biome: zoneId === "emberfall" || zoneId === "cinder_vault" ? "desert" : zoneId === "windhollow" ? "mountain" : "forest", packIndex: 0, resolutionIndex });
  const openingStrike = resolveCombatStrike({ action: "melee", attacker: { id: "aurion_player", combatLevel: input.level, stamina: 100, health: 100 }, defender: { id: leadMonster.id, combatLevel: Math.max(1, leadMonster.strength), stamina: 100, health: 40 + leadMonster.resilience * 4 }, weaponBonus: Math.floor(input.level / 3), receiptId: `preview:${layout.receiptHash}`, resolutionIndex });
  const spellPreview = resolveSpellCast({ caster: { id: "aurion_player", combatLevel: input.level, stamina: 100, health: 100, mana: 30 }, spell: { id: "starfall_spark", kind: "lightning", cost: 8, potency: 14, effect: "resonance_burst" }, weatherTone: world.reaction.weatherTone, receiptId: `preview:spell:${layout.receiptHash}`, resolutionIndex });
  const expedition = { layout, leadMonster, openingStrike, spellPreview };
  return {
    revision: 1,
    zoneId,
    zoneTier: zone.tier,
    displayName: zone.displayName,
    entryNarrative: zone.narrative,
    encounter: { activeCount: Math.min(maximumVisible, Math.max(2, zone.tier + Math.floor(Math.max(1, input.level) / 12) + 1)), budget: encounterBudget(input.level, zone.tier), maximumVisible },
    primaryEncounter: primaryEncounterFor(input),
    pointsOfInterest: zone.pois,
    npcs: npcReadModels(input, world.reaction),
    terrain: buildOpenWorldTerrain(zoneId),
    props: propsForZone(zoneId),
    world,
    polity,
    civilization,
    expedition,
    allowedCommands: ["move", "attack", "interact", "return_to_tower"],
  };
}
