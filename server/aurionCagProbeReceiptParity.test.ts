import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildTerrainTexturizationCagProbe,
  buildWorldChunkTerrainCagProbe,
  buildWorldChunkTerrainContinuityCagProbe,
} from "../shared/aurionCagDesignProtocol";
import { generateBaseWorldChunk } from "../shared/worldChunkProtocol";

// Captured from main 76afd81bac8432c3a6e7a18177cac0cbf24c94c4. CAG receipts
// retain input/result hashes, so preserve complete probe output and tile order.
// A future deliberate receipt-contract migration must update these baselines.
const cases = [
  ["echoes-of-aurion-v1", -93, 48, false, "242e084c94e91bf7a075b640aff0ebef9ae03da2a0c99b7d06295eab9fcb1469"],
  ["echoes-of-aurion-v1", -93, 48, true, "b408cfa339423aafe321d6f1d8b4d7817c5882c2a8b500a9cfd0568d1bbad13b"],
  ["echoes-of-aurion-v1", 0, 0, false, "fcd8eda6d453cd148d93f6e79ebc710b41293db0e0b8e933a0260dba1073adb9"],
  ["echoes-of-aurion-v1", 0, 0, true, "733b3f3c65173aeb3f82310931c3050f2c80bac9763b57feb95290c1435eb70a"],
  ["aurion-probe-regression", -1, -2, false, "3908e98a6bf7c18f7935dab72c503e40c1dcdbb271a3403b5d53949d806977cb"],
  ["aurion-probe-regression", -1, -2, true, "3759b94b8f8b5d84585103aba43e55864819e47e4460fd841acbf7fa366815f9"],
  ["aurion-probe-regression", 105, -37, false, "2a65a040029a4bafa329f0a635e2bb778e580e807336eb8fcf6a3d7442265ebd"],
  ["aurion-probe-regression", 105, -37, true, "c8b464964b0f8820ab87387b84f2ba5d80deeffc8fdf345f215145057d2dcf34"],
] as const;

describe("CAG terrain probe receipt parity", () => {
  it.each(cases)("preserves main's probe bytes for seed %s at (%i,%i), reversed=%s", (worldSeed, x, z, reversed, expected) => {
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
