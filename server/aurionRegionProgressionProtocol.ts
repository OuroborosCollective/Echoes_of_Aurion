import { createHash } from "node:crypto";
import {
  activityXpAwardExact,
  economyBounds,
  integerSquareRoot,
  regionRewardMultiplierBps,
  resolveEnemyBudget,
  type EnemyBudget,
  type EnemyTier,
} from "./aurionBalancingProtocol";
import {
  regionArchetypes,
  regionEventDefinitions,
  regionEventKinds,
  type RegionArchetype,
  type RegionEventDefinition,
  type RegionEventKind,
  type ResourceRequirement,
} from "./aurionRegionCatalog";
import type { GlobalWorldPlan, GlobalWorldSector } from "./globalWorldProtocol";

export const AURION_REGION_PROGRESSION_VERSION = "aurion-region-progression.v1" as const;

const canonicalExact = /^(0|[1-9][0-9]*)$/;

function positiveExact(value: string, field: string): bigint {
  if (!canonicalExact.test(value)) throw new Error(`${field} must be a canonical non-negative decimal`);
  const parsed = BigInt(value);
  if (parsed < 1n) throw new Error(`${field} must be positive`);
  return parsed;
}

export function hashHex(...parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function hash32(...parts: readonly string[]): number {
  return Number(BigInt(`0x${hashHex(...parts).slice(0, 8)}`));
}

export function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function regionHash(value: unknown): string {
  return hashHex(AURION_REGION_PROGRESSION_VERSION, stableStringify(value));
}

export function regionArchetypeForSector(worldSeed: string, sectorOrdinal: number): RegionArchetype {
  if (!worldSeed.trim()) throw new Error("worldSeed is required");
  if (!Number.isSafeInteger(sectorOrdinal) || sectorOrdinal < 0) throw new Error("sectorOrdinal must be a non-negative safe integer");
  if (sectorOrdinal < 4) return regionArchetypes[sectorOrdinal];
  const generated = regionArchetypes.slice(4);
  return generated[hash32(worldSeed, "region-archetype", String(sectorOrdinal)) % generated.length];
}

export type RegionEventSnapshot = Readonly<{
  id: string;
  kind: RegionEventKind;
  intensityBps: number;
  dangerDeltaBps: number;
  scarcityBonusBps: number;
  rewardBonusBps: number;
  politicsBonusBps: number;
  masteryScopes: readonly string[];
  npcDirective: string;
  deterministicHash: string;
}>;

export function resolveRegionEvent(input: {
  worldSeed: string;
  epoch: number;
  sectorId: string;
  resolutionIndex: number;
}): RegionEventSnapshot {
  if (!input.worldSeed.trim() || !input.sectorId.trim()) throw new Error("region event requires worldSeed and sectorId");
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 0 || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("region event indices must be non-negative safe integers");
  }
  const kind = regionEventKinds[hash32(input.worldSeed, "region-event", String(input.epoch), input.sectorId, String(input.resolutionIndex)) % regionEventKinds.length];
  const definition = regionEventDefinitions[kind];
  const intensityBps = 7500 + (hash32(input.worldSeed, "region-event-intensity", String(input.epoch), input.sectorId) % 5001);
  const scale = (value: number) => Math.trunc((value * intensityBps) / 10000);
  const snapshot = {
    id: `region-event:${input.epoch}:${input.sectorId}:${kind}`,
    kind,
    intensityBps,
    dangerDeltaBps: scale(definition.dangerDeltaBps),
    scarcityBonusBps: scale(definition.scarcityBonusBps),
    rewardBonusBps: scale(definition.rewardBonusBps),
    politicsBonusBps: scale(definition.politicsBonusBps),
    masteryScopes: definition.masteryScopes,
    npcDirective: definition.npcDirective,
  };
  return Object.freeze({ ...snapshot, deterministicHash: regionHash(snapshot) });
}

export type RegionMasteryContext = Readonly<{
  combatLevelExact: string;
  gatheringLevelExact: string;
  professionLevelExact: string;
  socialLevelExact: string;
  politicsLevelExact: string;
  levelsByKey?: Readonly<Record<string, string>>;
}>;

