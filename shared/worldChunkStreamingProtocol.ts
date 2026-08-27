import { WORLD_CHUNK_COORDINATE_LIMIT, WORLD_CHUNK_GRID_SIZE, type WorldChunkCoordinate } from "./worldChunkProtocol";

export const WORLD_CHUNK_STREAM_MAX_RADIUS = 2 as const;
export const WORLD_CHUNK_STREAM_PAGE_LIMIT = 32 as const;

export type WorldChunkStreamingTier = "phone" | "tablet" | "desktop";

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

const budgets: Readonly<Record<WorldChunkStreamingTier, WorldChunkStreamingBudget>> = Object.freeze({
  // 3×3 window: 9 chunks / 2,304 visible tiles / at most 288 32-item overlays.
  phone: Object.freeze({ tier: "phone", visibleRadius: 1, maxCachedChunks: 12, maxVisibleChunks: 9, maxCachedTiles: 3_072, maxVisibleTiles: 2_304, maxVisibleBaseResources: 72, maxVisibleDeltaOverlays: 288 }),
  // Same first-class sight range, with room for a larger retained LRU window.
  tablet: Object.freeze({ tier: "tablet", visibleRadius: 1, maxCachedChunks: 20, maxVisibleChunks: 9, maxCachedTiles: 5_120, maxVisibleTiles: 2_304, maxVisibleBaseResources: 72, maxVisibleDeltaOverlays: 288 }),
  // 5×5 window: 25 chunks / 6,400 visible tiles / at most 800 32-item overlays.
  desktop: Object.freeze({ tier: "desktop", visibleRadius: 2, maxCachedChunks: 36, maxVisibleChunks: 25, maxCachedTiles: 9_216, maxVisibleTiles: 6_400, maxVisibleBaseResources: 200, maxVisibleDeltaOverlays: 800 }),
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

export function isWorldChunkStreamingTier(value: unknown): value is WorldChunkStreamingTier {
  return value === "phone" || value === "tablet" || value === "desktop";
}
