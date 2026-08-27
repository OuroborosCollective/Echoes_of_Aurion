export const AURION_WORLD_CHUNK_RULESET = "aurion-world-chunk.v1" as const;
export const WORLD_CHUNK_SIZE_MM = 64_000 as const;
export const WORLD_CHUNK_GRID_SIZE = 16 as const;
export const WORLD_CHUNK_BASE_REVISION = 1 as const;
/** ±1,000,000 chunks at 64 m: 128,000 km total span while integer world positions remain exact in JavaScript. */
export const WORLD_CHUNK_COORDINATE_LIMIT = 1_000_000 as const;

export type WorldChunkCoordinate = { x: number; z: number };
export type ChunkBiome = "forest" | "riverland" | "plains" | "highland" | "ashland" | "ruins";
export type ChunkSurface = "grass" | "forest_floor" | "riverbank" | "stone" | "ash" | "ruin_path";
export type ChunkResourceKind = "tree" | "herb" | "ore" | "water";
export type WorldChunkDeltaKind = "resource_depleted" | "structure_placed" | "structure_removed" | "road_built";

export type BaseChunkTile = {
  x: number;
  z: number;
  heightMm: number;
  surface: ChunkSurface;
};

export type BaseChunkResource = {
  id: string;
  kind: ChunkResourceKind;
  positionMm: { x: number; z: number };
  yieldKey: "wood" | "herbs" | "ore" | "water";
};

export type BaseWorldChunk = {
  worldId: string;
  worldSeedDigest: string;
  ruleSetVersion: typeof AURION_WORLD_CHUNK_RULESET;
  coordinate: WorldChunkCoordinate;
  baseRevision: typeof WORLD_CHUNK_BASE_REVISION;
  biome: ChunkBiome;
  tiles: readonly BaseChunkTile[];
  resources: readonly BaseChunkResource[];
  deterministicHash: string;
};

export type WorldChunkDelta = {
  id: string;
  worldId: string;
  coordinate: WorldChunkCoordinate;
  baseRevision: number;
  sequence: number;
  kind: WorldChunkDeltaKind;
  targetId: string;
  actorUserId: number;
  idempotencyKey: string;
  payload: Readonly<Record<string, string | number | boolean>>;
  deterministicHash: string;
};

export type WorldChunkReadModel = {
  base: BaseWorldChunk;
  appliedDeltaIds: readonly string[];
  visibleResources: readonly BaseChunkResource[];
  structures: readonly { id: string; assetKey: string; positionMm: { x: number; z: number } }[];
  roads: readonly { id: string; fromMm: { x: number; z: number }; toMm: { x: number; z: number } }[];
  deterministicHash: string;
};

/** Client-visible receipt subset. Actor and idempotency material remain private to the authoritative service. */
export type WorldChunkDeltaOverlay = {
  id: string;
  worldId: string;
  coordinate: WorldChunkCoordinate;
  baseRevision: number;
  sequence: number;
  kind: WorldChunkDeltaKind;
  targetId: string;
  payload: Readonly<Record<string, string | number | boolean>>;
  deterministicHash: string;
};

export function toWorldChunkDeltaOverlay(delta: WorldChunkDelta): WorldChunkDeltaOverlay {
  return Object.freeze({
    id: delta.id,
    worldId: delta.worldId,
    coordinate: { ...delta.coordinate },
    baseRevision: delta.baseRevision,
    sequence: delta.sequence,
    kind: delta.kind,
    targetId: delta.targetId,
    payload: { ...delta.payload },
    deterministicHash: delta.deterministicHash,
  });
}

function assertWhole(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
}

function assertUnsigned(value: number, name: string): void {
  assertWhole(value, name);
  if (value < 0) throw new Error(`${name} must not be negative`);
}

function assertCoordinate(value: WorldChunkCoordinate): void {
  assertWhole(value.x, "chunk x");
  assertWhole(value.z, "chunk z");
  if (Math.abs(value.x) > WORLD_CHUNK_COORDINATE_LIMIT || Math.abs(value.z) > WORLD_CHUNK_COORDINATE_LIMIT) throw new Error("chunk coordinate exceeds world boundary");
}

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashDigest(value: unknown): string {
  return `fnv1a-${hash32(stableStringify(value)).toString(16).padStart(8, "0")}`;
}

