import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import type { ChunkBiome } from "./worldChunkProtocol";

/**
 * AIM-545: Chunk-Seed Ecology & Resource Renewal.
 *
 * Deterministic ecology derived from chunk seed + structure context.
 * Resources emerge from the world seed, are consumed by entity actions,
 * and regenerate through a model — not wall-clock respawn.
 *
 * Chain: #512 structure grammar → #514 structure observation → ecology state.
 * Aurion is the sole authority; no AX1/WASD dependency.
 */

export const AURION_CHUNK_SEED_ECOLOGY_PROTOCOL = "aurion.chunk-seed-ecology.v1" as const;
export const ECOLOGY_GENERATOR_VERSION = "aurion.ecology-generator.v1" as const;
export const ECOLOGY_MAX_NODES_PER_CHUNK = 32;
export const ECOLOGY_REGENERATION_OVERUSE_THRESHOLD_BPS = 2_500;
export const ECOLOGY_REGENERATION_OVERUSE_PENALTY_DIVISOR = 2;
export const ECOLOGY_MAX_CHUNK_COORDINATE = 1_000_000;

export const chunkSeedEcologyResourceKinds = [
  "food", "water", "wood", "stone", "ore",
  "wildlife", "plants", "fish", "soil_fertility", "fuel", "special_material",
] as const;
export type ChunkSeedEcologyResourceKind = (typeof chunkSeedEcologyResourceKinds)[number];

export const chunkSeedEcologySeasons = [
  "spring", "summer", "autumn", "winter",
] as const;
export type ChunkSeedEcologySeason = (typeof chunkSeedEcologySeasons)[number];

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bareSha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const coordinate = z.strictObject({
  x: z.number().int().min(-ECOLOGY_MAX_CHUNK_COORDINATE).max(ECOLOGY_MAX_CHUNK_COORDINATE),
  z: z.number().int().min(-ECOLOGY_MAX_CHUNK_COORDINATE).max(ECOLOGY_MAX_CHUNK_COORDINATE),
});
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const resourceKind = z.enum(chunkSeedEcologyResourceKinds);
const season = z.enum(chunkSeedEcologySeasons);

// ---------------------------------------------------------------------------
// Biome → resource weights (deterministic, no external data)
// ---------------------------------------------------------------------------

const BIOME_RESOURCE_WEIGHTS: Readonly<Record<ChunkBiome, Readonly<Partial<Record<ChunkSeedEcologyResourceKind, number>>>>> = Object.freeze({
  forest: Object.freeze({ wood: 3, plants: 2, food: 2, wildlife: 1, water: 1 }),
  riverland: Object.freeze({ water: 3, fish: 3, plants: 2, soil_fertility: 1 }),
  plains: Object.freeze({ food: 3, plants: 2, soil_fertility: 2, water: 1 }),
  highland: Object.freeze({ stone: 3, ore: 2, fuel: 1, wildlife: 1 }),
  ashland: Object.freeze({ ore: 3, stone: 2, special_material: 1, fuel: 1 }),
  ruins: Object.freeze({ stone: 2, special_material: 2, ore: 1, fuel: 1 }),
});

const SEASON_REGENERATION_MULTIPLIER_BPS: Readonly<Record<ChunkSeedEcologySeason, number>> = Object.freeze({
  spring: 120,
  summer: 100,
  autumn: 80,
  winter: 40,
});

// ---------------------------------------------------------------------------
// Deterministic hash (FNV-1a 32-bit, same family as worldChunkProtocol)
// ---------------------------------------------------------------------------

