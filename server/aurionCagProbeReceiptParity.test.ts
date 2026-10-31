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
  ["echoes-of-aurion-v1", -93, 48, false, "242e084c94e91bf7a075b640aff0ebef9ae03da2a0c99b7d06295eab9fcb1469"],
  ["echoes-of-aurion-v1", -93, 48, true, "242e084c94e91bf7a075b640aff0ebef9ae03da2a0c99b7d06295eab9fcb1469"],
  ["echoes-of-aurion-v1", 0, 0, false, "fcd8eda6d453cd148d93f6e79ebc710b41293db0e0b8e933a0260dba1073adb9"],
  ["echoes-of-aurion-v1", 0, 0, true, "fcd8eda6d453cd148d93f6e79ebc710b41293db0e0b8e933a0260dba1073adb9"],
  ["aurion-probe-regression", -1, -2, false, "3908e98a6bf7c18f7935dab72c503e40c1dcdbb271a3403b5d53949d806977cb"],
  ["aurion-probe-regression", -1, -2, true, "3908e98a6bf7c18f7935dab72c503e40c1dcdbb271a3403b5d53949d806977cb"],
  ["aurion-probe-regression", 105, -37, false, "2a65a040029a4bafa329f0a635e2bb778e580e807336eb8fcf6a3d7442265ebd"],
  ["aurion-probe-regression", 105, -37, true, "2a65a040029a4bafa329f0a635e2bb778e580e807336eb8fcf6a3d7442265ebd"],
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

    const order = ["grass", "riverbank", "stone", "forest_floor", "ash", "ruin_path"] as const;
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
