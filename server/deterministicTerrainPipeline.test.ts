import { describe, expect, it } from "vitest";
import {
  generateDeterministicTerrainChunk,
  TERRAIN_MAX_ADJACENT_DELTA_MM,
  TERRAIN_MAX_SLOPE_BPS,
  TERRAIN_MIN_WALKABLE_TILES,
  terrainBoundaryHeights,
  verifyTerrainSeam,
} from "../shared/deterministicTerrainPipelineProtocol";
import {
  WORLD_CHUNK_COORDINATE_LIMIT,
  generateBaseWorldChunk,
} from "../shared/worldChunkProtocol";
import { buildWorldChunkTerrainCagProbe, buildWorldChunkTerrainContinuityCagProbe } from "../shared/aurionCagDesignProtocol";
import {
  assertCagRulesetPromotionAllowed,
  verifyAurionCagDesignProbe,
} from "./aurionCagDesignOracle";
import type { WolframCagClient } from "./wolframCag";

const REVISION = "a".repeat(40);
const input = (x = 0, z = 0, revision = REVISION) => ({
  worldId: "echoes-of-aurion-global",
  worldSeed: "terrain-seed-boundary-v1",
  worldGenerationRevision: revision,
  coordinate: { x, z },
});

function neighbor(
  x: number,
  z: number,
  direction: "north" | "south" | "west" | "east"
) {
  if (direction === "north") return { x, z: z - 1 };
  if (direction === "south") return { x, z: z + 1 };
  if (direction === "west") return { x: x - 1, z };
  return { x: x + 1, z };
}

