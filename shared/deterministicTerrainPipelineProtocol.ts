import type {
  ChunkBiome,
  ChunkSurface,
  WorldChunkCoordinate,
} from "./worldChunkProtocol";

const TERRAIN_CHUNK_SIZE_MM = 64_000;
const TERRAIN_GRID_SIZE = 16;
const TERRAIN_COORDINATE_LIMIT = 1_000_000;

export const AURION_DETERMINISTIC_TERRAIN_PROTOCOL =
  "aurion.deterministic-terrain.v1" as const;
export const TERRAIN_GENERATOR_VERSION = "aurion.terrain-generator.v1" as const;
export const TERRAIN_SAMPLE_RESOLUTION_DENOMINATOR = TERRAIN_GRID_SIZE - 1;
export const TERRAIN_MAX_ADJACENT_DELTA_MM = 1_800;
export const TERRAIN_MAX_SLOPE_BPS = 4_219;
export const TERRAIN_MIN_WALKABLE_TILES = 32;
export const TERRAIN_MAX_HEIGHT_MM = 900;
export const TERRAIN_MIN_HEIGHT_MM = -900;

const REVISION = /^[a-f0-9]{40}$/;

export type TerrainMaterial = ChunkSurface | "water";

export type DeterministicTerrainTile = Readonly<{
  x: number;
  z: number;
  heightMm: number;
  material: TerrainMaterial;
  biome: ChunkBiome;
  water: boolean;
  slopeBps: number;
}>;

export type DeterministicTerrainChunkInput = Readonly<{
  worldId: string;
  worldSeed: string;
  worldGenerationRevision: string;
  coordinate: WorldChunkCoordinate;
}>;

export type DeterministicTerrainChunk = Readonly<{
  protocol: typeof AURION_DETERMINISTIC_TERRAIN_PROTOCOL;
  generatorVersion: typeof TERRAIN_GENERATOR_VERSION;
  worldId: string;
  coordinate: WorldChunkCoordinate;
  worldGenerationRevision: string;
  sampleResolution: Readonly<{
    numeratorMm: typeof TERRAIN_CHUNK_SIZE_MM;
    denominator: typeof TERRAIN_SAMPLE_RESOLUTION_DENOMINATOR;
  }>;
  tiles: readonly DeterministicTerrainTile[];
  biome: ChunkBiome;
  minHeightMm: number;
  maxHeightMm: number;
  maxAdjacentDeltaMm: number;
  maxSlopeBps: number;
  walkableTileCount: number;
  waterTileCount: number;
  terrainHash: string;
}>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCoordinate(coordinate: WorldChunkCoordinate): void {
  if (
    !Number.isSafeInteger(coordinate.x) ||
    !Number.isSafeInteger(coordinate.z) ||
    Math.abs(coordinate.x) > TERRAIN_COORDINATE_LIMIT ||
    Math.abs(coordinate.z) > TERRAIN_COORDINATE_LIMIT
  ) {
    throw new Error("TERRAIN_CHUNK_COORDINATE_INVALID");
  }
}

function assertInput(input: DeterministicTerrainChunkInput): void {
  if (!input.worldId.trim()) throw new Error("TERRAIN_WORLD_ID_REQUIRED");
  if (!input.worldSeed.trim()) throw new Error("TERRAIN_WORLD_SEED_REQUIRED");
  if (!REVISION.test(input.worldGenerationRevision)) {
    throw new Error("TERRAIN_GENERATION_REVISION_INVALID");
  }
  assertCoordinate(input.coordinate);
}

function hash32(...parts: readonly string[]): number {
  let value = 2_166_136_261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      value ^= part.charCodeAt(index);
      value = Math.imul(value, 16_777_619);
    }
    value ^= 1_249;
    value = Math.imul(value, 16_777_619);
  }
  return value >>> 0;
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareText)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function terrainHashValue(value: unknown): string {
  return `terrain-fnv1a-${hash32(
    "aurion.deterministic-terrain.v1",
    stableStringify(value)
  )
    .toString(16)
    .padStart(8, "0")}`;
}

function globalSampleCoordinate(
  coordinate: WorldChunkCoordinate,
  x: number,
  z: number
): {
  x: number;
  z: number;
} {
  return {
    x: coordinate.x * TERRAIN_SAMPLE_RESOLUTION_DENOMINATOR + x,
    z: coordinate.z * TERRAIN_SAMPLE_RESOLUTION_DENOMINATOR + z,
  };
}

