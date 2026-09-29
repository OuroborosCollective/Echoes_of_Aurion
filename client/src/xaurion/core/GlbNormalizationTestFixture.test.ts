import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GLB_GLB_UNIT_TO_MM,
  GLB_NORMALIZATION_REVISION,
  GLB_NORMALIZATION_SCALE_E8,
  glbNormalizationManifestSchema,
  type GlbNormalizationManifest,
} from "@shared/glbNormalizationContract";

const triangleBudgets = [2_000_000, 1_000_000, 500_000, 250_000] as const;
const renderDistancesMm = [0, 24_000, 56_000, 120_000] as const;
const identityAxes = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const identityQuaternionQ30 = [0, 0, 0, 1_073_741_824] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Produces internally consistent, fixed-point manifest data for catalog-only tests.
 * No runtime behavior is mocked: the result is parsed by the production contract.
 */
export function glbNormalizationTestFixture(
  sourceSha256: string,
  level: 0 | 1 | 2 | 3 = 0
): GlbNormalizationManifest {
  const targetEnvelopeMm = [1_400, 1_600, 1_400] as const;
  const sourceBoundsMm = {
    min: [0, 0, 0] as const,
    max: [1_000, 1_000, 1_000] as const,
  };
  const normalizedBoundsMm = {
    min: [-500, 0, -500] as const,
    max: [500, 1_000, 500] as const,
  };
  const scaleE8 = GLB_NORMALIZATION_SCALE_E8;
  const sourcePivotMm = [500, 0, 500] as const;
  const translationMm = [-500, 0, -500] as const;
  const transformCore = {
    revision: GLB_NORMALIZATION_REVISION,
    sourceSha256,
    axisTransform3x3: identityAxes,
    scaleE8,
    sourcePivotMm,
    translationMm,
  };
  const transformSha256 = sha256(JSON.stringify(transformCore));
  const triangleBudget = triangleBudgets[level];
  const manifestCore = {
    revision: GLB_NORMALIZATION_REVISION,
    sourceSha256,
    unitConvention: "gltf-rh-y-up-meter" as const,
    unitToMm: GLB_GLB_UNIT_TO_MM,
    axisConvention: "aurion-rh-y-up-forward-z" as const,
    axisTransform3x3: identityAxes,
    sourceBoundsMm,
    normalizedBoundsMm,
    targetEnvelopeMm,
    aspectRatioE6: [1_000_000, 1_000_000, 1_000_000] as const,
    clearanceEnvelopeMm: [400, 600, 400] as const,
    scaleE8,
    sourcePivotMm,
    translationMm,
    gridSnap: {
      permitted: false,
      stepMm: 0,
      aligned: true,
      errorMm: [0, 0, 0] as const,
    },
    collision: {
      authority: "presentation-envelope-only" as const,
      aabbMm: normalizedBoundsMm,
      obb: {
        centerMm: [0, 500, 0] as const,
        halfExtentsMm: [500, 500, 500] as const,
        orientationQ30: identityQuaternionQ30,
      },
      volumeMm3: "1000000000",
      volumeBudgetMm3: "3136000000",
      surfaceAreaMm2: "6000000",
      surfaceAreaBudgetMm2: "12880000",
      triangleCount: 12,
      triangleBudget,
    },
    lod: {
      level,
      maxRenderDistanceMm: renderDistancesMm[level],
      triangleCount: 12,
      triangleBudget,
    },
    transformSha256,
  };
  return glbNormalizationManifestSchema.parse({
    ...manifestCore,
    manifestSha256: sha256(JSON.stringify(manifestCore)),
  });
}

describe("GLB normalization test catalog fixture", () => {
  it("produces deterministic source-bound manifests accepted by the production schema", () => {
    const sourceSha256 = "d".repeat(64);
    const first = glbNormalizationTestFixture(sourceSha256, 1);
    const replay = glbNormalizationTestFixture(sourceSha256, 1);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      sourceSha256,
      lod: { level: 1, maxRenderDistanceMm: 24_000 },
      normalizedBoundsMm: {
        min: [-500, 0, -500],
        max: [500, 1_000, 500],
      },
    });
  });
});