function hash32(...parts: readonly string[]): number {
  let value = 2166136261;
  for (const part of parts) {
    for (const character of part) {
      value ^= character.charCodeAt(0);
      value = Math.imul(value, 16777619);
    }
    value ^= 1249;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

// ---------------------------------------------------------------------------
// Node definitions (deterministic from chunk seed + biome + structure context)
// ---------------------------------------------------------------------------

export type ChunkSeedEcologyNodeDefinition = Readonly<{
  nodeId: string;
  resourceKind: ChunkSeedEcologyResourceKind;
  capacity: number;
  regenerationRateBps: number;
  positionMm: Readonly<{ x: number; z: number }>;
  structureObservationKey: string | null;
}>;

export const chunkSeedEcologyNodeDefinitionSchema = z.strictObject({
  nodeId: identifier,
  resourceKind: resourceKind,
  capacity: positiveInteger.max(1_000_000),
  regenerationRateBps: z.number().int().min(0).max(10_000),
  positionMm: z.strictObject({ x: z.number().int().min(0).max(64_000), z: z.number().int().min(0).max(64_000) }),
  structureObservationKey: sha256.nullable(),
});

const CHUNK_SIZE_MM = 64_000;

function weightedResourceKind(
  biome: ChunkBiome,
  worldSeed: string,
  coordinate: Readonly<{ x: number; z: number }>,
  structureObservationKey: string | null,
  slot: number,
): ChunkSeedEcologyResourceKind {
  const weights = BIOME_RESOURCE_WEIGHTS[biome];
  const entries = Object.entries(weights) as [ChunkSeedEcologyResourceKind, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let hash = hash32("ecology-kind", worldSeed, String(coordinate.x), String(coordinate.z), biome, structureObservationKey ?? "none", String(slot)) % totalWeight;
  for (const [kind, weight] of entries) {
    if (hash < weight) return kind;
    hash -= weight;
  }
  return entries[0][0];
}

/**
 * Derive ecology node definitions deterministically from chunk seed + biome.
 *
 * @param worldSeed  - the canonical world seed string
 * @param coordinate - chunk coordinate
 * @param biome      - chunk biome (from worldChunkProtocol)
 * @param structureObservationKey - optional #514 observation key linking structures to ecology
 */
export function deriveEcologyNodeDefinitions(input: Readonly<{
  worldSeed: string;
  coordinate: Readonly<{ x: number; z: number }>;
  biome: ChunkBiome;
  structureObservationKey?: string | null;
}>): readonly ChunkSeedEcologyNodeDefinition[] {
  if (!input.worldSeed.trim()) throw new Error("ECOLOGY_WORLD_SEED_REQUIRED");
  coordinate.parse(input.coordinate);
  const structureKey = input.structureObservationKey ?? null;
  if (structureKey !== null) sha256.parse(structureKey);
  const context = structureKey ?? "none";
  const nodes: ChunkSeedEcologyNodeDefinition[] = [];

  for (let slot = 0; slot < ECOLOGY_MAX_NODES_PER_CHUNK; slot += 1) {
    const activation = hash32(input.worldSeed, context, "ecology-activation", String(input.coordinate.x), String(input.coordinate.z), String(slot)) % 100;
    if (activation >= 60) continue;

    const kind = weightedResourceKind(input.biome, input.worldSeed, input.coordinate, structureKey, slot);
    const capacityBase = 100 + hash32(input.worldSeed, context, "ecology-capacity", String(input.coordinate.x), String(input.coordinate.z), String(slot)) % 901;
    const regenBase = 500 + hash32(input.worldSeed, context, "ecology-regen", String(input.coordinate.x), String(input.coordinate.z), String(slot)) % 4501;
    const posX = 2_000 + hash32(input.worldSeed, context, "ecology-x", String(input.coordinate.x), String(input.coordinate.z), String(slot)) % (CHUNK_SIZE_MM - 4_000);
    const posZ = 2_000 + hash32(input.worldSeed, context, "ecology-z", String(input.coordinate.x), String(input.coordinate.z), String(slot)) % (CHUNK_SIZE_MM - 4_000);

    nodes.push(Object.freeze({
      nodeId: `eco:${input.coordinate.x}:${input.coordinate.z}:${slot}`,
      resourceKind: kind,
      capacity: capacityBase,
      regenerationRateBps: regenBase,
      positionMm: Object.freeze({ x: posX, z: posZ }),
      structureObservationKey: structureKey,
    }));
  }

  return Object.freeze(nodes);
}

// ---------------------------------------------------------------------------
// Node state (confirmed Aurion state)
// ---------------------------------------------------------------------------

export type ChunkSeedEcologyNodeState = Readonly<{
  nodeId: string;
  remaining: number;
  depleted: boolean;
  lastModifiedTick: number;
}>;

export const chunkSeedEcologyNodeStateSchema = z.strictObject({
  nodeId: identifier,
  remaining: nonNegativeInteger,
  depleted: z.boolean(),
  lastModifiedTick: nonNegativeInteger,
});

// ---------------------------------------------------------------------------
// Ecology snapshot (canonical, hash-verified)
// ---------------------------------------------------------------------------

export type ChunkSeedEcologySnapshot = Readonly<{
  protocol: typeof AURION_CHUNK_SEED_ECOLOGY_PROTOCOL;
  generatorVersion: typeof ECOLOGY_GENERATOR_VERSION;
  worldId: string;
  chunkCoordinate: Readonly<{ x: number; z: number }>;
  epoch: number;
  sourceRevision: string;
  sourceCausalRoot: string;
  confirmedChunkHash: string;
  structureObservationKey: string | null;
  season: ChunkSeedEcologySeason;
  nodes: readonly ChunkSeedEcologyNodeState[];
  revision: number;
  ecologyHash: string;
}>;

export const chunkSeedEcologySnapshotSchema = z.strictObject({
  protocol: z.literal(AURION_CHUNK_SEED_ECOLOGY_PROTOCOL),
  generatorVersion: z.literal(ECOLOGY_GENERATOR_VERSION),
  worldId: identifier,
  chunkCoordinate: coordinate,
  epoch: positiveInteger,
  sourceRevision: revision,
  sourceCausalRoot: sha256,
  confirmedChunkHash: sha256,
  structureObservationKey: sha256.nullable(),
  season: season,
  nodes: z.array(chunkSeedEcologyNodeStateSchema).max(ECOLOGY_MAX_NODES_PER_CHUNK),
  revision: positiveInteger,
  ecologyHash: sha256,
});

function ecologyHashValue(snapshot: Omit<ChunkSeedEcologySnapshot, "ecologyHash">): string {
  return canonicalSha256({
    domain: AURION_CHUNK_SEED_ECOLOGY_PROTOCOL,
    snapshot,
  });
}

/**
 * Create the initial ecological state from node definitions.
 * All nodes start at full capacity.
 */
export function createInitialEcologySnapshot(input: Readonly<{
  worldId: string;
  chunkCoordinate: Readonly<{ x: number; z: number }>;
  epoch: number;
  sourceRevision: string;
  sourceCausalRoot: string;
  confirmedChunkHash: string;
  structureObservationKey: string | null;
  season: ChunkSeedEcologySeason;
  definitions: readonly ChunkSeedEcologyNodeDefinition[];
}>): ChunkSeedEcologySnapshot {
  const worldId = identifier.parse(input.worldId);
  const sourceRev = revision.parse(input.sourceRevision);
  const sourceRoot = sha256.parse(input.sourceCausalRoot);
  const chunkHash = sha256.parse(input.confirmedChunkHash);
  const structKey = input.structureObservationKey === null ? null : sha256.parse(input.structureObservationKey);
  const seasonValue = season.parse(input.season);
  const epochValue = positiveInteger.parse(input.epoch);

  const nodes: ChunkSeedEcologyNodeState[] = input.definitions.map(def => {
    chunkSeedEcologyNodeDefinitionSchema.parse(def);
    return Object.freeze({
      nodeId: def.nodeId,
      remaining: def.capacity,
      depleted: false,
      lastModifiedTick: 0,
    });
  });
  if (new Set(nodes.map(node => node.nodeId)).size !== nodes.length) throw new Error("ECOLOGY_NODE_ID_DUPLICATE");

  const snapshot = {
    protocol: AURION_CHUNK_SEED_ECOLOGY_PROTOCOL,
    generatorVersion: ECOLOGY_GENERATOR_VERSION,
    worldId,
    chunkCoordinate: { ...input.chunkCoordinate },
    epoch: epochValue,
    sourceRevision: sourceRev,
    sourceCausalRoot: sourceRoot,
    confirmedChunkHash: chunkHash,
    structureObservationKey: structKey,
    season: seasonValue,
    nodes: Object.freeze(nodes),
    revision: 1,
  };

  return Object.freeze({ ...snapshot, ecologyHash: ecologyHashValue(snapshot) }) as ChunkSeedEcologySnapshot;
}

// ---------------------------------------------------------------------------
// Consumption (entity action → resource delta)
// ---------------------------------------------------------------------------

export type ChunkSeedEcologyConsumptionDelta = Readonly<{
  nodeId: string;
  amount: number;
  tick: number;
  causeTag: string;
  actorEntityId: string;
}>;

export const chunkSeedEcologyConsumptionDeltaSchema = z.strictObject({
  nodeId: identifier,
  amount: positiveInteger.max(1_000_000),
  tick: nonNegativeInteger,
  causeTag: identifier,
  actorEntityId: identifier,
});

/**
 * Apply a consumption delta to an ecology snapshot.
 * Returns a new snapshot with reduced remaining and incremented revision.
 * Throws if the node is unknown, already depleted, or the amount exceeds remaining.
 */
export function applyEcologyConsumption(
  snapshot: ChunkSeedEcologySnapshot,
  delta: ChunkSeedEcologyConsumptionDelta,
): ChunkSeedEcologySnapshot {
  const prior = chunkSeedEcologySnapshotSchema.parse(snapshot);
  const consumption = chunkSeedEcologyConsumptionDeltaSchema.parse(delta);

  if (consumption.tick < prior.epoch) {
    throw new Error("ECOLOGY_CONSUMPTION_TICK_BEFORE_EPOCH");
  }

  const nodeIndex = prior.nodes.findIndex(n => n.nodeId === consumption.nodeId);
  if (nodeIndex === -1) throw new Error("ECOLOGY_NODE_NOT_FOUND");

  const node = prior.nodes[nodeIndex];
  if (consumption.tick < node.lastModifiedTick) throw new Error("ECOLOGY_CONSUMPTION_TICK_BEFORE_NODE");
  if (node.depleted) throw new Error("ECOLOGY_NODE_DEPLETED");
  if (consumption.amount > node.remaining) throw new Error("ECOLOGY_CONSUMPTION_EXCEEDS_REMAINING");

  const newRemaining = node.remaining - consumption.amount;
  const newNodes = [...prior.nodes];
  newNodes[nodeIndex] = Object.freeze({
    nodeId: node.nodeId,
    remaining: newRemaining,
    depleted: newRemaining === 0,
    lastModifiedTick: consumption.tick,
  });

  const { ecologyHash: _ignored, ...priorEnvelope } = prior;
  const next = {
    ...priorEnvelope,
    nodes: Object.freeze(newNodes),
    revision: prior.revision + 1,
  };

  return Object.freeze({ ...next, ecologyHash: ecologyHashValue(next) }) as ChunkSeedEcologySnapshot;
}

// ---------------------------------------------------------------------------
// Regeneration (model-based, not wall-clock)
// ---------------------------------------------------------------------------

export type ChunkSeedEcologyRegenerationResult = Readonly<{
  nodeId: string;
  regenerated: number;
  newRemaining: number;
  wasDepleted: boolean;
}>;

/**
 * Apply regeneration to all nodes for one epoch tick.
 *
 * Regeneration model:
 * - Base: capacity * regenerationRateBps / 10_000 per tick
 * - Season multiplier: applied as basis points (spring=120, summer=100, autumn=80, winter=40)
 * - Overuse penalty: if remaining < capacity * 25%, regeneration is halved
 * - Depleted nodes: regeneration starts only after the model produces > 0
 * - Capped at capacity
 *
 * @param snapshot     - current ecology snapshot
 * @param definitions  - node definitions (for capacity and regeneration rate)
 * @param tick         - the epoch tick to regenerate for
 */
export function applyEcologyRegeneration(
  snapshot: ChunkSeedEcologySnapshot,
  definitions: readonly ChunkSeedEcologyNodeDefinition[],
  tick: number,
): Readonly<{ snapshot: ChunkSeedEcologySnapshot; results: readonly ChunkSeedEcologyRegenerationResult[] }> {
  const prior = chunkSeedEcologySnapshotSchema.parse(snapshot);
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("ECOLOGY_REGENERATION_TICK_INVALID");
  if (tick < prior.epoch) throw new Error("ECOLOGY_REGENERATION_TICK_BEFORE_EPOCH");
  if (tick === prior.epoch) throw new Error("ECOLOGY_REGENERATION_TICK_NOT_ADVANCED");

  const parsedDefinitions = definitions.map(definition => chunkSeedEcologyNodeDefinitionSchema.parse(definition));
  const defById = new Map(parsedDefinitions.map(d => [d.nodeId, d] as const));
  if (defById.size !== parsedDefinitions.length || defById.size !== prior.nodes.length || prior.nodes.some(node => !defById.has(node.nodeId))) {
    throw new Error("ECOLOGY_DEFINITION_SET_MISMATCH");
  }
  const seasonMultiplierBps = SEASON_REGENERATION_MULTIPLIER_BPS[prior.season];

  const results: ChunkSeedEcologyRegenerationResult[] = [];
  const newNodes: ChunkSeedEcologyNodeState[] = [];

  for (const node of prior.nodes) {
    const def = defById.get(node.nodeId);
    if (!def) {
      newNodes.push(node);
      continue;
    }

    const baseRegen = Math.floor(def.capacity * def.regenerationRateBps / 10_000);
    const seasonalRegen = Math.floor(baseRegen * seasonMultiplierBps / 100);

    // Overuse penalty: if remaining < 25% of capacity, halve regeneration
    const overuseThreshold = Math.floor(def.capacity * ECOLOGY_REGENERATION_OVERUSE_THRESHOLD_BPS / 10_000);
    const isOverused = node.remaining < overuseThreshold && node.remaining > 0;
    const regenAmount = isOverused
      ? Math.floor(seasonalRegen / ECOLOGY_REGENERATION_OVERUSE_PENALTY_DIVISOR)
      : seasonalRegen;

    const newRemaining = Math.min(def.capacity, node.remaining + regenAmount);
    const regenerated = newRemaining - node.remaining;

    results.push(Object.freeze({
      nodeId: node.nodeId,
      regenerated,
      newRemaining,
      wasDepleted: node.depleted,
    }));

    newNodes.push(Object.freeze({
      nodeId: node.nodeId,
      remaining: newRemaining,
      depleted: newRemaining === 0,
      lastModifiedTick: regenerated > 0 ? tick : node.lastModifiedTick,
    }));
  }

  const { ecologyHash: _ignored, ...priorEnvelope } = prior;
  const next = {
    ...priorEnvelope,
    epoch: tick,
    nodes: Object.freeze(newNodes),
    revision: prior.revision + 1,
  };

  return Object.freeze({
    snapshot: Object.freeze({ ...next, ecologyHash: ecologyHashValue(next) }) as ChunkSeedEcologySnapshot,
    results: Object.freeze(results),
  });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function assertEcologySnapshot(value: unknown): asserts value is ChunkSeedEcologySnapshot {
  const parsed = chunkSeedEcologySnapshotSchema.parse(value);
  const { ecologyHash, ...envelope } = parsed;
  const expected = ecologyHashValue(envelope);
  if (ecologyHash !== expected) throw new Error("ECOLOGY_HASH_MISMATCH");
}

export function verifyEcologyDeterminism(
  left: ChunkSeedEcologySnapshot,
  right: ChunkSeedEcologySnapshot,
): boolean {
  assertEcologySnapshot(left);
  assertEcologySnapshot(right);
  return left.ecologyHash === right.ecologyHash;
}

/**
 * Project an ecology snapshot to a compact readmodel for consumers
 * (NPC simulation input, network payload, etc.).
 */
export function projectEcologySnapshot(snapshot: ChunkSeedEcologySnapshot): Readonly<{
  protocol: typeof AURION_CHUNK_SEED_ECOLOGY_PROTOCOL;
  worldId: string;
  chunkCoordinate: Readonly<{ x: number; z: number }>;
  epoch: number;
  season: ChunkSeedEcologySeason;
  structureObservationKey: string | null;
  nodeCount: number;
  depletedCount: number;
  totalRemaining: number;
  ecologyHash: string;
}> {
  assertEcologySnapshot(snapshot);
  const depletedCount = snapshot.nodes.filter(n => n.depleted).length;
  const totalRemaining = snapshot.nodes.reduce((sum, n) => sum + n.remaining, 0);
  return Object.freeze({
    protocol: AURION_CHUNK_SEED_ECOLOGY_PROTOCOL,
    worldId: snapshot.worldId,
    chunkCoordinate: { ...snapshot.chunkCoordinate },
    epoch: snapshot.epoch,
    season: snapshot.season,
    structureObservationKey: snapshot.structureObservationKey,
    nodeCount: snapshot.nodes.length,
    depletedCount,
    totalRemaining,
    ecologyHash: snapshot.ecologyHash,
  });
}