function heightAt(
  input: DeterministicTerrainChunkInput,
  sample: Readonly<{ x: number; z: number }>
): number {
  const base =
    (hash32(
      input.worldSeed,
      input.worldGenerationRevision,
      "terrain-height-base",
      String(sample.x),
      String(sample.z)
    ) %
      1_201) -
    600;
  const regional =
    (hash32(
      input.worldSeed,
      input.worldGenerationRevision,
      "terrain-height-regional",
      String(floorDiv(sample.x, 4)),
      String(floorDiv(sample.z, 4))
    ) %
      601) -
    300;
  return base + regional;
}

function biomeAt(
  input: DeterministicTerrainChunkInput,
  sample: Readonly<{ x: number; z: number }>,
  heightMm: number
): ChunkBiome {
  if (heightMm <= -500) return "riverland";
  const climate =
    hash32(
      input.worldSeed,
      input.worldGenerationRevision,
      "terrain-climate",
      String(floorDiv(sample.x, 8)),
      String(floorDiv(sample.z, 8))
    ) % 5;
  return (["forest", "plains", "highland", "ashland", "ruins"] as const)[
    climate
  ]!;
}

function surfaceFor(biome: ChunkBiome, water: boolean): TerrainMaterial {
  if (water) return "water";
  if (biome === "forest") return "forest_floor";
  if (biome === "riverland") return "riverbank";
  if (biome === "ashland") return "ash";
  if (biome === "highland") return "stone";
  if (biome === "ruins") return "ruin_path";
  return "grass";
}

function heightAtTile(
  input: DeterministicTerrainChunkInput,
  coordinate: WorldChunkCoordinate,
  x: number,
  z: number
): number {
  return heightAt(input, globalSampleCoordinate(coordinate, x, z));
}

function maxAdjacentDelta(
  heights: readonly number[],
  x: number,
  z: number
): number {
  const current = heights[z * TERRAIN_GRID_SIZE + x]!;
  const adjacent: number[] = [];
  if (x > 0) adjacent.push(heights[z * TERRAIN_GRID_SIZE + x - 1]!);
  if (x + 1 < TERRAIN_GRID_SIZE) {
    adjacent.push(heights[z * TERRAIN_GRID_SIZE + x + 1]!);
  }
  if (z > 0) adjacent.push(heights[(z - 1) * TERRAIN_GRID_SIZE + x]!);
  if (z + 1 < TERRAIN_GRID_SIZE) {
    adjacent.push(heights[(z + 1) * TERRAIN_GRID_SIZE + x]!);
  }
  return Math.max(...adjacent.map(value => Math.abs(current - value)), 0);
}

function slopeBps(deltaMm: number): number {
  return Math.ceil(
    (deltaMm * TERRAIN_SAMPLE_RESOLUTION_DENOMINATOR * 10_000) /
      TERRAIN_CHUNK_SIZE_MM
  );
}

function canonicalBoundary(
  chunk: DeterministicTerrainChunk,
  side: "north" | "south" | "west" | "east"
): readonly number[] {
  const edge = chunk.tiles.filter(tile =>
    side === "north"
      ? tile.z === 0
      : side === "south"
        ? tile.z === TERRAIN_GRID_SIZE - 1
        : side === "west"
          ? tile.x === 0
          : tile.x === TERRAIN_GRID_SIZE - 1
  );
  return Object.freeze(
    edge
      .sort((left, right) =>
        side === "north" || side === "south"
          ? left.x - right.x
          : left.z - right.z
      )
      .map(tile => tile.heightMm)
  );
}

export function terrainBoundaryHeights(
  chunk: DeterministicTerrainChunk,
  side: "north" | "south" | "west" | "east"
): readonly number[] {
  return canonicalBoundary(chunk, side);
}

