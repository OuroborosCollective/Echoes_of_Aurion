import { describe, expect, it } from "vitest";
import {
  buildModelScaleCagProbe,
  buildProgressionCagProbe,
  buildWorldAssetScaleCagProbe,
  buildWorldChunkTerrainCagProbe,
  cagOracleXpForNextLevelExact,
  normalizeWorldAssetBounds,
  summarizeWorldChunkTerrain,
  WORLD_ASSET_TARGET_MAX_EXTENT,
  type ModelBounds,
} from "../shared/aurionCagDesignProtocol";
import { generateBaseWorldChunk, WORLD_CHUNK_GRID_SIZE } from "../shared/worldChunkProtocol";
import { worldAssetCatalog } from "../shared/worldAssetProtocol";
import { xpRequiredForNextSkillLevelExact } from "./wasdAurionSkillProgressionProtocol";
import {
  normalizeWolframComputeResult,
  verifyAurionCagDesignProbe,
} from "./aurionCagDesignOracle";
import type { WolframCagClient, WolframCagEvidence } from "./wolframCag";

const sha = "a".repeat(64);

function fakeClient(result: string, options: { fail?: boolean } = {}): WolframCagClient {
  const evidence = (component: WolframCagEvidence["component"]): WolframCagEvidence => Object.freeze({
    protocol: "aurion.wolfram-cag.v1",
    provider: "wolfram-cag",
    component,
    endpoint: "/api/cag/v1/WolframLanguageCompute",
    requestSha256: sha,
    responseSha256: "b".repeat(64),
    providerUuid: "provider-uuid",
    providerCode: 200,
    success: true,
    result,
    resultChars: result.length,
  });
  const unsupported = async (): Promise<WolframCagEvidence> => {
    throw new Error("not used in design-oracle tests");
  };
  return Object.freeze({
    languageCompute: async () => {
      if (options.fail) throw new TypeError("provider offline");
      return evidence("language_compute");
    },
    languageHints: unsupported,
    alphaResults: unsupported,
    alphaContext: unsupported,
  });
}

describe("Aurion CAG deterministic design oracle", () => {
  it("independently reproduces the cap-free exact progression curve", () => {
    for (const level of ["1", "10", "50", "100", "1000", "1000000", "999999999999999999"]) {
      expect(cagOracleXpForNextLevelExact(level)).toBe(xpRequiredForNextSkillLevelExact(level));
      expect(buildProgressionCagProbe(level).expectedExact).toBe(xpRequiredForNextSkillLevelExact(level));
    }
  });

  it("verifies canonical world-chunk terrain instead of introducing a second terrain generator", () => {
    const chunk = generateBaseWorldChunk({
      worldId: "echoes-of-aurion-global",
      worldSeed: "echoes-of-aurion-v1",
      coordinate: { x: -93, z: 48 },
    });
    const replay = generateBaseWorldChunk({
      worldId: "echoes-of-aurion-global",
      worldSeed: "echoes-of-aurion-v1",
      coordinate: { x: -93, z: 48 },
    });
    expect(replay).toEqual(chunk);
    const summary = summarizeWorldChunkTerrain(chunk);
    expect(summary.tileCount).toBe(WORLD_CHUNK_GRID_SIZE * WORLD_CHUNK_GRID_SIZE);
    expect(summary.roadTileCount).toBe(WORLD_CHUNK_GRID_SIZE * 2 - 1);
    expect(Number.isSafeInteger(summary.minHeightMm)).toBe(true);
    expect(Number.isSafeInteger(summary.maxHeightMm)).toBe(true);
    expect(summary.maxAdjacentDeltaMm).toBeGreaterThanOrEqual(0);
    const probe = buildWorldChunkTerrainCagProbe(chunk);
    expect(probe.expectedExact).toBe(
      `{${summary.minHeightMm},${summary.maxHeightMm},${summary.maxAdjacentDeltaMm}}`,
    );
    expect(probe.code.length).toBeLessThan(20_000);
    expect(probe.truthNotice).toContain("does not generate or mutate terrain authority");
  });

  it("recomputes every current world-asset scale from measured bounds and category targets", () => {
    for (const asset of worldAssetCatalog.assets) {
      expect(WORLD_ASSET_TARGET_MAX_EXTENT[asset.category]).toBeDefined();
      const bounds = asset.bounds as ModelBounds;
      const normalized = normalizeWorldAssetBounds(asset.category, bounds);
      expect(normalized.scale).toBe(asset.scale);
      expect(normalized.normalizedExtents.every(value => Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  it("builds an exact fixed-point model scale probe", () => {
    const bounds: ModelBounds = {
      min: [-398, 0, -283],
      max: [397, 2020, 277],
    };
    const probe = buildModelScaleCagProbe(bounds, 1800);
    expect(probe.expectedExact).toBe("89108911");
    expect(probe.code).toContain("100000000");
    const asset = worldAssetCatalog.assets[0]!;
    expect(buildWorldAssetScaleCagProbe(asset.category, asset.bounds as ModelBounds).expectedExact)
      .toBe(String(Math.round(asset.scale * 100_000_000)));
  });

  it("normalizes bounded Wolfram output without accepting multiline envelopes", () => {
    expect(normalizeWolframComputeResult("50")).toBe("50");
    expect(normalizeWolframComputeResult("Out[1]=50")).toBe("50");
    expect(() => normalizeWolframComputeResult("message\nOut[1]=50")).toThrow("CAG_RESULT_BOUNDS");
  });

  it("returns non-authoritative SUPPORTED, CONTRADICTED and INCONCLUSIVE receipts", async () => {
    const probe = buildProgressionCagProbe("1");
    const supported = await verifyAurionCagDesignProbe(probe, fakeClient("Out[1]=50"));
    expect(supported).toMatchObject({
      verdict: "SUPPORTED",
      expectedExact: "50",
      observedExact: "50",
      mutationPerformed: false,
      secretValuesReturned: false,
    });
    expect(supported.providerUuidSha256).toMatch(/^[a-f0-9]{64}$/);

    const contradicted = await verifyAurionCagDesignProbe(probe, fakeClient("Out[2]=51"));
    expect(contradicted).toMatchObject({
      verdict: "CONTRADICTED",
      expectedExact: "50",
      observedExact: "51",
      mutationPerformed: false,
    });

    const unavailable = await verifyAurionCagDesignProbe(probe, fakeClient("", { fail: true }));
    expect(unavailable).toMatchObject({
      verdict: "INCONCLUSIVE",
      failureFamily: "provider_unreachable",
      mutationPerformed: false,
      requestSha256: null,
      responseSha256: null,
    });
  });
});
