import { z } from "zod";

export const GLB_NORMALIZATION_REVISION = "aurion.glb-normalization.v1" as const;
export const GLB_NORMALIZATION_SCALE_E8 = 100_000_000;
export const GLB_GLB_UNIT_TO_MM = 1000;

const integerMm = z.number().int().safe().min(-1_000_000_000).max(1_000_000_000);
const positiveMm = z.number().int().safe().min(1).max(1_000_000_000);
const nonNegativeMm = z.number().int().safe().min(0).max(1_000_000_000);
const pointMm = z.tuple([integerMm, integerMm, integerMm]);
const extentsMm = z.tuple([positiveMm, positiveMm, positiveMm]);
const nonNegativeExtentsMm = z.tuple([nonNegativeMm, nonNegativeMm, nonNegativeMm]);
const halfExtentsMm = z.tuple([nonNegativeMm, nonNegativeMm, nonNegativeMm]);
const boundsMm = z.object({ min: pointMm, max: pointMm }).strict();
const quaternionQ30 = z.tuple([
  z.number().int().safe(),
  z.number().int().safe(),
  z.number().int().safe(),
  z.number().int().safe(),
]);

function roundRatioHalfAway(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new Error("GLB_NORMALIZATION_SCHEMA_DENOMINATOR");
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * magnitude + denominator) / (2n * denominator);
  const result = numerator < 0n ? -rounded : rounded;
  if (result < BigInt(Number.MIN_SAFE_INTEGER) || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("GLB_NORMALIZATION_SCHEMA_BOUNDS");
  return Number(result);
}

function scaled(value: number, scaleE8: number): number {
  return roundRatioHalfAway(BigInt(value) * BigInt(scaleE8), BigInt(GLB_NORMALIZATION_SCALE_E8));
}

const lodTriangleBudgets = [2_000_000, 1_000_000, 500_000, 250_000] as const;
const lodDistancesMm = [0, 24_000, 56_000, 120_000] as const;
const identityAxis = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const identityQ30 = [0, 0, 0, 1_073_741_824] as const;