export function verifyTerrainSeam(
  left: DeterministicTerrainChunk,
  right: DeterministicTerrainChunk,
  direction: "north" | "south" | "west" | "east"
): boolean {
  const opposite =
    direction === "north"
      ? "south"
      : direction === "south"
        ? "north"
        : direction === "west"
          ? "east"
          : "west";
  const expectedCoordinate =
    direction === "north"
      ? { x: left.coordinate.x, z: left.coordinate.z - 1 }
      : direction === "south"
        ? { x: left.coordinate.x, z: left.coordinate.z + 1 }
        : direction === "west"
          ? { x: left.coordinate.x - 1, z: left.coordinate.z }
          : { x: left.coordinate.x + 1, z: left.coordinate.z };
  if (
    right.coordinate.x !== expectedCoordinate.x ||
    right.coordinate.z !== expectedCoordinate.z
  ) {
    return false;
  }
  const leftBoundary = canonicalBoundary(left, direction);
  const rightBoundary = canonicalBoundary(right, opposite);
  return (
    leftBoundary.length === rightBoundary.length &&
    leftBoundary.every((value, index) => value === rightBoundary[index])
  );
}

export function generateDeterministicTerrainChunk(
  input: DeterministicTerrainChunkInput
): DeterministicTerrainChunk {
  assertInput(input);
  const heights: number[] = [];
  for (let z = 0; z < TERRAIN_GRID_SIZE; z += 1) {
    for (let x = 0; x < TERRAIN_GRID_SIZE; x += 1) {
      heights.push(heightAtTile(input, input.coordinate, x, z));
    }
  }
  const rawTiles = heights.map((heightMm, index) => {
    const x = index % TERRAIN_GRID_SIZE;
    const z = Math.floor(index / TERRAIN_GRID_SIZE);
    const sample = globalSampleCoordinate(input.coordinate, x, z);
    const biome = biomeAt(input, sample, heightMm);
    const water = biome === "riverland";
    const delta = maxAdjacentDelta(heights, x, z);
    return Object.freeze({
      x,
      z,
      heightMm,
      material: surfaceFor(biome, water),
      biome,
      water,
      slopeBps: slopeBps(delta),
    });
  });
  const tiles = Object.freeze(rawTiles);
  const minHeightMm = Math.min(...heights);
  const maxHeightMm = Math.max(...heights);
  let maxAdjacentDeltaMm = 0;
  for (let z = 0; z < TERRAIN_GRID_SIZE; z += 1) {
    for (let x = 0; x < TERRAIN_GRID_SIZE; x += 1) {
      maxAdjacentDeltaMm = Math.max(
        maxAdjacentDeltaMm,
        maxAdjacentDelta(heights, x, z)
      );
    }
  }
  const maxSlopeBps = slopeBps(maxAdjacentDeltaMm);
  if (
    minHeightMm < TERRAIN_MIN_HEIGHT_MM ||
    maxHeightMm > TERRAIN_MAX_HEIGHT_MM ||
    maxAdjacentDeltaMm > TERRAIN_MAX_ADJACENT_DELTA_MM ||
    maxSlopeBps > TERRAIN_MAX_SLOPE_BPS
  ) {
    throw new Error("TERRAIN_GEOMETRY_CONSTRAINT_VIOLATION");
  }
  const waterTileCount = tiles.filter(tile => tile.water).length;
  const walkableTileCount = tiles.length - waterTileCount;
  if (walkableTileCount < TERRAIN_MIN_WALKABLE_TILES) {
    throw new Error("TERRAIN_WALKABLE_AREA_INSUFFICIENT");
  }
  const biomeCounts = new Map<ChunkBiome, number>();
  for (const tile of tiles) {
    biomeCounts.set(tile.biome, (biomeCounts.get(tile.biome) ?? 0) + 1);
  }
  const biome = [...biomeCounts.entries()].sort(
    (left, right) => right[1] - left[1] || compareText(left[0], right[0])
  )[0]![0];
  const withoutHash = {
    protocol: AURION_DETERMINISTIC_TERRAIN_PROTOCOL,
    generatorVersion: TERRAIN_GENERATOR_VERSION,
    worldId: input.worldId,
    coordinate: { ...input.coordinate },
    worldGenerationRevision: input.worldGenerationRevision,
    sampleResolution: {
      numeratorMm: TERRAIN_CHUNK_SIZE_MM,
      denominator: TERRAIN_SAMPLE_RESOLUTION_DENOMINATOR,
    },
    tiles,
    biome,
    minHeightMm,
    maxHeightMm,
    maxAdjacentDeltaMm,
    maxSlopeBps,
    walkableTileCount,
    waterTileCount,
  } as const;
  return Object.freeze({
    ...withoutHash,
    terrainHash: terrainHashValue(withoutHash),
  });
}
