import { describe, expect, it } from "vitest";
import { groupGlbCatalogRows } from "./glbCatalogFamilies";
import type { GlbNormalizationManifest } from "../shared/glbNormalizationContract";

const triangles = [1200, 800, 400, 200] as const;
const budgets = [2_000_000, 1_000_000, 500_000, 250_000] as const;
const distances = [0, 24_000, 56_000, 120_000] as const;
const normalization = (
  sha256: string,
  level: number
): GlbNormalizationManifest => ({
  revision: "aurion.glb-normalization.v1",
  sourceSha256: sha256,
  unitConvention: "gltf-rh-y-up-meter",
  unitToMm: 1000,
  axisConvention: "aurion-rh-y-up-forward-z",
  axisTransform3x3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  sourceBoundsMm: { min: [0, 0, 0], max: [1000, 1000, 1000] },
  normalizedBoundsMm: { min: [-500, 0, -500], max: [500, 1000, 500] },
  targetEnvelopeMm: [1400, 1600, 1400],
  aspectRatioE6: [1_000_000, 1_000_000, 1_000_000],
  clearanceEnvelopeMm: [400, 600, 400],
  scaleE8: 100_000_000,
  sourcePivotMm: [500, 0, 500],
  translationMm: [-500, 0, -500],
  gridSnap: {
    permitted: true,
    stepMm: 1000,
    aligned: true,
    errorMm: [0, 0, 0],
  },
  collision: {
    authority: "presentation-envelope-only",
    aabbMm: { min: [-500, 0, -500], max: [500, 1000, 500] },
    obb: {
      centerMm: [0, 500, 0],
      halfExtentsMm: [500, 500, 500],
      orientationQ30: [0, 0, 0, 1_073_741_824],
    },
    volumeMm3: "1000000000",
    volumeBudgetMm3: "3136000000",
    surfaceAreaMm2: "6000000",
    surfaceAreaBudgetMm2: "12880000",
    triangleCount: triangles[level as 0 | 1 | 2 | 3]!,
    triangleBudget: budgets[level as 0 | 1 | 2 | 3]!,
  },
  lod: {
    level: level as 0 | 1 | 2 | 3,
    maxRenderDistanceMm: distances[level as 0 | 1 | 2 | 3]!,
    triangleCount: triangles[level as 0 | 1 | 2 | 3]!,
    triangleBudget: budgets[level as 0 | 1 | 2 | 3]!,
  },
  transformSha256: "1".repeat(64),
  manifestSha256: "2".repeat(64),
});

const row = (lod: number, sha: string, targetKey: string | null = null) => ({
  assetId: `glb_${sha.slice(0, 48)}`,
  sha256: sha,
  bytes: 1000 + lod,
  displayName: `World Nature · tree · Ancient Oak LOD${lod}`,
  assetType: "arena" as const,
  storageUrl: `/api/assets/glb/${sha}.glb`,
  targetKey,
  normalization: normalization(sha, lod),
});

const sha = (digit: string) => digit.repeat(64);

describe("groupGlbCatalogRows", () => {
  it("collapses four explicit physical LODs into one logical model", () => {
    const catalog = groupGlbCatalogRows([
      row(2, sha("c")),
      row(0, sha("a")),
      row(3, sha("d")),
      row(1, sha("b")),
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      displayName: "World Nature · tree · Ancient Oak",
      purpose: "world-nature",
      subcategory: "tree",
      sha256: sha("a"),
    });
    expect(catalog[0]!.lods.map(lod => [lod.level, lod.sha256])).toEqual([
      [0, sha("a")],
      [1, sha("b")],
      [2, sha("c")],
      [3, sha("d")],
    ]);
  });

  it("groups the three-stage Asterion auto arena family with LOD0 primary", () => {
    const a = { ...row(0, sha("a")), displayName: "Asterion Courtyard LOD0", assetType: "arena" as const, targetKey: "asterion_courtyard" };
    const b = { ...row(1, sha("b")), displayName: "Asterion Courtyard LOD1", assetType: "arena" as const, targetKey: null };
    const c = { ...row(2, sha("c")), displayName: "Asterion Courtyard LOD2", assetType: "arena" as const, targetKey: null };
    const catalog = groupGlbCatalogRows([c, a, b]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      displayName: "Asterion Courtyard",
      purpose: "auto",
      assetType: "arena",
      sha256: sha("a"),
      targetKey: "asterion_courtyard",
    });
    expect(catalog[0]!.lods.map(lod => [lod.level, lod.sha256])).toEqual([[0, sha("a")], [1, sha("b")], [2, sha("c")]]);
  });

  it("keeps ordinary single models independent and backward compatible", () => {
    const catalog = groupGlbCatalogRows([
      { ...row(0, sha("e")), displayName: "World Nature · tree · Lone Oak" },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.displayName).toBe("World Nature · tree · Lone Oak");
    expect(catalog[0]!.lods).toEqual([]);
  });

  it("fails visibly on duplicate levels instead of hiding a physical asset", () => {
    const duplicate = {
      ...row(0, sha("f")),
      assetId: `glb_${sha("f").slice(0, 48)}`,
    };
    const catalog = groupGlbCatalogRows([row(0, sha("a")), duplicate]);
    expect(catalog).toHaveLength(2);
    expect(catalog.every(entry => entry.displayName.includes("LOD0"))).toBe(
      true
    );
  });

  it("keeps size-drifted or denser lower LODs as standalone entries", () => {
    const l0 = row(0, sha("a"));
    const sizeDrifted = {
      ...row(1, sha("b")),
      normalization: {
        ...normalization(sha("b"), 1),
        normalizedBoundsMm: {
          min: [-500, 0, -500] as const,
          max: [700, 1000, 500] as const,
        },
      },
    };
    const triangleRegression = {
      ...row(1, sha("c")),
      normalization: {
        ...normalization(sha("c"), 1),
        collision: {
          ...normalization(sha("c"), 1).collision,
          triangleCount: 1300,
        },
        lod: { ...normalization(sha("c"), 1).lod, triangleCount: 1300 },
      },
    };
    for (const invalid of [sizeDrifted, triangleRegression]) {
      const catalog = groupGlbCatalogRows([l0, invalid]);
      expect(catalog).toHaveLength(2);
      expect(catalog.every(entry => entry.lods.length === 0)).toBe(true);
    }
  });
});
