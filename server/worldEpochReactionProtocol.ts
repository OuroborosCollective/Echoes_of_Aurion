import { createHash } from "node:crypto";
import type { GlobalWorldPlan, GlobalWorldSector, WorldMigration, WorldPolity, WorldProfession, WorldQuestKind, WorldResources } from "./globalWorldProtocol";
import { resolveMarketPrices, type MarketPrice, type ScarcitySignal } from "./wasdAurionCivilizationProtocol";
import { AURION_WASD_CONTENT_VERSION, AURION_WASD_RULESET_VERSION } from "./wasdAurionProtocol";
import type { WorldChunkDelta } from "./worldChunkProtocol";
import type { WorldPresenceLease } from "./worldPresenceProtocol";

/**
 * A bounded, explicit resolution step replacing Wasd's continuous tick. Its
 * output is data-only; database application and client rendering are separate.
 */
export const AURION_WORLD_EPOCH_REACTION_VERSION = "aurion-world-epoch-reaction.v1" as const;
export const AURION_WORLD_EPOCH_MAX_SECTORS_PER_RESOLUTION = 48 as const;
export const AURION_WORLD_EPOCH_MAX_SOURCE_DELTAS = 192 as const;
export const AURION_WORLD_EPOCH_MAX_SOURCE_PRESENCES = 128 as const;

export type EpochMarketStock = { itemId: "wood_log" | "moonwheat" | "asterion_iron"; stock: number; capacity: number; price: number };
export type EpochQuestOffer = { id: string; kind: WorldQuestKind; npcRole: WorldProfession; priority: number; rationale: string; sourceIds: readonly string[] };
export type EpochMigration = WorldMigration & { protectedRoute: true };
export type EpochSectorReaction = {
  sectorId: string;
  resolutionIndex: number;
  sourceIds: readonly string[];
  resources: WorldResources;
  market: readonly EpochMarketStock[];
  professions: Readonly<Record<WorldProfession, number>>;
  migrations: readonly EpochMigration[];
  polity: WorldPolity & { deescalation: number; civilianStructuresProtected: true; playerHomesProtected: true };
  questOffers: readonly EpochQuestOffer[];
  reactionHash: string;
};

export type WorldEpochReaction = {
  version: typeof AURION_WORLD_EPOCH_REACTION_VERSION;
  ruleSetVersion: typeof AURION_WASD_RULESET_VERSION;
  contentVersion: typeof AURION_WASD_CONTENT_VERSION;
  worldId: "echoes-of-aurion-global";
  worldSeed: string;
  resolutionIndex: number;
  receiptId: string;
  processedSectorIds: readonly string[];
  ignoredSourceDeltaCount: number;
  ignoredPresenceCount: number;
  sectors: readonly EpochSectorReaction[];
  deterministicHash: string;
};

type SectorPressure = { treeHarvest: number; roads: number; structures: number; presence: number; sourceIds: string[] };
export type WorldEpochObservedPresence = Pick<WorldPresenceLease, "userId" | "chunk">;

const clampUnit = (value: number) => Math.max(0, Math.min(1, Math.round(value * 10_000) / 10_000));
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const stableHash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