describe("AIM-599 deterministic terrain pipeline", () => {
  it("regenerates the same chunk hash 100 times and binds seed/revision identity", () => {
    const chunks = Array.from({ length: 100 }, () =>
      generateDeterministicTerrainChunk(input(-93, 48))
    );
    expect(new Set(chunks.map(chunk => chunk.terrainHash)).size).toBe(1);
    expect(chunks[0]).toEqual(chunks[99]);

    const changedSeed = generateDeterministicTerrainChunk({
      ...input(-93, 48),
      worldSeed: "terrain-seed-boundary-v2",
    });
    const changedRevision = generateDeterministicTerrainChunk(
      input(-93, 48, "b".repeat(40))
    );
    expect(changedSeed.terrainHash).not.toBe(chunks[0]!.terrainHash);
    expect(changedRevision.terrainHash).not.toBe(chunks[0]!.terrainHash);
  });

  it("keeps every shared seam identical across a 5 by 5 neighborhood", () => {
    const chunks = new Map<
      string,
      ReturnType<typeof generateDeterministicTerrainChunk>
    >();
    for (let z = -2; z <= 2; z += 1) {
      for (let x = -2; x <= 2; x += 1) {
        chunks.set(`${x}:${z}`, generateDeterministicTerrainChunk(input(x, z)));
      }
    }
    for (let z = -2; z <= 2; z += 1) {
      for (let x = -2; x <= 2; x += 1) {
        const current = chunks.get(`${x}:${z}`)!;
        for (const direction of ["south", "east"] as const) {
          const adjacentCoordinate = neighbor(x, z, direction);
          const adjacent = chunks.get(
            `${adjacentCoordinate.x}:${adjacentCoordinate.z}`
          );
          if (!adjacent) continue;
          expect(verifyTerrainSeam(current, adjacent, direction)).toBe(true);
          const currentSide = terrainBoundaryHeights(current, direction);
          const opposite = direction === "south" ? "north" : "west";
          expect(currentSide).toEqual(
            terrainBoundaryHeights(adjacent, opposite)
          );
        }
      }
    }
  });

  it("enforces bounded heights, slopes, walkability and water/material consistency", () => {
    for (const coordinate of [
      { x: -WORLD_CHUNK_COORDINATE_LIMIT, z: -WORLD_CHUNK_COORDINATE_LIMIT },
      { x: 0, z: 0 },
      { x: WORLD_CHUNK_COORDINATE_LIMIT, z: WORLD_CHUNK_COORDINATE_LIMIT },
    ]) {
      const terrain = generateDeterministicTerrainChunk({
        ...input(),
        coordinate,
      });
      expect(terrain.maxAdjacentDeltaMm).toBeLessThanOrEqual(
        TERRAIN_MAX_ADJACENT_DELTA_MM
      );
      expect(terrain.maxSlopeBps).toBeLessThanOrEqual(TERRAIN_MAX_SLOPE_BPS);
      expect(terrain.walkableTileCount).toBeGreaterThanOrEqual(
        TERRAIN_MIN_WALKABLE_TILES
      );
      expect(
        terrain.tiles.every(tile =>
          tile.water
            ? tile.material === "water" && tile.biome === "riverland"
            : tile.material !== "water"
        )
      ).toBe(true);
      expect(terrain.sampleResolution).toEqual({
        numeratorMm: 64_000,
        denominator: 15,
      });
    }
  });

  it("feeds the canonical BaseWorldChunk without provider-dependent terrain truth", () => {
    const base = generateBaseWorldChunk({
      ...input(-3, 7),
    });
    const terrain = generateDeterministicTerrainChunk(input(-3, 7));
    expect(base.worldGenerationRevision).toBe(terrain.worldGenerationRevision);
    expect(base.tiles.map(tile => tile.heightMm)).toEqual(
      terrain.tiles.map(tile => tile.heightMm)
    );
    expect(base.biome).toBe(terrain.biome);
    expect(base.deterministicHash).toMatch(/^fnv1a-[a-f0-9]{8}$/);
  });


  it("emits valid CAG terrain continuity probe", () => {
    const chunk = generateBaseWorldChunk(input(42, -17));
    const probe = buildWorldChunkTerrainContinuityCagProbe(chunk);
    expect(probe.kind).toBe("terrain_continuity");
    expect(probe.code).toMatch(/^h=\{\{/);
    expect(probe.code).toMatch(/s=\{\{/);
    expect(probe.code).toContain("var=Round[Variance[Flatten[h]]]");
    expect(probe.code).toContain("trans=Count[sdx,x_/;x!=0]+Count[sdz,x_/;x!=0]");
    expect(probe.expectedExact).toMatch(/^\{[0-9]+,[0-9]+\}$/);
  });

  it("emits bounded CAG input/result hashes and blocks promotion on divergence", async () => {
    const chunk = generateBaseWorldChunk(input(-93, 48));
    const probe = buildWorldChunkTerrainCagProbe(chunk);
    const client: WolframCagClient = {
      languageCompute: async request => ({
        protocol: "aurion.wolfram-cag.v1",
        provider: "wolfram-cag",
        component: "language_compute",
        endpoint: "/api/cag/v1/WolframLanguageCompute",
        requestSha256: "a".repeat(64),
        responseSha256: "b".repeat(64),
        providerUuid: "terrain-cag-fixture",
        providerCode: 200,
        success: true,
        result: probe.expectedExact,
        resultChars: request.code.length,
      }),
      languageHints: async () => {
        throw new Error("not used");
      },
      alphaResults: async () => {
        throw new Error("not used");
      },
      alphaContext: async () => {
        throw new Error("not used");
      },
    };
    const supported = await verifyAurionCagDesignProbe(probe, client);
    expect(supported.verdict).toBe("SUPPORTED");
    expect(supported.rulesetPromotion).toBe("eligible");
    expect(supported.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(supported.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertCagRulesetPromotionAllowed(supported)).not.toThrow();

    const divergent = await verifyAurionCagDesignProbe(probe, {
      ...client,
      languageCompute: async request => ({
        ...(await client.languageCompute(request)),
        result: "{0,0,0}",
      }),
    });
    expect(divergent.verdict).toBe("CONTRADICTED");
    expect(divergent.rulesetPromotion).toBe("blocked");
    expect(() => assertCagRulesetPromotionAllowed(divergent)).toThrow(
      "CAG_RULESET_PROMOTION_BLOCKED"
    );
  });

  it("fails closed for invalid seed, revision, and coordinates", () => {
    expect(() =>
      generateDeterministicTerrainChunk({ ...input(), worldSeed: "" })
    ).toThrow("TERRAIN_WORLD_SEED_REQUIRED");
    expect(() =>
      generateDeterministicTerrainChunk({
        ...input(),
        worldGenerationRevision: "bad",
      })
    ).toThrow("TERRAIN_GENERATION_REVISION_INVALID");
    expect(() =>
      generateDeterministicTerrainChunk({
        ...input(),
        coordinate: { x: 0.5, z: 0 },
      })
    ).toThrow("TERRAIN_CHUNK_COORDINATE_INVALID");
  });
});
