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
  ["echoes-of-aurion-v1", -93, 48, false, "524033515a177c0bb5abf2722f658f012a4646ec12f8bc9ca8e0d74452a5e561"],
  ["echoes-of-aurion-v1", -93, 48, true, "524033515a177c0bb5abf2722f658f012a4646ec12f8bc9ca8e0d74452a5e561"],
  ["echoes-of-aurion-v1", 0, 0, false, "63b3555660f1192f4fed20f245fa8f0324a59babcc54dd4700c2674c749d57b4"],
  ["echoes-of-aurion-v1", 0, 0, true, "63b3555660f1192f4fed20f245fa8f0324a59babcc54dd4700c2674c749d57b4"],
  ["aurion-probe-regression", -1, -2, false, "56fac0a78feb0a9d9e8353be134f7e4787e13e4929b56a2da4b1eeed4bf6fe2a"],
  ["aurion-probe-regression", -1, -2, true, "56fac0a78feb0a9d9e8353be134f7e4787e13e4929b56a2da4b1eeed4bf6fe2a"],
  ["aurion-probe-regression", 105, -37, false, "cfe6387367043137836b54af28821a01f44f1643b0f64c2cc06dac625dded9d9"],
  ["aurion-probe-regression", 105, -37, true, "cfe6387367043137836b54af28821a01f44f1643b0f64c2cc06dac625dded9d9"],
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
    const codes = encodedSurfaces!.replace(/{/g, "").replace(/}/g, "").split(",").map(Number);
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
