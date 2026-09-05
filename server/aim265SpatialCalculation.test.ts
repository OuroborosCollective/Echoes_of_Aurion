import { describe, expect, it } from "vitest";
import { generateBaseWorldChunk, isBaseChunkRoadTile, splitWorldChunkPositionMm, WORLD_CHUNK_SIZE_MM } from "../shared/worldChunkProtocol";

describe("AIM-265 exact spatial calculations", () => {
  it("reconstructs positive and negative centered chunk positions at every boundary", () => {
    for (const chunk of [-1_000_000, -2, -1, 0, 1, 2, 1_000_000]) {
      for (const local of [0, 1, 31_999, 32_000, 63_998, 63_999]) {
        const value = chunk * 64_000 + local - 32_000;
        const actual = splitWorldChunkPositionMm({ x: value, z: value });
        expect(actual).toEqual({ coordinate: { x: chunk, z: chunk }, localPositionMm: { x: local, z: local } });
      }
    }
    expect(splitWorldChunkPositionMm({ x: -32_001, z: -32_000 })).toEqual({ coordinate: { x: -1, z: 0 }, localPositionMm: { x: 63_999, z: 0 } });
    for (const value of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => splitWorldChunkPositionMm({ x: value, z: 0 })).toThrow();
    }
  });

  it("keeps generated road cells connected and joins all four neighboring chunk edges", () => {
    const tileSize = WORLD_CHUNK_SIZE_MM / 16;
    const roadCells = new Set<string>();
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) {
      const chunk = generateBaseWorldChunk({ worldId: "spatial-test", worldSeed: "aurion-road-proof", coordinate: { x: cx, z: cz } });
      const roads = chunk.tiles.filter(isBaseChunkRoadTile);
      expect(roads).toHaveLength(31);
      for (const tile of roads) roadCells.add(`${cx * 16 + tile.x}:${cz * 16 + tile.z}`);
      for (const resource of chunk.resources) {
        expect(resource.positionMm.x).toBeGreaterThanOrEqual(tileSize);
        expect(resource.positionMm.x).toBeLessThan(WORLD_CHUNK_SIZE_MM - tileSize);
        expect(resource.positionMm.z).toBeGreaterThanOrEqual(tileSize);
        expect(resource.positionMm.z).toBeLessThan(WORLD_CHUNK_SIZE_MM - tileSize);
      }
    }
    const reached = new Set<string>();
    const queue = [[...roadCells][0]!];
    for (let index = 0; index < queue.length; index++) {
      const key = queue[index]!;
      if (reached.has(key)) continue;
      reached.add(key);
      const [x, z] = key.split(":").map(Number);
      for (const neighbor of [`${x! - 1}:${z}`, `${x! + 1}:${z}`, `${x}:${z! - 1}`, `${x}:${z! + 1}`]) {
        if (roadCells.has(neighbor) && !reached.has(neighbor)) queue.push(neighbor);
      }
    }
    expect(reached.size).toBe(31 * 9);
  });
});