export const glbNormalizationManifestSchema = z.object({
  revision: z.literal(GLB_NORMALIZATION_REVISION),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  unitConvention: z.literal("gltf-rh-y-up-meter"),
  unitToMm: z.literal(GLB_GLB_UNIT_TO_MM),
  axisConvention: z.literal("aurion-rh-y-up-forward-z"),
  axisTransform3x3: z.tuple([
    z.number().int().min(-1).max(1), z.number().int().min(-1).max(1), z.number().int().min(-1).max(1),
    z.number().int().min(-1).max(1), z.number().int().min(-1).max(1), z.number().int().min(-1).max(1),
    z.number().int().min(-1).max(1), z.number().int().min(-1).max(1), z.number().int().min(-1).max(1),
  ]),
  sourceBoundsMm: boundsMm,
  normalizedBoundsMm: boundsMm,
  targetEnvelopeMm: extentsMm,
  aspectRatioE6: z.tuple([
    z.number().int().safe().min(0).max(1_000_000),
    z.number().int().safe().min(0).max(1_000_000),
    z.number().int().safe().min(0).max(1_000_000),
  ]),
  clearanceEnvelopeMm: nonNegativeExtentsMm,
  scaleE8: z.number().int().safe().min(1).max(GLB_NORMALIZATION_SCALE_E8),
  sourcePivotMm: pointMm,
  translationMm: pointMm,
  gridSnap: z.object({
    permitted: z.boolean(),
    stepMm: z.number().int().safe().min(0).max(1_000_000),
    aligned: z.boolean(),
    errorMm: pointMm,
  }).strict(),
  collision: z.object({
    authority: z.literal("presentation-envelope-only"),
    aabbMm: boundsMm,
    obb: z.object({ centerMm: pointMm, halfExtentsMm, orientationQ30: quaternionQ30 }).strict(),
    volumeMm3: z.string().regex(/^(0|[1-9][0-9]*)$/),
    volumeBudgetMm3: z.string().regex(/^(0|[1-9][0-9]*)$/),
    surfaceAreaMm2: z.string().regex(/^(0|[1-9][0-9]*)$/),
    surfaceAreaBudgetMm2: z.string().regex(/^(0|[1-9][0-9]*)$/),
    triangleCount: z.number().int().safe().min(1).max(2_000_000),
    triangleBudget: z.number().int().safe().min(1).max(2_000_000),
  }).strict(),
  lod: z.object({
    level: z.number().int().min(0).max(3),
    maxRenderDistanceMm: z.number().int().safe().min(0).max(120_000),
    triangleCount: z.number().int().safe().min(1).max(2_000_000),
    triangleBudget: z.number().int().safe().min(1).max(2_000_000),
  }).strict(),
  transformSha256: z.string().regex(/^[a-f0-9]{64}$/),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((manifest, context) => {
  const sourceExtents = manifest.sourceBoundsMm.max.map((value, axis) => value - manifest.sourceBoundsMm.min[axis]!);
  const maximumSourceExtent = Math.max(...sourceExtents);
  const expectedScale = sourceExtents.reduce((scale, extent, axis) => {
    const candidate = BigInt(manifest.targetEnvelopeMm[axis]!) * BigInt(GLB_NORMALIZATION_SCALE_E8) / BigInt(Math.max(1, extent));
    return candidate < scale ? candidate : scale;
  }, BigInt(GLB_NORMALIZATION_SCALE_E8));
  if (maximumSourceExtent < 1 || Number(expectedScale) !== manifest.scaleE8) context.addIssue({ code: "custom", path: ["scaleE8"], message: "Scale must be the deterministic no-upscale fit for measured source bounds." });

  const expectedPivot = [
    roundRatioHalfAway(BigInt(manifest.sourceBoundsMm.min[0]! + manifest.sourceBoundsMm.max[0]!), 2n),
    manifest.sourceBoundsMm.min[1]!,
    roundRatioHalfAway(BigInt(manifest.sourceBoundsMm.min[2]! + manifest.sourceBoundsMm.max[2]!), 2n),
  ];
  if (JSON.stringify(expectedPivot) !== JSON.stringify(manifest.sourcePivotMm)) context.addIssue({ code: "custom", path: ["sourcePivotMm"], message: "Pivot must center horizontal bounds and ground the source minimum Y." });
  const expectedTranslation = expectedPivot.map(value => {
    const valueScaled = scaled(value, manifest.scaleE8);
    return valueScaled === 0 ? 0 : -valueScaled;
  });
  if (JSON.stringify(expectedTranslation) !== JSON.stringify(manifest.translationMm)) context.addIssue({ code: "custom", path: ["translationMm"], message: "Translation must be the deterministic pivot-to-origin transform." });
  const expectedBounds = {
    min: manifest.sourceBoundsMm.min.map((value, axis) => scaled(value, manifest.scaleE8) + expectedTranslation[axis]!),
    max: manifest.sourceBoundsMm.max.map((value, axis) => scaled(value, manifest.scaleE8) + expectedTranslation[axis]!),
  };
  if (JSON.stringify(expectedBounds) !== JSON.stringify(manifest.normalizedBoundsMm)) context.addIssue({ code: "custom", path: ["normalizedBoundsMm"], message: "Normalized bounds must be the scaled measured bounds plus the canonical translation." });
  const normalizedExtents = expectedBounds.max.map((value, axis) => value - expectedBounds.min[axis]!);
  if (normalizedExtents.some((extent, axis) => extent < 0 || extent > manifest.targetEnvelopeMm[axis]!)) context.addIssue({ code: "custom", path: ["targetEnvelopeMm"], message: "Measured bounds must fit inside the gameplay envelope." });

  const maximumNormalizedExtent = Math.max(...normalizedExtents);
  const expectedAspect = normalizedExtents.map(extent => maximumNormalizedExtent === 0 ? 0 : roundRatioHalfAway(BigInt(extent) * 1_000_000n, BigInt(maximumNormalizedExtent)));
  if (JSON.stringify(expectedAspect) !== JSON.stringify(manifest.aspectRatioE6)) context.addIssue({ code: "custom", path: ["aspectRatioE6"], message: "Aspect ratios must be measured in millionths from normalized bounds." });
  const expectedClearance = manifest.targetEnvelopeMm.map((extent, axis) => extent - normalizedExtents[axis]!);
  if (JSON.stringify(expectedClearance) !== JSON.stringify(manifest.clearanceEnvelopeMm)) context.addIssue({ code: "custom", path: ["clearanceEnvelopeMm"], message: "Clearance must equal target envelope minus measured normalized bounds." });

  if (JSON.stringify(manifest.axisTransform3x3) !== JSON.stringify(identityAxis)) context.addIssue({ code: "custom", path: ["axisTransform3x3"], message: "This revision uses the canonical glTF right-handed Y-up axis without an inferred rotation." });
  if (manifest.gridSnap.stepMm !== (manifest.gridSnap.permitted ? 1_000 : 0) || !manifest.gridSnap.aligned || JSON.stringify(manifest.gridSnap.errorMm) !== "[0,0,0]") context.addIssue({ code: "custom", path: ["gridSnap"], message: "Grid alignment must be exact and only use the versioned permitted step." });

  const extentBig = normalizedExtents.map(value => BigInt(value));
  const targetBig = manifest.targetEnvelopeMm.map(value => BigInt(value));
  const volume = extentBig[0]! * extentBig[1]! * extentBig[2]!;
  const volumeBudget = targetBig[0]! * targetBig[1]! * targetBig[2]!;
  const surfaceArea = 2n * (extentBig[0]! * extentBig[1]! + extentBig[0]! * extentBig[2]! + extentBig[1]! * extentBig[2]!);
  const surfaceAreaBudget = 2n * (targetBig[0]! * targetBig[1]! + targetBig[0]! * targetBig[2]! + targetBig[1]! * targetBig[2]!);
  if (manifest.collision.authority !== "presentation-envelope-only" || JSON.stringify(manifest.collision.aabbMm) !== JSON.stringify(manifest.normalizedBoundsMm)) context.addIssue({ code: "custom", path: ["collision"], message: "Collision metadata must be the measured presentation envelope and never gameplay authority." });
  if (JSON.stringify(manifest.collision.obb.centerMm) !== JSON.stringify(expectedBounds.min.map((value, axis) => roundRatioHalfAway(BigInt(value + expectedBounds.max[axis]!), 2n))) || JSON.stringify(manifest.collision.obb.halfExtentsMm) !== JSON.stringify(normalizedExtents.map(value => roundRatioHalfAway(BigInt(value), 2n))) || JSON.stringify(manifest.collision.obb.orientationQ30) !== JSON.stringify(identityQ30)) context.addIssue({ code: "custom", path: ["collision", "obb"], message: "OBB must match the measured axis-aligned normalized bounds." });
  if (manifest.collision.volumeMm3 !== volume.toString() || manifest.collision.volumeBudgetMm3 !== volumeBudget.toString() || volume > volumeBudget) context.addIssue({ code: "custom", path: ["collision", "volumeMm3"], message: "Collision volume and its target-envelope budget must be exact." });
  if (manifest.collision.surfaceAreaMm2 !== surfaceArea.toString() || manifest.collision.surfaceAreaBudgetMm2 !== surfaceAreaBudget.toString() || surfaceArea > surfaceAreaBudget) context.addIssue({ code: "custom", path: ["collision", "surfaceAreaMm2"], message: "Collision area and its target-envelope budget must be exact." });

  if (manifest.lod.triangleCount !== manifest.collision.triangleCount || manifest.lod.triangleBudget !== lodTriangleBudgets[manifest.lod.level] || manifest.collision.triangleBudget !== lodTriangleBudgets[manifest.lod.level] || manifest.lod.maxRenderDistanceMm !== lodDistancesMm[manifest.lod.level]) context.addIssue({ code: "custom", path: ["lod"], message: "LOD triangle and distance budgets must match the versioned level." });
});

export type GlbNormalizationManifest = z.infer<typeof glbNormalizationManifestSchema>;
