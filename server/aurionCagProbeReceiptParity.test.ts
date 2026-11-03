import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildTerrainTexturizationCagProbe,
  buildWorldChunkTerrainCagProbe,
  buildWorldChunkTerrainContinuityCagProbe,
} from "../shared/aurionCagDesignProtocol";
import { generateBaseWorldChunk } from "../shared/worldChunkProtocol";

// Canonical tile-order goldens derived from main 76afd81bac8432c3a6e7a18177cac0cbf24c94c4
// and independently observed in exact-head CI run 41221036507/1.
// Reordering tiles is now deliberately byte-stable; retain all complete probe hashes.
// Historical reversed-input hashes varied with array order and are not canonical receipts.
const cases = [
  ["echoes-of-aurion-v1", -93, 48, false, "3ddfbceed90ca4ac119c779d35978dc1be43acae3a9f521b16abbe37b1b020ad"],
  ["echoes-of-aurion-v1", -93, 48, true, "3ddfbceed90ca4ac119c779d35978dc1be43acae3a9f521b16abbe37b1b020ad"],
  ["echoes-of-aurion-v1", 0, 0, false, "d3d4497811a16e4aaf070cac6ffac1bc91957b3afa78f19b1573a6e89cc7afc8"],
  ["echoes-of-aurion-v1", 0, 0, true, "d3d4497811a16e4aaf070cac6ffac1bc91957b3afa78f19b1573a6e89cc7afc8"],
  ["aurion-probe-regression", -1, -2, false, "4f0dbd0dc51d2653740541b93e17cf8dd5d8eed37761eedbc9a4bc893ddd0359"],
  ["aurion-probe-regression", -1, -2, true, "4f0dbd0dc51d2653740541b93e17cf8dd5d8eed37761eedbc9a4bc893ddd0359"],
  ["aurion-probe-regression", 105, -37, false, "924f2f80b773abe269dd42493d87ab8b372d031bca17e715be911dfa146a5605"],
  ["aurion-probe-regression", 105, -37, true, "924f2f80b773abe269dd42493d87ab8b372d031bca17e715be911dfa146a5605"],
] as const;

describe("CAG terrain probe receipt parity", () => {
  it("preserves semantic texture-bin counts independently of chunk tile array order", () => {
    const chunk = generateBaseWorldChunk({
      worldId: "echoes-of-aurion-global",
      worldSeed: "echoes-of-aurion-v1",
      coordinate: { x: -93, z: 48 },
    });
    const shifted = {
      ...chunk,
      tiles: [...chunk.tiles.slice(73), ...chunk.tiles.slice(0, 73)].reverse(),
    };
    const canonical = buildTerrainTexturizationCagProbe(chunk);
    const reordered = buildTerrainTexturizationCagProbe(shifted);
    expect(reordered).toEqual(canonical);

    const encodedSurfaces = reordered.code.split("surfaces={")[1]?.split("};")[0];
    expect(encodedSurfaces).toBeDefined();
    const codes = encodedSurfaces!.split(",").map(Number);
    expect(codes).toHaveLength(chunk.tiles.length);

    const order = ["grass", "forest_floor", "riverbank", "stone", "ash", "ruin_path"] as const;
    const expectedBins = order.map(surface => chunk.tiles.filter(tile => tile.surface === surface).length);
    const observedBins = order.map((_, index) => codes.filter(code => code === index + 1).length);
    expect(observedBins).toEqual(expectedBins);
    expect(reordered.expectedExact).toBe(`{${chunk.tiles.length},${expectedBins.join(",")}}`);
  });

  it.each(cases)("preserves canonical probe bytes for seed %s at (%i,%i), reversed=%s", (worldSeed, x, z, reversed, expected) => {
    const chunk = generateBaseWorldChunk({ worldId: "echoes-of-aurion-global", worldSeed, coordinate: { x, z } });
    const input = reversed ? { ...chunk, tiles: [...chunk.tiles].reverse() } : chunk;
    const probes = [
      buildWorldChunkTerrainCagProbe(input),
      buildWorldChunkTerrainContinuityCagProbe(input),
      buildTerrainTexturizationCagProbe(input),
    ];
    expect(createHash("sha256").update(JSON.stringify(probes)).digest("hex")).toBe(expected);
  });
});
