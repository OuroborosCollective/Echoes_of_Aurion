import { describe, expect, it } from "vitest";
import { generateDeterministicTerrainChunk, terrainBoundaryHeights, verifyTerrainSeam } from "../shared/deterministicTerrainPipelineProtocol";
import { generateBaseWorldChunk } from "../shared/worldChunkProtocol";
import { AURION_RETURN_STONE_POSITION } from "../shared/aurionReturnStoneContract";

const TERRACE_REVISION = "0000000000000000000000000000000000000659";
const OLD_REVISION = "0000000000000000000000000000000000000001";
const input = (x: number, z: number, revision = TERRACE_REVISION) => ({
  worldId: "echoes-of-aurion-global",
  worldSeed: "echoes-of-aurion-v1",
  worldGenerationRevision: revision,
  coordinate: { x, z },
});

describe("Issue #659: opt-in origin city terrace and server-owned paving", () => {
  it("keeps the existing world-generation revision completely unchanged", () => {
    const old = generateDeterministicTerrainChunk(input(0, 0, OLD_REVISION));
    expect(old.tiles.some(tile => tile.heightMm !== 0)).toBe(true);
    expect(old.tiles).toEqual(generateDeterministicTerrainChunk(input(0, 0, OLD_REVISION)).tiles);
    expect(generateBaseWorldChunk(input(0, 0, OLD_REVISION)).tiles.map(t => t.heightMm))
      .toEqual(old.tiles.map(t => t.heightMm));
  });

  it("levels the actual 64-m origin chunk, keeps the Return Stone fixed, and creates both paving and vegetation", () => {
    const terrace = generateDeterministicTerrainChunk(input(0, 0));
    expect(AURION_RETURN_STONE_POSITION).toEqual({ x: 0, z: 8_000 });
    expect(terrace.tiles).toHaveLength(256);
    expect(terrace.tiles.every(tile => tile.heightMm === 0)).toBe(true);
    const paving = terrace.tiles.filter(tile => tile.material === "ruin_path");
    expect(paving.length).toBeGreaterThan(4);
    expect(paving.length).toBeLessThan(160);
    expect(terrace.tiles.filter(tile => tile.material !== "ruin_path").length).toBeGreaterThan(30);
    const base = generateBaseWorldChunk(input(0, 0));
    expect(base.tiles.map(tile => tile.heightMm)).toEqual(terrace.tiles.map(tile => tile.heightMm));
    expect(base.tiles.filter(tile => tile.surface === "ruin_path").length).toBe(paving.length);
  });

  it("blends toward untouched elevation outside the city over a fixed rim and matches neighboring chunk seams", () => {
    const center = generateDeterministicTerrainChunk(input(0, 0));
    const neighbors = [
      { coord: [1, 0] as const, side: "east" as const },
      { coord: [-1, 0] as const, side: "west" as const },
      { coord: [0, 1] as const, side: "south" as const },
      { coord: [0, -1] as const, side: "north" as const },
    ];
    for (const item of neighbors) {
      const n = generateDeterministicTerrainChunk(input(...item.coord));
      expect(verifyTerrainSeam(center, n, item.side)).toBe(true);
      const reversed = item.side === "east" ? "west" : item.side === "west" ? "east" : item.side === "north" ? "south" : "north";
      expect(terrainBoundaryHeights(center, item.side)).toEqual(terrainBoundaryHeights(n, reversed));
      expect(n.tiles.some(tile => tile.heightMm !== 0)).toBe(true);
      expect(n.maxAdjacentDeltaMm).toBeLessThanOrEqual(1800);
    }
    const far = generateDeterministicTerrainChunk(input(3, 3));
    expect(far.tiles.some(tile => tile.heightMm !== 0)).toBe(true);
    expect(far.tiles.every(tile => tile.material === (tile.water ? "water" : tile.biome === "forest" ? "forest_floor" : tile.biome === "riverland" ? "riverbank" : tile.biome === "ashland" ? "ash" : tile.biome === "highland" ? "stone" : tile.biome === "ruins" ? "ruin_path" : "grass"))).toBe(true);
  });

  it("replays both a terrain hash and a sample topology identically", () => {
    const chunks = Array.from({ length: 16 }, () => generateDeterministicTerrainChunk(input(1, 1)));
    expect(new Set(chunks.map(c => c.terrainHash)).size).toBe(1);
    expect(chunks[0]).toEqual(chunks.at(-1));
  });
});
