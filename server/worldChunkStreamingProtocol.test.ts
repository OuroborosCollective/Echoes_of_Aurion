import { describe, expect, it } from "vitest";
import {
  WORLD_CHUNK_STREAM_PAGE_LIMIT,
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

  it("rejects unsafe radii and windows crossing the canonical world boundary", () => {
    expect(() => orderedWorldChunkWindow({ x: 0, z: 0 }, 3)).toThrow("radius");
    expect(() => orderedWorldChunkWindow({ x: 1_000_000, z: 0 }, 1)).toThrow("boundary");
    expect(() => worldChunkCoordinateKey({ x: 1_000_001, z: 0 })).toThrow("in-world");
  });
});