function hash32(parts: readonly string[]): number {
  let value = 2166136261;
  for (const part of parts) {
    for (const character of part) { value ^= character.charCodeAt(0); value = Math.imul(value, 16777619); }
    value ^= 1249; value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function assertInput(input: { plan: GlobalWorldPlan; resolutionIndex: number }) {
  if (!input.plan.worldSeed.trim() || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 1) throw new Error("Epoch reaction requires an explicit world seed and positive resolution index");
  if (input.plan.epoch !== input.resolutionIndex) throw new Error("Epoch reaction resolution index must equal the confirmed global epoch");
}

function sectorForChunk(plan: GlobalWorldPlan, worldSeed: string, chunkX: number, chunkZ: number): string {
  const sectors = plan.sectors.slice().sort((left, right) => left.ordinal - right.ordinal || compare(left.id, right.id));
  if (!sectors.length) throw new Error("Epoch reaction requires at least one sector");
  return sectors[hash32([worldSeed, "chunk-sector", String(chunkX), String(chunkZ)]) % sectors.length]!.id;
}

function selectedSectors(plan: GlobalWorldPlan, resolutionIndex: number): readonly GlobalWorldSector[] {
  const ordered = plan.sectors.slice().sort((left, right) => left.ordinal - right.ordinal || compare(left.id, right.id));
  const count = Math.min(AURION_WORLD_EPOCH_MAX_SECTORS_PER_RESOLUTION, ordered.length);
  const start = (resolutionIndex - 1) % ordered.length;
  return Object.freeze(Array.from({ length: count }, (_, index) => ordered[(start + index) % ordered.length]!));
}

function emptyPressure(): SectorPressure {
  return { treeHarvest: 0, roads: 0, structures: 0, presence: 0, sourceIds: [] };
}

function resourceOutcome(base: WorldResources, pressure: SectorPressure): WorldResources {
  const harvestPressure = Math.min(1, pressure.treeHarvest / 8);
  const roadCare = Math.min(1, pressure.roads / 6);
  const settlementCare = Math.min(1, pressure.structures / 8);
  const regrowth = clampUnit((1 - harvestPressure) * (0.08 + roadCare * 0.04) * (1 - base.drought * 0.5));
  const drought = clampUnit(base.drought + harvestPressure * 0.08 - roadCare * 0.025);
  const timber = clampUnit(base.timber - harvestPressure * 0.32 + regrowth * 0.18);
  const forestHealth = clampUnit(base.forestHealth - harvestPressure * 0.38 - drought * 0.12 + regrowth * 0.55);
  const water = clampUnit(base.water - drought * 0.08 + roadCare * 0.035);
  const food = clampUnit(base.food - drought * 0.22 + water * 0.09 + settlementCare * 0.035);
  const ore = clampUnit(base.ore - Math.min(1, pressure.structures / 16) * 0.03 + roadCare * 0.015);
  return Object.freeze({ timber, forestHealth, food, water, ore, drought });
}

function professionOutcome(base: Readonly<Record<WorldProfession, number>>, resources: WorldResources, pressure: SectorPressure): Readonly<Record<WorldProfession, number>> {
  return Object.freeze({
    farmer: Math.max(1, Math.round(base.farmer * (0.8 + resources.food * 0.3 + resources.water * 0.12))),
    forester: Math.max(1, Math.round(base.forester * (0.7 + (1 - resources.forestHealth) * 0.55 + pressure.treeHarvest * 0.02))),
    trader: Math.max(1, Math.round(base.trader * (0.78 + pressure.roads * 0.05 + Math.abs(resources.food - resources.ore) * 0.24))),
    guard: Math.max(1, Math.round(base.guard * (0.82 + Math.max(0, resources.drought - 0.45) * 0.25))),
    builder: Math.max(1, Math.round(base.builder * (0.8 + pressure.structures * 0.035 + pressure.roads * 0.025))),
    herbalist: Math.max(1, Math.round(base.herbalist * (0.82 + resources.water * 0.22 + resources.forestHealth * 0.12))),
  });
}

function migrationOutcome(input: { sector: GlobalWorldSector; plan: GlobalWorldPlan; resources: WorldResources; professions: Readonly<Record<WorldProfession, number>>; polity: WorldPolity }): readonly EpochMigration[] {
  const ordered = input.plan.sectors.slice().sort((left, right) => left.ordinal - right.ordinal || compare(left.id, right.id));
  const position = ordered.findIndex(sector => sector.id === input.sector.id);
  const target = ordered[(position + 1) % ordered.length]!;
  const migrations: EpochMigration[] = [];
  if (input.resources.drought >= 0.62) migrations.push({ id: `epoch-migration:${input.sector.id}:farmer`, profession: "farmer", fromSectorId: input.sector.id, toSectorId: target.id, reason: "drought", count: Math.max(1, Math.floor(input.professions.farmer / 4)), protectedRoute: true });
  if (input.resources.forestHealth < 0.46) migrations.push({ id: `epoch-migration:${input.sector.id}:forester`, profession: "forester", fromSectorId: input.sector.id, toSectorId: target.id, reason: "forest_recovery", count: Math.max(1, Math.floor(input.professions.forester / 3)), protectedRoute: true });
  if (input.polity.state === "warfront" || input.polity.state === "succession_crisis") migrations.push({ id: `epoch-migration:${input.sector.id}:guard`, profession: "guard", fromSectorId: input.sector.id, toSectorId: target.id, reason: input.polity.state === "warfront" ? "war" : "safety", count: Math.max(1, Math.floor(input.professions.guard / 3)), protectedRoute: true });
  return Object.freeze(migrations.sort((left, right) => compare(left.id, right.id)));
}

function epochQuestOffers(input: { sector: GlobalWorldSector; resources: WorldResources; polity: EpochSectorReaction["polity"]; sourceIds: readonly string[] }): readonly EpochQuestOffer[] {
  const offers: EpochQuestOffer[] = [];
  if (input.resources.forestHealth < 0.46) offers.push({ id: `epoch-quest:${input.sector.id}:restore-forest`, kind: "restore_forest", npcRole: "forester", priority: 4, rationale: "Bestätigte Entnahme und Dürredruck erfordern Wiederbewuchs.", sourceIds: input.sourceIds });
  if (input.resources.drought > 0.62 || input.resources.water < 0.42) offers.push({ id: `epoch-quest:${input.sector.id}:irrigate-fields`, kind: "irrigate_fields", npcRole: "farmer", priority: 4, rationale: "Die bestätigte Wasserbilanz gefährdet regionale Felder.", sourceIds: input.sourceIds });
  if (input.polity.state === "warfront" || input.polity.state === "succession_crisis") offers.push({ id: `epoch-quest:${input.sector.id}:mediate-crisis`, kind: "mediate_crisis", npcRole: "guard", priority: 5, rationale: "Der fiktive Konfliktdruck wird nur über Schutz- und Deeskalationsaufgaben adressiert.", sourceIds: input.sourceIds });
  if (input.resources.food < 0.4 || input.resources.ore < 0.32) offers.push({ id: `epoch-quest:${input.sector.id}:escort-caravan`, kind: "escort_caravan", npcRole: "trader", priority: 3, rationale: "Bestätigte Marktknappheit verlangt eine geschützte Versorgungsroute.", sourceIds: input.sourceIds });
  return Object.freeze(offers.sort((left, right) => right.priority - left.priority || compare(left.id, right.id)));
}

function sectorOutcome(input: { sector: GlobalWorldSector; plan: GlobalWorldPlan; resolutionIndex: number; pressure: SectorPressure }): EpochSectorReaction {
  const sourceIds = Object.freeze(Array.from(new Set(input.pressure.sourceIds)).sort(compare));
  const resources = resourceOutcome(input.sector.resources, input.pressure);
  const deescalation = clampUnit(Math.min(1, input.pressure.roads / 8) * 0.16 + Math.min(1, input.pressure.presence / 12) * 0.08 + resources.food * 0.05 + resources.water * 0.05);
  const conflictPressure = clampUnit(input.sector.polity.conflictPressure - deescalation);
  const stability = clampUnit(input.sector.polity.stability + deescalation);
  const state: WorldPolity["state"] = conflictPressure >= 0.72 ? "warfront" : stability < 0.38 ? "succession_crisis" : stability < 0.58 ? "unrest" : "stable";
  const polity = Object.freeze({ ...input.sector.polity, conflictPressure, stability, state, deescalation, civilianStructuresProtected: true as const, playerHomesProtected: true as const });
  const professions = professionOutcome(input.sector.professions, resources, input.pressure);
  const scarcity: readonly ScarcitySignal[] = [
    { regionId: input.sector.id, itemId: "wood_log", shiftPercentage: 0.5 - resources.timber, x: input.sector.coordinates.x, y: 0, z: input.sector.coordinates.z, resolutionIndex: input.resolutionIndex, sourceReceiptId: `epoch:${input.resolutionIndex}:${input.sector.id}:timber` },
    { regionId: input.sector.id, itemId: "moonwheat", shiftPercentage: 0.5 - resources.food, x: input.sector.coordinates.x, y: 0, z: input.sector.coordinates.z, resolutionIndex: input.resolutionIndex, sourceReceiptId: `epoch:${input.resolutionIndex}:${input.sector.id}:food` },
    { regionId: input.sector.id, itemId: "asterion_iron", shiftPercentage: 0.5 - resources.ore, x: input.sector.coordinates.x, y: 0, z: input.sector.coordinates.z, resolutionIndex: input.resolutionIndex, sourceReceiptId: `epoch:${input.resolutionIndex}:${input.sector.id}:ore` },
  ];
  const prices = resolveMarketPrices({ regionId: input.sector.id, weatherTone: resources.drought > 0.72 ? "ashfall" : resources.water > 0.68 ? "rain" : "clear", listings: [
    { itemId: "wood_log", basePrice: 12, category: "material" }, { itemId: "moonwheat", basePrice: 9, category: "provisions" }, { itemId: "asterion_iron", basePrice: 28, category: "material" },
  ], scarcity, resolutionIndex: input.resolutionIndex });
  const byItem = new Map(prices.map(price => [price.itemId, price]));
  const market = Object.freeze([
    { itemId: "wood_log" as const, stock: Math.round(resources.timber * 5_000), capacity: 5_000, price: byItem.get("wood_log")!.price },
    { itemId: "moonwheat" as const, stock: Math.round(resources.food * 4_500), capacity: 4_500, price: byItem.get("moonwheat")!.price },
    { itemId: "asterion_iron" as const, stock: Math.round(resources.ore * 4_000), capacity: 4_000, price: byItem.get("asterion_iron")!.price },
  ]);
  const migrations = migrationOutcome({ sector: input.sector, plan: input.plan, resources, professions, polity });
  const questOffers = epochQuestOffers({ sector: input.sector, resources, polity, sourceIds });
  const reactionHash = stableHash([AURION_WORLD_EPOCH_REACTION_VERSION, input.sector.id, String(input.resolutionIndex), ...sourceIds, JSON.stringify(resources), JSON.stringify(market), JSON.stringify(professions), JSON.stringify(migrations), JSON.stringify(polity), JSON.stringify(questOffers)]);
  return Object.freeze({ sectorId: input.sector.id, resolutionIndex: input.resolutionIndex, sourceIds, resources, market, professions, migrations, polity, questOffers, reactionHash });
}

export function resolveWorldEpochReaction(input: { plan: GlobalWorldPlan; resolutionIndex: number; confirmedDeltas: readonly WorldChunkDelta[]; observedPresence: readonly WorldEpochObservedPresence[] }): WorldEpochReaction {
  assertInput(input);
  const sectors = selectedSectors(input.plan, input.resolutionIndex);
  const selectedIds = new Set(sectors.map(sector => sector.id));
  const pressureBySector = new Map(sectors.map(sector => [sector.id, emptyPressure()]));
  const orderedDeltas = input.confirmedDeltas.slice().sort((left, right) => left.coordinate.z - right.coordinate.z || left.coordinate.x - right.coordinate.x || left.sequence - right.sequence || compare(left.id, right.id));
  const acceptedDeltas = orderedDeltas.slice(0, AURION_WORLD_EPOCH_MAX_SOURCE_DELTAS);
  acceptedDeltas.forEach(delta => {
    const sectorId = sectorForChunk(input.plan, input.plan.worldSeed, delta.coordinate.x, delta.coordinate.z);
    const pressure = pressureBySector.get(sectorId);
    if (!pressure) return;
    pressure.sourceIds.push(delta.id);
    if (delta.kind === "resource_depleted" && String(delta.targetId).startsWith("tree:")) pressure.treeHarvest += 1;
    if (delta.kind === "road_built") pressure.roads += 1;
    if (delta.kind === "structure_placed") pressure.structures += 1;
  });
  const orderedPresence = input.observedPresence.slice().sort((left, right) => compare(left.userId.toString(), right.userId.toString()) || left.chunk.z - right.chunk.z || left.chunk.x - right.chunk.x);
  const acceptedPresence = orderedPresence.slice(0, AURION_WORLD_EPOCH_MAX_SOURCE_PRESENCES);
  acceptedPresence.forEach(presence => {
    const sectorId = sectorForChunk(input.plan, input.plan.worldSeed, presence.chunk.x, presence.chunk.z);
    const pressure = pressureBySector.get(sectorId);
    if (!pressure) return;
    pressure.presence += 1;
    pressure.sourceIds.push(`presence:${presence.userId}:${presence.chunk.x}:${presence.chunk.z}`);
  });
  const outcomes = sectors.map(sector => sectorOutcome({ sector, plan: input.plan, resolutionIndex: input.resolutionIndex, pressure: pressureBySector.get(sector.id)! })).sort((left, right) => compare(left.sectorId, right.sectorId));
  const deterministicHash = stableHash([AURION_WORLD_EPOCH_REACTION_VERSION, AURION_WASD_RULESET_VERSION, AURION_WASD_CONTENT_VERSION, input.plan.worldSeed, String(input.resolutionIndex), ...outcomes.map(outcome => outcome.reactionHash)]);
  return Object.freeze({ version: AURION_WORLD_EPOCH_REACTION_VERSION, ruleSetVersion: AURION_WASD_RULESET_VERSION, contentVersion: AURION_WASD_CONTENT_VERSION, worldId: "echoes-of-aurion-global", worldSeed: input.plan.worldSeed, resolutionIndex: input.resolutionIndex, receiptId: `world-epoch:${input.resolutionIndex}:${deterministicHash.slice(0, 24)}`, processedSectorIds: Object.freeze(outcomes.map(outcome => outcome.sectorId)), ignoredSourceDeltaCount: Math.max(0, orderedDeltas.length - acceptedDeltas.length), ignoredPresenceCount: Math.max(0, orderedPresence.length - acceptedPresence.length), sectors: Object.freeze(outcomes), deterministicHash });
}

export function toEpochMarketPrices(reaction: WorldEpochReaction): readonly MarketPrice[] {
  return Object.freeze(reaction.sectors.flatMap(sector => sector.market.map(stock => ({ itemId: `${sector.sectorId}:${stock.itemId}`, basePrice: stock.price, category: stock.itemId === "moonwheat" ? "provisions" as const : "material" as const, price: stock.price, scarcityDelta: 0, weatherMultiplier: 1, receiptHash: sector.reactionHash }))).sort((left, right) => compare(left.itemId, right.itemId)));
}
