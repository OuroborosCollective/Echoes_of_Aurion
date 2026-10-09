import { describe, expect, it } from "vitest";
import { generateBaseWorldChunk, type BaseWorldChunk } from "../shared/worldChunkProtocol";
import { buildTerrainTexturizationCagProbe, buildWorldChunkTerrainContinuityCagProbe,
  summarizeWorldChunkTerrainContinuity, summarizeWorldChunkTexturization } from "../shared/aurionCagDesignProtocol";

const base = () => generateBaseWorldChunk({ worldId: "echoes-of-aurion-global", worldSeed: "review-815-824", coordinate: { x: 0, z: 0 } });
function grid(height: (x: number, z: number) => number, checker = false): BaseWorldChunk {
  const chunk = base();
  return { ...chunk, tiles: chunk.tiles.map(tile => ({ ...tile, heightMm: height(tile.x, tile.z),
    surface: checker && (tile.x + tile.z) % 2 ? "stone" as const : "grass" as const })) };
}

describe("reviewed terrain design probes", () => {
  it("computes exact sample variance and all 480 neighbor edges independently of tile order", () => {
    const chunk = grid((x, z) => x + 16 * z, true);
    const before = JSON.stringify(chunk);
    expect(summarizeWorldChunkTerrainContinuity(chunk)).toEqual({ varianceMm2: 5483, surfaceTransitions: 480 });
    expect(buildWorldChunkTerrainContinuityCagProbe(chunk).expectedExact).toBe("{5483,480}");
    expect(buildWorldChunkTerrainContinuityCagProbe({ ...chunk, tiles: [...chunk.tiles].reverse() }))
      .toEqual(buildWorldChunkTerrainContinuityCagProbe(chunk));
    expect(summarizeWorldChunkTexturization(chunk)).toMatchObject({ grassTiles: 128, stoneTiles: 128, riverbankTiles: 0, totalTiles: 256 });
    expect(JSON.stringify(chunk)).toBe(before);
  });
  it("avoids floating cancellation at safe-integer heights and rejects unrepresentable variance", () => {
    const offset = Number.MAX_SAFE_INTEGER - 32;
    expect(summarizeWorldChunkTerrainContinuity(grid((x,z) => offset + (x === 0 && z === 0 ? 16 : 0))))
      .toEqual({ varianceMm2: 1, surfaceTransitions: 0 });
    expect(summarizeWorldChunkTerrainContinuity(grid(() => -17))).toEqual({ varianceMm2: 0, surfaceTransitions: 0 });
    expect(() => summarizeWorldChunkTerrainContinuity(grid(x => x % 2 ? Number.MAX_SAFE_INTEGER : 0)))
      .toThrow("safe integer");
  });
  it("rejects incomplete, duplicate and unknown surfaces instead of certifying invalid chunks", () => {
    const chunk = base();
    const invalid = [
      { ...chunk, tiles: chunk.tiles.slice(1) },
      { ...chunk, tiles: chunk.tiles.map((tile, index) => index === 1 ? chunk.tiles[0] : tile) },
      { ...chunk, tiles: chunk.tiles.map((tile, index) => index === 0 ? { ...tile, surface: "unknown" } : tile) },
    ] as BaseWorldChunk[];
    for (const bad of invalid) {
      expect(() => buildTerrainTexturizationCagProbe(bad)).toThrow();
      expect(() => buildWorldChunkTerrainContinuityCagProbe(bad)).toThrow();
    }
  });
});
