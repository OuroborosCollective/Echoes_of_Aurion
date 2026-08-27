import { WORLD_CHUNK_COORDINATE_LIMIT, WORLD_CHUNK_GRID_SIZE, WORLD_CHUNK_SIZE_MM, type WorldChunkCoordinate } from "./worldChunkProtocol";

export const WORLD_CHUNK_STREAM_MAX_RADIUS = 2 as const;
export const WORLD_CHUNK_STREAM_PAGE_LIMIT = 32 as const;

export type WorldChunkStreamingTier = "phone" | "tablet" | "desktop";
export type WorldChunkStreamSelection = { center: WorldChunkCoordinate; tier: WorldChunkStreamingTier };

export type WorldChunkStreamingBudget = {
  tier: WorldChunkStreamingTier;
  visibleRadius: number;
  maxCachedChunks: number;
  maxVisibleChunks: number;
  maxCachedTiles: number;
  maxVisibleTiles: number;
  maxVisibleBaseResources: number;
  maxVisibleDeltaOverlays: number;
};

/** Presentation-only camera and linear-fog values. Fog ends beyond the farthest visible chunk edge. */
export type WorldChunkHorizonProfile = {
  tier: WorldChunkStreamingTier;
  cameraRadiusMeters: number;
  fogStartMeters: number;
  fogEndMeters: number;
  landmarkSilhouetteDistanceMeters: number;
};

/** A monotone local access index, never wall-clock time, drives deterministic LRU eviction. */
export type WorldChunkCacheEntry = { coordinate: WorldChunkCoordinate; lastAccess: number };

export type WorldChunkCachePlan = {
  visible: readonly WorldChunkCoordinate[];
  request: readonly WorldChunkCoordinate[];
  retain: readonly WorldChunkCoordinate[];
  evict: readonly WorldChunkCoordinate[];
};

const chunkSizeMeters = WORLD_CHUNK_SIZE_MM / 1_000;

const budgets: Readonly<Record<WorldChunkStreamingTier, WorldChunkStreamingBudget>> = Object.freeze({
  // 3×3 window: 9 chunks / 2,304 visible tiles / at most 288 32-item overlays.
  phone: Object.freeze({ tier: "phone", visibleRadius: 1, maxCachedChunks: 12, maxVisibleChunks: 9, maxCachedTiles: 3_072, maxVisibleTiles: 2_304, maxVisibleBaseResources: 72, maxVisibleDeltaOverlays: 288 }),
  // Same first-class sight range, with room for a larger retained LRU window.
  tablet: Object.freeze({ tier: "tablet", visibleRadius: 1, maxCachedChunks: 20, maxVisibleChunks: 9, maxCachedTiles: 5_120, maxVisibleTiles: 2_304, maxVisibleBaseResources: 72, maxVisibleDeltaOverlays: 288 }),
  // 5×5 window: 25 chunks / 6,400 visible tiles / at most 800 32-item overlays.
  desktop: Object.freeze({ tier: "desktop", visibleRadius: 2, maxCachedChunks: 36, maxVisibleChunks: 25, maxCachedTiles: 9_216, maxVisibleTiles: 6_400, maxVisibleBaseResources: 200, maxVisibleDeltaOverlays: 800 }),
});

const horizons: Readonly<Record<WorldChunkStreamingTier, WorldChunkHorizonProfile>> = Object.freeze({
  // All profiles retain the full stream window; fog begins only after the near interaction field.
  phone: Object.freeze({ tier: "phone", cameraRadiusMeters: 130, fogStartMeters: 92, fogEndMeters: chunkSizeMeters * 3, landmarkSilhouetteDistanceMeters: 150 }),
  tablet: Object.freeze({ tier: "tablet", cameraRadiusMeters: 150, fogStartMeters: 110, fogEndMeters: chunkSizeMeters * 3.5, landmarkSilhouetteDistanceMeters: 175 }),
  desktop: Object.freeze({ tier: "desktop", cameraRadiusMeters: 280, fogStartMeters: 176, fogEndMeters: chunkSizeMeters * 5.25, landmarkSilhouetteDistanceMeters: 300 }),
});

function assertChunkCoordinate(value: number, label: string) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > WORLD_CHUNK_COORDINATE_LIMIT) throw new Error(`${label} must be a safe in-world chunk coordinate`);
}

function compareCoordinate(left: WorldChunkCoordinate, right: WorldChunkCoordinate, center: WorldChunkCoordinate): number {
  const leftDistance = Math.abs(left.x - center.x) + Math.abs(left.z - center.z);
  const rightDistance = Math.abs(right.x - center.x) + Math.abs(right.z - center.z);
  return leftDistance - rightDistance || left.z - right.z || left.x - right.x;
}

