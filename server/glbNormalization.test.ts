import { describe, expect, it } from "vitest";
import { testGlb } from "./glbImportFixtures";
import { buildGlbImportPlan } from "./glbImportPlan";
import { glbNormalizationManifestSchema } from "../shared/glbNormalizationContract";

function scaledTriangle(scale: readonly [number, number, number]): Buffer {
  const bytes = testGlb("Aurion_Spear_Weapon", {
    nodes: [{ name: "Aurion_Spear_Weapon", mesh: 0, scale }],
  });
  const jsonBytes = bytes.readUInt32LE(12);
  bytes.writeFloatLE(1, 28 + jsonBytes + 5 * 4);
  return bytes;
}

describe("deterministic GLB normalization manifest", () => {
  it("measures transformed scene geometry and grounds a centered pivot deterministically", async () => {
    const bytes = testGlb("Aurion_Spear_Weapon", {
      nodes: [
        { name: "Aurion_Spear_Weapon", children: [1], translation: [1, 2, 3] },
        { name: "mesh", mesh: 0, translation: [2, 0, -1] },
      ],
    });
    const first = await buildGlbImportPlan(bytes.toString("base64"));
    const second = await buildGlbImportPlan(bytes.toString("base64"));
    expect(first.normalization.manifestSha256).toBe(second.normalization.manifestSha256);
    expect(first.normalization.transformSha256).toBe(second.normalization.transformSha256);
    expect(first.normalization.sourceBoundsMm).toEqual({ min: [3_000, 2_000, 2_000], max: [4_000, 3_000, 2_000] });
    expect(first.normalization.sourcePivotMm).toEqual([3_500, 2_000, 2_000]);
    expect(first.normalization.translationMm).toEqual([-3_500, -2_000, -2_000]);
    expect(first.normalization.normalizedBoundsMm).toEqual({ min: [-500, 0, 0], max: [500, 1_000, 0] });
    expect(first.normalization.axisTransform3x3).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(first.normalization.gridSnap).toMatchObject({ permitted: false, stepMm: 0, aligned: true, errorMm: [0, 0, 0] });
    expect(first.normalization.collision.authority).toBe("presentation-envelope-only");
  });

  it("matches the Wolfram-verified integer scale, pivot, translation, and normalized bounds", async () => {
    const plan = await buildGlbImportPlan(scaledTriangle([2.175, 1, 1]).toString("base64"));
    expect(plan.normalization.sourceBoundsMm).toEqual({ min: [0, 0, 0], max: [2_175, 1_000, 1_000] });
    expect(plan.normalization.targetEnvelopeMm).toEqual([1_400, 1_600, 1_400]);
    expect(plan.normalization.scaleE8).toBe(64_367_816);
    expect(plan.normalization.sourcePivotMm).toEqual([1_088, 0, 500]);
    expect(plan.normalization.translationMm).toEqual([-700, 0, -322]);
    expect(plan.normalization.normalizedBoundsMm).toEqual({ min: [-700, 0, -322], max: [700, 644, 322] });
    expect(plan.normalization.aspectRatioE6).toEqual([1_000_000, 460_000, 460_000]);
    expect(plan.normalization.clearanceEnvelopeMm).toEqual([0, 956, 756]);
    expect(plan.normalization.collision.obb).toMatchObject({ centerMm: [0, 322, 0], halfExtentsMm: [700, 322, 322] });
    expect(plan.normalization.collision.volumeMm3).toBe("580630400");
    expect(plan.normalization.collision.volumeBudgetMm3).toBe("3136000000");
    expect(plan.normalization.collision.surfaceAreaMm2).toBe("4435872");
    expect(plan.normalization.collision.surfaceAreaBudgetMm2).toBe("12880000");
    expect(plan.normalization.lod).toMatchObject({ level: 0, maxRenderDistanceMm: 0, triangleCount: 1, triangleBudget: 2_000_000 });
    expect(glbNormalizationManifestSchema.parse(plan.normalization)).toEqual(plan.normalization);
    expect(() => glbNormalizationManifestSchema.parse({ ...plan.normalization, scaleE8: 1 })).toThrow();
    expect(() => glbNormalizationManifestSchema.parse({
      ...plan.normalization,
      collision: { ...plan.normalization.collision, volumeBudgetMm3: "1" },
    })).toThrow();
  });

  it("fails closed on wrong-unit magnitude and ambiguous or collapsed transforms", async () => {
    const oversized = testGlb("Aurion_Spear_Weapon", {
      nodes: [{ name: "Aurion_Spear_Weapon", mesh: 0, scale: [100, 100, 100] }],
    });
    await expect(buildGlbImportPlan(oversized.toString("base64"))).rejects.toThrow("GLB_SOURCE_UNIT_ENVELOPE");

    const collapsed = testGlb("Aurion_Spear_Weapon", {
      nodes: [{ name: "Aurion_Spear_Weapon", mesh: 0, scale: [0, 1, 1] }],
    });
    await expect(buildGlbImportPlan(collapsed.toString("base64"))).rejects.toThrow("GLB_SCALE_NONPOSITIVE");

    const ambiguous = testGlb("Aurion_Spear_Weapon", {
      nodes: [{ name: "Aurion_Spear_Weapon", mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], translation: [1, 0, 0] }],
    });
    await expect(buildGlbImportPlan(ambiguous.toString("base64"))).rejects.toThrow("GLB_TRANSFORM_AMBIGUOUS");
  });
});