function worldSeedDigest(worldId: string, worldSeed: string): string {
  return `fnv1a-${hash32(worldId, worldSeed, AURION_WORLD_CHUNK_RULESET).toString(16).padStart(8, "0")}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function biomeFor(worldSeed: string, coordinate: WorldChunkCoordinate): ChunkBiome {
  const index = hash32(worldSeed, "biome", String(coordinate.x), String(coordinate.z)) % 6;
  return (["forest", "riverland", "plains", "highland", "ashland", "ruins"] as const)[index]!;
}

function surfaceFor(biome: ChunkBiome, x: number, z: number, road: boolean): ChunkSurface {
  if (road) return biome === "ruins" ? "ruin_path" : "stone";
  if (biome === "forest") return "forest_floor";
  if (biome === "riverland") return "riverbank";
  if (biome === "ashland") return "ash";
  if (biome === "highland") return "stone";
  return "grass";
}

function resourceKindFor(biome: ChunkBiome, slot: number): ChunkResourceKind {
  const byBiome: Record<ChunkBiome, readonly ChunkResourceKind[]> = {
    forest: ["tree", "tree", "herb", "water"],
    riverland: ["water", "herb", "tree", "herb"],
    plains: ["herb", "tree", "water", "herb"],
    highland: ["ore", "ore", "tree", "herb"],
    ashland: ["ore", "herb", "ore", "water"],
    ruins: ["ore", "herb", "tree", "water"],
  };
  return byBiome[biome][slot % byBiome[biome].length]!;
}

function yieldFor(kind: ChunkResourceKind): BaseChunkResource["yieldKey"] {
  if (kind === "tree") return "wood";
  if (kind === "herb") return "herbs";
  if (kind === "ore") return "ore";
  return "water";
}

function buildTiles(worldSeed: string, coordinate: WorldChunkCoordinate, biome: ChunkBiome): readonly BaseChunkTile[] {
  const tiles: BaseChunkTile[] = [];
  for (let z = 0; z < WORLD_CHUNK_GRID_SIZE; z += 1) {
    for (let x = 0; x < WORLD_CHUNK_GRID_SIZE; x += 1) {
      const noise = hash32(worldSeed, "height", String(coordinate.x), String(coordinate.z), String(x), String(z)) % 4_001;
      const ridge = (Math.abs(coordinate.x) + Math.abs(coordinate.z)) % 11 * 40;
      const road = x === WORLD_CHUNK_GRID_SIZE / 2 || z === WORLD_CHUNK_GRID_SIZE / 2;
      tiles.push({ x, z, heightMm: noise - 2_000 + ridge, surface: surfaceFor(biome, x, z, road) });
    }
  }
  return tiles;
}

function buildResources(worldSeed: string, coordinate: WorldChunkCoordinate, biome: ChunkBiome): readonly BaseChunkResource[] {
  const resources: BaseChunkResource[] = [];
  for (let slot = 0; slot < 8; slot += 1) {
    const activation = hash32(worldSeed, "resource-enabled", String(coordinate.x), String(coordinate.z), String(slot)) % 100;
    if (activation >= 68) continue;
    const kind = resourceKindFor(biome, slot);
    const positionX = 4_000 + hash32(worldSeed, "resource-x", String(coordinate.x), String(coordinate.z), String(slot)) % (WORLD_CHUNK_SIZE_MM - 8_000);
    const positionZ = 4_000 + hash32(worldSeed, "resource-z", String(coordinate.x), String(coordinate.z), String(slot)) % (WORLD_CHUNK_SIZE_MM - 8_000);
    resources.push({
      id: `base:${coordinate.x}:${coordinate.z}:resource:${slot}`,
      kind,
      positionMm: { x: positionX, z: positionZ },
      yieldKey: yieldFor(kind),
    });
  }
  return resources;
}

export function generateBaseWorldChunk(input: { worldId: string; worldSeed: string; coordinate: WorldChunkCoordinate }): BaseWorldChunk {
  if (!input.worldId.trim() || !input.worldSeed.trim()) throw new Error("worldId and worldSeed are required");
  assertCoordinate(input.coordinate);
  const biome = biomeFor(input.worldSeed, input.coordinate);
  const snapshot = {
    worldId: input.worldId,
    worldSeedDigest: worldSeedDigest(input.worldId, input.worldSeed),
    ruleSetVersion: AURION_WORLD_CHUNK_RULESET,
    coordinate: { ...input.coordinate },
    baseRevision: WORLD_CHUNK_BASE_REVISION,
    biome,
    tiles: buildTiles(input.worldSeed, input.coordinate, biome),
    resources: buildResources(input.worldSeed, input.coordinate, biome),
  };
  return Object.freeze({ ...snapshot, deterministicHash: hashDigest(snapshot) });
}

function sameCoordinate(left: WorldChunkCoordinate, right: WorldChunkCoordinate): boolean {
  return left.x === right.x && left.z === right.z;
}

export function createWorldChunkDelta(input: Omit<WorldChunkDelta, "deterministicHash">): WorldChunkDelta {
  if (!input.id.trim() || !input.worldId.trim() || !input.targetId.trim() || !input.idempotencyKey.trim()) throw new Error("delta identity is required");
  assertCoordinate(input.coordinate);
  assertUnsigned(input.baseRevision, "baseRevision");
  assertUnsigned(input.sequence, "sequence");
  assertUnsigned(input.actorUserId, "actorUserId");
  const receipt = { ...input, coordinate: { ...input.coordinate }, payload: { ...input.payload } };
  return Object.freeze({ ...receipt, deterministicHash: hashDigest(receipt) });
}

function integerPayload(payload: Readonly<Record<string, string | number | boolean>>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`delta payload ${key} must be a safe integer`);
  return value;
}

function textPayload(payload: Readonly<Record<string, string | number | boolean>>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`delta payload ${key} must be a non-empty string`);
  return value;
}

export function materializeWorldChunk(base: BaseWorldChunk, deltas: readonly WorldChunkDelta[]): WorldChunkReadModel {
  const sorted = Array.from(deltas).sort((left, right) => left.sequence - right.sequence || compareText(left.id, right.id));
  const deltaIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const hiddenResources = new Set<string>();
  const structures = new Map<string, { id: string; assetKey: string; positionMm: { x: number; z: number } }>();
  const roads = new Map<string, { id: string; fromMm: { x: number; z: number }; toMm: { x: number; z: number } }>();

  for (const delta of sorted) {
    if (delta.worldId !== base.worldId || !sameCoordinate(delta.coordinate, base.coordinate) || delta.baseRevision !== base.baseRevision) throw new Error("delta does not belong to base chunk");
    if (deltaIds.has(delta.id) || idempotencyKeys.has(delta.idempotencyKey)) throw new Error("delta identity must be unique");
    if (hashDigest({ id: delta.id, worldId: delta.worldId, coordinate: delta.coordinate, baseRevision: delta.baseRevision, sequence: delta.sequence, kind: delta.kind, targetId: delta.targetId, actorUserId: delta.actorUserId, idempotencyKey: delta.idempotencyKey, payload: delta.payload }) !== delta.deterministicHash) throw new Error("delta hash mismatch");
    deltaIds.add(delta.id);
    idempotencyKeys.add(delta.idempotencyKey);
    if (delta.kind === "resource_depleted") {
      if (!base.resources.some(resource => resource.id === delta.targetId)) throw new Error("resource delta target is unknown");
      hiddenResources.add(delta.targetId);
    }
    if (delta.kind === "structure_placed") {
      const x = integerPayload(delta.payload, "xMm");
      const z = integerPayload(delta.payload, "zMm");
      if (x < 0 || z < 0 || x >= WORLD_CHUNK_SIZE_MM || z >= WORLD_CHUNK_SIZE_MM) throw new Error("structure position is outside chunk");
      structures.set(delta.targetId, { id: delta.targetId, assetKey: textPayload(delta.payload, "assetKey"), positionMm: { x, z } });
    }
    if (delta.kind === "structure_removed") structures.delete(delta.targetId);
    if (delta.kind === "road_built") {
      const fromX = integerPayload(delta.payload, "fromXmm");
      const fromZ = integerPayload(delta.payload, "fromZmm");
      const toX = integerPayload(delta.payload, "toXmm");
      const toZ = integerPayload(delta.payload, "toZmm");
      for (const point of [fromX, fromZ, toX, toZ]) if (point < 0 || point >= WORLD_CHUNK_SIZE_MM) throw new Error("road position is outside chunk");
      roads.set(delta.targetId, { id: delta.targetId, fromMm: { x: fromX, z: fromZ }, toMm: { x: toX, z: toZ } });
    }
  }

  const snapshot = {
    base,
    appliedDeltaIds: Array.from(deltaIds).sort(compareText),
    visibleResources: base.resources.filter(resource => !hiddenResources.has(resource.id)),
    structures: Array.from(structures.values()).sort((left, right) => compareText(left.id, right.id)),
    roads: Array.from(roads.values()).sort((left, right) => compareText(left.id, right.id)),
  };
  return Object.freeze({ ...snapshot, deterministicHash: hashDigest(snapshot) });
}
