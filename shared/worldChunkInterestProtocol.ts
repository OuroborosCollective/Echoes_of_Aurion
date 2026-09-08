import type { WorldChunkCoordinate } from "./worldChunkProtocol";
import {
  orderedWorldChunkWindow,
  planWorldChunkCache,
  worldChunkCoordinateKey,
  worldChunkStreamingBudget,
  type WorldChunkCacheEntry,
  type WorldChunkStreamingTier,
} from "./worldChunkStreamingProtocol";

/**
 * AX1 presentation/streaming policy only.
 *
 * These rings choose how much visual material to keep around a confirmed world
 * coordinate. They never decide whether a chunk, NPC, collider, quest, spawn or
 * resource exists in gameplay. "Active" means "request confirmed simulation
 * evidence if gameplay needs it", never "simulate locally".
 */
export const WORLD_CHUNK_INTEREST_VERSION = "aurion-ax1-interest-rings.v1" as const;

export type WorldChunkInterestRing = "active" | "preload" | "far";
export type WorldChunkPresentationMode = "full" | "prepared" | "hlod" | "hidden";
export type WorldChunkSimulationDemand = "confirmed-active-only" | "none";

export type WorldChunkInterestBudget = Readonly<{
  tier: WorldChunkStreamingTier;
  activeRadius: 0;
  preloadRadius: number;
  farRadius: number;
}>;

export type WorldChunkInterestEntry = Readonly<{
  coordinate: WorldChunkCoordinate;
  ring: WorldChunkInterestRing;
  presentation: Exclude<WorldChunkPresentationMode, "hidden">;
  simulationDemand: WorldChunkSimulationDemand;
}>;

export type WorldChunkInterestPlan = Readonly<{
  version: typeof WORLD_CHUNK_INTEREST_VERSION;
  tier: WorldChunkStreamingTier;
  center: WorldChunkCoordinate;
  active: readonly WorldChunkInterestEntry[];
  preload: readonly WorldChunkInterestEntry[];
  far: readonly WorldChunkInterestEntry[];
  backgroundCache: readonly WorldChunkCoordinate[];
  evict: readonly WorldChunkCoordinate[];
}>;

function chebyshevDistance(left: WorldChunkCoordinate, right: WorldChunkCoordinate): number {
  worldChunkCoordinateKey(left);
  worldChunkCoordinateKey(right);
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.z - right.z));
}

export function worldChunkInterestBudget(tier: WorldChunkStreamingTier): WorldChunkInterestBudget {
  const streaming = worldChunkStreamingBudget(tier);
  const preloadRadius = Math.min(1, streaming.visibleRadius);
  return Object.freeze({ tier, activeRadius: 0, preloadRadius, farRadius: streaming.visibleRadius });
}

export function classifyWorldChunkInterest(center: WorldChunkCoordinate, coordinate: WorldChunkCoordinate, tier: WorldChunkStreamingTier): WorldChunkInterestRing | null {
  const budget = worldChunkInterestBudget(tier);
  const distance = chebyshevDistance(center, coordinate);
  if (distance > budget.farRadius) return null;
  if (distance <= budget.activeRadius) return "active";
  if (distance <= budget.preloadRadius) return "preload";
  return "far";
}

export function worldChunkPresentationMode(ring: WorldChunkInterestRing): Exclude<WorldChunkPresentationMode, "hidden"> {
  if (ring === "active") return "full";
  if (ring === "preload") return "prepared";
  return "hlod";
}

export function worldChunkSimulationDemand(ring: WorldChunkInterestRing): WorldChunkSimulationDemand {
  return ring === "active" ? "confirmed-active-only" : "none";
}

function interestEntry(center: WorldChunkCoordinate, coordinate: WorldChunkCoordinate, tier: WorldChunkStreamingTier): WorldChunkInterestEntry {
  const ring = classifyWorldChunkInterest(center, coordinate, tier);
  if (!ring) throw new Error("interest entry is outside the visible stream window");
  return Object.freeze({
    coordinate: Object.freeze({ ...coordinate }),
    ring,
    presentation: worldChunkPresentationMode(ring),
    simulationDemand: worldChunkSimulationDemand(ring),
  });
}

/**
 * Reuses the existing deterministic LRU/cache plan, then overlays explicit
 * Active/Preload/Far presentation rings. Non-visible retained chunks are hidden
 * cache only; evicted chunks are disposed by the renderer. Neither state may
 * manufacture gameplay truth.
 */
export function planWorldChunkInterest(input: {
  center: WorldChunkCoordinate;
  tier: WorldChunkStreamingTier;
  cached: readonly WorldChunkCacheEntry[];
}): WorldChunkInterestPlan {
  const budget = worldChunkInterestBudget(input.tier);
  const visible = orderedWorldChunkWindow(input.center, budget.farRadius);
  const cache = planWorldChunkCache(input);
  const visibleKeys = new Set(visible.map(worldChunkCoordinateKey));
  const entries = visible.map(coordinate => interestEntry(input.center, coordinate, input.tier));
  const backgroundCache = cache.retain.filter(coordinate => !visibleKeys.has(worldChunkCoordinateKey(coordinate))).map(coordinate => Object.freeze({ ...coordinate }));

  return Object.freeze({
    version: WORLD_CHUNK_INTEREST_VERSION,
    tier: input.tier,
    center: Object.freeze({ ...input.center }),
    active: Object.freeze(entries.filter(entry => entry.ring === "active")),
    preload: Object.freeze(entries.filter(entry => entry.ring === "preload")),
    far: Object.freeze(entries.filter(entry => entry.ring === "far")),
    backgroundCache: Object.freeze(backgroundCache),
    evict: Object.freeze(cache.evict.map(coordinate => Object.freeze({ ...coordinate }))),
  });
}
