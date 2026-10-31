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
  ["echoes-of-aurion-v1", -93, 48, false, "4091d9753b3350a2bd3b59bdcef61a71e4616bcada895fd753b6e3db19e2ce3b"],
  ["echoes-of-aurion-v1", -93, 48, true, "4091d9753b3350a2bd3b59bdcef61a71e4616bcada895fd753b6e3db19e2ce3b"],
  ["echoes-of-aurion-v1", 0, 0, false, "74d9808439d2f30a19eca672fab7add3f4902a0eb770d77b792646abf14c7a75"],
  ["echoes-of-aurion-v1", 0, 0, true, "74d9808439d2f30a19eca672fab7add3f4902a0eb770d77b792646abf14c7a75"],
  ["aurion-probe-regression", -1, -2, false, "a50786f44e88277c1ec084bfe831ce2431c4c79b6c7cc201d4925848e8b004b9"],
  ["aurion-probe-regression", -1, -2, true, "a50786f44e88277c1ec084bfe831ce2431c4c79b6c7cc201d4925848e8b004b9"],
  ["aurion-probe-regression", 105, -37, false, "f36ff41485ec7f719dd585898fc2ec9fad9502bf2226b812602f8114682ad7de"],
  ["aurion-probe-regression", 105, -37, true, "f36ff41485ec7f719dd585898fc2ec9fad9502bf2226b812602f8114682ad7de"],
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