function projectedMasteryBonusBps(mastery: RegionMasteryContext): number {
  const total =
    positiveExact(mastery.combatLevelExact, "combatLevelExact") +
    positiveExact(mastery.gatheringLevelExact, "gatheringLevelExact") +
    positiveExact(mastery.professionLevelExact, "professionLevelExact") +
    positiveExact(mastery.socialLevelExact, "socialLevelExact") +
    positiveExact(mastery.politicsLevelExact, "politicsLevelExact");
  const root = integerSquareRoot(total);
  return Number(root > 250n ? 2500n : root * 10n);
}

function enemyTierForDanger(dangerBps: number): EnemyTier {
  if (dangerBps >= 25000) return "dungeon_boss";
  if (dangerBps >= 18000) return "boss";
  if (dangerBps >= 12000) return "elite";
  return "normal";
}

function masteryLevelForResource(resource: ResourceRequirement, mastery: RegionMasteryContext): string {
  const exactByKey = mastery.levelsByKey?.[resource.masteryKey];
  if (exactByKey !== undefined) return positiveExact(exactByKey, resource.masteryKey).toString(10);
  if (resource.masteryScope === "gathering") return positiveExact(mastery.gatheringLevelExact, "gatheringLevelExact").toString(10);
  if (resource.masteryScope === "profession" || resource.masteryScope === "recipe" || resource.masteryScope === "item") {
    return positiveExact(mastery.professionLevelExact, "professionLevelExact").toString(10);
  }
  if (resource.masteryScope === "social") return positiveExact(mastery.socialLevelExact, "socialLevelExact").toString(10);
  if (resource.masteryScope === "politics") return positiveExact(mastery.politicsLevelExact, "politicsLevelExact").toString(10);
  return positiveExact(mastery.combatLevelExact, "combatLevelExact").toString(10);
}

export type RegionResourceSnapshot = Readonly<
  ResourceRequirement & {
    currentMasteryLevelExact: string;
    unlocked: boolean;
  }
>;

export type RegionProgression = Readonly<{
  regionId: string;
  sectorId: string;
  sectorOrdinal: number;
  archetype: RegionArchetype;
  generatedBiome: string;
  event: RegionEventSnapshot;
  dangerBps: number;
  enemyTier: EnemyTier;
  enemyBudget: EnemyBudget;
  rewardMultiplierBps: number;
  xpBudgets: Readonly<{
    normalMobExact: string;
    eliteMobExact: string;
    worldBossExact: string;
    questExact: string;
    dungeonExact: string;
    gatheringExact: string;
    craftingExact: string;
  }>;
  resources: readonly RegionResourceSnapshot[];
  relevanceReasons: readonly string[];
  deterministicHash: string;
}>;

