import { describe, expect, it } from "vitest";
import {
  WORLD_CHUNK_STREAM_PAGE_LIMIT,
  planWorldChunkCache,
  orderedWorldChunkWindow,
  worldChunkCoordinateKey,
  worldChunkStreamingBudget,
} from "../shared/worldChunkStreamingProtocol";

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

  it("rejects unsafe radii and windows crossing the canonical world boundary", () => {
    expect(() => orderedWorldChunkWindow({ x: 0, z: 0 }, 3)).toThrow("radius");
    expect(() => orderedWorldChunkWindow({ x: 1_000_000, z: 0 }, 1)).toThrow("boundary");
    expect(() => worldChunkCoordinateKey({ x: 1_000_001, z: 0 })).toThrow("in-world");
  });
});