export function worldChunkStreamingBudget(tier: WorldChunkStreamingTier): WorldChunkStreamingBudget {
  return budgets[tier];
}

export function worldChunkHorizonProfile(tier: WorldChunkStreamingTier): WorldChunkHorizonProfile {
  return horizons[tier];
}

export function worldChunkCoordinateKey(coordinate: WorldChunkCoordinate): string {
  assertChunkCoordinate(coordinate.x, "chunk x");
  assertChunkCoordinate(coordinate.z, "chunk z");
  return `${coordinate.x}:${coordinate.z}`;
}

/** Returns a center-first, stably ordered square read window. It is rendering policy only. */
export function orderedWorldChunkWindow(center: WorldChunkCoordinate, radius: number): readonly WorldChunkCoordinate[] {
  assertChunkCoordinate(center.x, "chunk x");
  assertChunkCoordinate(center.z, "chunk z");
  if (!Number.isSafeInteger(radius) || radius < 0 || radius > WORLD_CHUNK_STREAM_MAX_RADIUS) throw new Error(`stream radius must be an integer from 0 to ${WORLD_CHUNK_STREAM_MAX_RADIUS}`);
  if (Math.abs(center.x) + radius > WORLD_CHUNK_COORDINATE_LIMIT || Math.abs(center.z) + radius > WORLD_CHUNK_COORDINATE_LIMIT) throw new Error("stream window exceeds world boundary");
  const coordinates: WorldChunkCoordinate[] = [];
  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) coordinates.push({ x, z });
  }
  return Object.freeze(coordinates.sort((left, right) => compareCoordinate(left, right, center)).map(coordinate => Object.freeze(coordinate)));
}

/**
 * Produces the pure streaming/cache decision used by both the React request owner
 * and the Babylon disposer. Visible items are pinned; all retained non-visible
 * items are chosen by monotone LRU access and a coordinate tie-break.
 */
export function planWorldChunkCache(input: { center: WorldChunkCoordinate; tier: WorldChunkStreamingTier; cached: readonly WorldChunkCacheEntry[] }): WorldChunkCachePlan {
  const budget = worldChunkStreamingBudget(input.tier);
  const visible = orderedWorldChunkWindow(input.center, budget.visibleRadius);
  const visibleKeys = new Set(visible.map(worldChunkCoordinateKey));
  const byKey = new Map<string, WorldChunkCacheEntry>();
  for (const entry of input.cached) {
    assertChunkCoordinate(entry.coordinate.x, "cached chunk x");
    assertChunkCoordinate(entry.coordinate.z, "cached chunk z");
    if (!Number.isSafeInteger(entry.lastAccess) || entry.lastAccess < 0) throw new Error("cached chunk lastAccess must be a non-negative safe integer");
    const key = worldChunkCoordinateKey(entry.coordinate);
    const previous = byKey.get(key);
    if (!previous || entry.lastAccess > previous.lastAccess) byKey.set(key, Object.freeze({ coordinate: Object.freeze({ ...entry.coordinate }), lastAccess: entry.lastAccess }));
  }
  const request = visible.filter(coordinate => !byKey.has(worldChunkCoordinateKey(coordinate)));
  const retainedBackground = Array.from(byKey.values()).filter(entry => !visibleKeys.has(worldChunkCoordinateKey(entry.coordinate))).sort((left, right) => right.lastAccess - left.lastAccess || left.coordinate.z - right.coordinate.z || left.coordinate.x - right.coordinate.x).slice(0, Math.max(0, budget.maxCachedChunks - visible.length));
  const retain = Object.freeze([...visible, ...retainedBackground.map(entry => entry.coordinate)]);
  const retainKeys = new Set(retain.map(worldChunkCoordinateKey));
  const evict = Object.freeze(Array.from(byKey.values()).filter(entry => !retainKeys.has(worldChunkCoordinateKey(entry.coordinate))).sort((left, right) => left.lastAccess - right.lastAccess || left.coordinate.z - right.coordinate.z || left.coordinate.x - right.coordinate.x).map(entry => entry.coordinate));
  return Object.freeze({ visible, request: Object.freeze(request), retain, evict });
}

/** Rejects a late response for a superseded viewport; cursor pages for the current viewport still merge by immutable receipt ID. */
export function matchesWorldChunkStreamSelection(expected: WorldChunkStreamSelection, candidate: WorldChunkStreamSelection): boolean {
  return expected.tier === candidate.tier && expected.center.x === candidate.center.x && expected.center.z === candidate.center.z;
}

export function isWorldChunkStreamingTier(value: unknown): value is WorldChunkStreamingTier {
  return value === "phone" || value === "tablet" || value === "desktop";
}