export function resolveRegionProgression(input: {
  worldSeed: string;
  epoch: number;
  resolutionIndex: number;
  sector: GlobalWorldSector;
  mastery: RegionMasteryContext;
  partySize: number;
  repetitionStreak?: number;
}): RegionProgression {
  if (!input.worldSeed.trim() || input.worldSeed !== input.worldSeed.trim()) {
    throw new Error("worldSeed must be a trimmed non-empty string");
  }
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 0 || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("region indices must be non-negative safe integers");
  }
  if (!Number.isSafeInteger(input.partySize) || input.partySize < 1 || input.partySize > 8) {
    throw new Error("partySize must be from 1 through 8");
  }
  const archetype = regionArchetypeForSector(input.worldSeed, input.sector.ordinal);
  const event = resolveRegionEvent({
    worldSeed: input.worldSeed,
    epoch: input.epoch,
    sectorId: input.sector.id,
    resolutionIndex: input.resolutionIndex,
  });
  const conflictBps = clampInteger(Math.round(input.sector.polity.conflictPressure * 5000), 0, 5000);
  const dangerBps = clampInteger(archetype.baseDangerBps + event.dangerDeltaBps + conflictBps + (input.partySize - 1) * 350, 5000, 40000);
  const enemyTier = enemyTierForDanger(dangerBps);
  const rewardMultiplierBps = regionRewardMultiplierBps({
    scarcityBonusBps: event.scarcityBonusBps,
    eventBonusBps: event.rewardBonusBps + archetype.baseRewardBps - 10000,
    politicsBonusBps: event.politicsBonusBps + clampInteger(Math.round((1 - input.sector.polity.stability) * 1500), 0, 1500),
    masteryBonusBps: projectedMasteryBonusBps(input.mastery),
    obsolescencePenaltyBps: 0,
  });
  const repetitionStreak = input.repetitionStreak ?? 0;
  const activity = (kind: "normal_mob" | "elite_mob" | "world_boss" | "quest" | "dungeon_completion" | "gathering" | "crafting", scope: any, levelExact: string) =>
    activityXpAwardExact({ levelExact, scope, activity: kind, repetitionStreak });
  const resources: readonly RegionResourceSnapshot[] = Object.freeze(
    archetype.resources.map(res => {
      const currentMasteryLevelExact = masteryLevelForResource(res, input.mastery);
      return Object.freeze({
        ...res,
        currentMasteryLevelExact,
        unlocked: BigInt(currentMasteryLevelExact) >= BigInt(res.requiredMasteryLevelExact),
      });
    }),
  );
  const snapshot = {
    regionId: `region:${input.sector.id}:${archetype.key}`,
    sectorId: input.sector.id,
    sectorOrdinal: input.sector.ordinal,
    archetype,
    generatedBiome: input.sector.biome,
    event,
    dangerBps,
    enemyTier,
    enemyBudget: resolveEnemyBudget({
      tier: enemyTier,
      referencePlayerDpsExact: archetype.referencePlayerDpsExact,
      referencePlayerEffectiveHpExact: archetype.referencePlayerEffectiveHpExact,
    }),
    rewardMultiplierBps,
    xpBudgets: Object.freeze({
      normalMobExact: activity("normal_mob", "weapon", input.mastery.combatLevelExact),
      eliteMobExact: activity("elite_mob", "weapon", input.mastery.combatLevelExact),
      worldBossExact: activity("world_boss", "weapon", input.mastery.combatLevelExact),
      questExact: activity("quest", "social", input.mastery.socialLevelExact),
      dungeonExact: activity("dungeon_completion", "combat_action", input.mastery.combatLevelExact),
      gatheringExact: activity("gathering", "gathering", input.mastery.gatheringLevelExact),
      craftingExact: activity("crafting", "profession", input.mastery.professionLevelExact),
    }),
    resources,
    relevanceReasons: Object.freeze([
      `unique-resource:${archetype.resources.map(res => res.resourceKey).join(",")}`,
      `economy-role:${archetype.economyRole}`,
      `faction:${archetype.faction}`,
      `dungeon:${archetype.dungeonKey}`,
      `world-event:${event.kind}`,
      `reward-floor-bps:${economyBounds.oldRegionRewardFloorBps}`,
    ]),
  };
  return Object.freeze({ ...snapshot, deterministicHash: regionHash(snapshot) });
}

export type RegionalWorldPlan = Readonly<{
  version: typeof AURION_REGION_PROGRESSION_VERSION;
  sourceWorldHash: string;
  worldSeed: string;
  epoch: number;
  regions: readonly RegionProgression[];
  deterministicHash: string;
}>;

export function resolveRegionalWorldPlan(input: {
  globalWorld: GlobalWorldPlan;
  resolutionIndex: number;
  mastery: RegionMasteryContext;
  partySize: number;
}): RegionalWorldPlan {
  if (!input.globalWorld.deterministicHash.trim()) throw new Error("global world hash is required");
  const regions = Object.freeze(
    input.globalWorld.sectors.map(sec =>
      resolveRegionProgression({
        worldSeed: input.globalWorld.worldSeed,
        epoch: input.globalWorld.epoch,
        resolutionIndex: input.resolutionIndex,
        sector: sec,
        mastery: input.mastery,
        partySize: input.partySize,
      }),
    ),
  );
  const snapshot = {
    version: AURION_REGION_PROGRESSION_VERSION,
    sourceWorldHash: input.globalWorld.deterministicHash,
    worldSeed: input.globalWorld.worldSeed,
    epoch: input.globalWorld.epoch,
    regions,
  };
  return Object.freeze({ ...snapshot, deterministicHash: regionHash(snapshot) });
}
