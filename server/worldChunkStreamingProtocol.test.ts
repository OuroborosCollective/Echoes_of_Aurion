import { describe, expect, it } from "vitest";
import {
  WORLD_CHUNK_STREAM_PAGE_LIMIT,
  type WorldChunkCacheEntry,
  type WorldChunkCachePlan,
  type WorldChunkStreamingTier,
  matchesWorldChunkStreamSelection,
  planWorldChunkCache,
  orderedWorldChunkWindow,
  worldChunkCoordinateKey,
  worldChunkHorizonProfile,
  worldChunkStreamingBudget,
} from "../shared/worldChunkStreamingProtocol";

function referencePlanWorldChunkCache(input: { center: { x: number; z: number }; tier: WorldChunkStreamingTier; cached: readonly WorldChunkCacheEntry[] }): WorldChunkCachePlan {
  const budget = worldChunkStreamingBudget(input.tier);
  const visible = orderedWorldChunkWindow(input.center, budget.visibleRadius);
  const visibleKeys = new Set(visible.map(worldChunkCoordinateKey));
  const byKey = new Map<string, WorldChunkCacheEntry>();
  for (const entry of input.cached) {
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

function seededCacheEntries(seed: number, count: number): WorldChunkCacheEntry[] {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  return Array.from({ length: count }, (_, index) => ({
    coordinate: { x: (next() % 17) - 8, z: (next() % 17) - 8 },
    lastAccess: index % 5 === 0 ? 7 : next() % 32,
  }));
}

describe("worldChunkStreamingProtocol", () => {
  it("returns a stable center-first 3×3 window for mobile tiers", () => {
    const first = orderedWorldChunkWindow({ x: 4, z: -3 }, 1);
    expect(first).toHaveLength(9);
    expect(first[0]).toEqual({ x: 4, z: -3 });
    expect(first.map(worldChunkCoordinateKey)).toEqual([
      "4:-3", "4:-4", "3:-3", "5:-3", "4:-2", "3:-4", "5:-4", "3:-2", "5:-2",
    ]);
    expect(orderedWorldChunkWindow({ x: 4, z: -3 }, 1)).toEqual(first);
  });

  it("keeps tier budgets bounded by the square windows and page policy", () => {
    expect(worldChunkStreamingBudget("phone")).toMatchObject({ visibleRadius: 1, maxVisibleChunks: 9, maxCachedChunks: 12, maxVisibleTiles: 2_304, maxVisibleDeltaOverlays: 9 * WORLD_CHUNK_STREAM_PAGE_LIMIT });
    expect(worldChunkStreamingBudget("tablet")).toMatchObject({ visibleRadius: 1, maxVisibleChunks: 9, maxCachedChunks: 20, maxVisibleTiles: 2_304 });
    expect(worldChunkStreamingBudget("desktop")).toMatchObject({ visibleRadius: 2, maxVisibleChunks: 25, maxCachedChunks: 36, maxVisibleTiles: 6_400, maxVisibleDeltaOverlays: 25 * WORLD_CHUNK_STREAM_PAGE_LIMIT });
  });

  it("keeps the full stream window visible while applying deterministic horizon profiles", () => {
    expect(worldChunkHorizonProfile("phone")).toEqual({ tier: "phone", cameraRadiusMeters: 130, fogStartMeters: 92, fogEndMeters: 192, landmarkSilhouetteDistanceMeters: 150 });
    expect(worldChunkHorizonProfile("tablet")).toEqual({ tier: "tablet", cameraRadiusMeters: 150, fogStartMeters: 110, fogEndMeters: 224, landmarkSilhouetteDistanceMeters: 175 });
    expect(worldChunkHorizonProfile("desktop")).toEqual({ tier: "desktop", cameraRadiusMeters: 220, fogStartMeters: 176, fogEndMeters: 336, landmarkSilhouetteDistanceMeters: 300 });
    (["phone", "tablet", "desktop"] as const).forEach(tier => {
      const budget = worldChunkStreamingBudget(tier);
      const horizon = worldChunkHorizonProfile(tier);
      expect(horizon.fogStartMeters).toBeLessThan(horizon.fogEndMeters);
      expect(horizon.fogEndMeters).toBeGreaterThan((budget.visibleRadius + 1) * 64);
      expect(horizon.landmarkSilhouetteDistanceMeters).toBeLessThanOrEqual(horizon.fogEndMeters);
    });
  });

  it("pins the visible window, requests missing chunks center-first and evicts only the least-recent background chunks", () => {
    const initial = planWorldChunkCache({ center: { x: 4, z: -3 }, tier: "phone", cached: [{ coordinate: { x: 4, z: -3 }, lastAccess: 8 }, { coordinate: { x: 12, z: 12 }, lastAccess: 3 }, { coordinate: { x: 13, z: 12 }, lastAccess: 1 }] });
    expect(initial.visible.map(worldChunkCoordinateKey)).toEqual(["4:-3", "4:-4", "3:-3", "5:-3", "4:-2", "3:-4", "5:-4", "3:-2", "5:-2"]);
    expect(initial.request.map(worldChunkCoordinateKey)).toEqual(["4:-4", "3:-3", "5:-3", "4:-2", "3:-4", "5:-4", "3:-2", "5:-2"]);
    expect(initial.retain.map(worldChunkCoordinateKey)).toEqual(expect.arrayContaining(["4:-3", "12:12", "13:12"]));
    expect(initial.evict).toEqual([]);

    const overflow = planWorldChunkCache({ center: { x: 0, z: 0 }, tier: "phone", cached: Array.from({ length: 14 }, (_, index) => ({ coordinate: { x: 50 + index, z: 0 }, lastAccess: index })) });
    expect(overflow.retain).toHaveLength(12);
    expect(overflow.evict.map(worldChunkCoordinateKey)).toEqual(["50:0", "51:0", "52:0", "53:0", "54:0", "55:0", "56:0", "57:0", "58:0", "59:0", "60:0"]);
  });

  it("matches the allocation-heavy reference for ties, duplicates, visible pins and budget overflow without mutating input", () => {
    const tiers: readonly WorldChunkStreamingTier[] = ["phone", "tablet", "desktop"];
    for (let seed = 1; seed <= 128; seed += 1) {
      const input = {
        center: { x: (seed % 7) - 3, z: ((seed * 3) % 7) - 3 },
        tier: tiers[seed % tiers.length]!,
        cached: seededCacheEntries(seed, 48 + (seed % 37)),
      };
      const before = structuredClone(input);
      expect(planWorldChunkCache(input)).toEqual(referencePlanWorldChunkCache(input));
      expect(input).toEqual(before);
    }
  });

  it("accepts only a response matching the latest viewport selection", () => {
    const current = { center: { x: 7, z: -4 }, tier: "tablet" as const };
    expect(matchesWorldChunkStreamSelection(current, { center: { x: 7, z: -4 }, tier: "tablet" })).toBe(true);
    expect(matchesWorldChunkStreamSelection(current, { center: { x: 6, z: -4 }, tier: "tablet" })).toBe(false);
    expect(matchesWorldChunkStreamSelection(current, { center: { x: 7, z: -4 }, tier: "desktop" })).toBe(false);
  });

  it("rejects unsafe radii and windows crossing the canonical world boundary", () => {
    expect(() => orderedWorldChunkWindow({ x: 0, z: 0 }, 3)).toThrow("radius");
    expect(() => orderedWorldChunkWindow({ x: 1_000_000, z: 0 }, 1)).toThrow("boundary");
    expect(() => worldChunkCoordinateKey({ x: 1_000_001, z: 0 })).toThrow("in-world");
  });
});
