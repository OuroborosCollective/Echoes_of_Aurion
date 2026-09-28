import { createHash } from "node:crypto";
import type { GlbAssetClassification } from "./glbAssetClassifier";
import type { GlbImportPurpose } from "../shared/glbImportContract";
import {
  GLB_GLB_UNIT_TO_MM,
  GLB_NORMALIZATION_REVISION,
  GLB_NORMALIZATION_SCALE_E8,
  glbNormalizationManifestSchema,
  type GlbNormalizationManifest,
} from "../shared/glbNormalizationContract";
import { audit } from "../scripts/world-glb-geometry.mjs";

const TRIANGLE_BUDGET_BY_LOD = [2_000_000, 1_000_000, 500_000, 250_000] as const;
const RENDER_DISTANCE_BY_LOD_MM = [0, 24_000, 56_000, 120_000] as const;
const IDENTITY_AXIS = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const IDENTITY_Q30 = [0, 0, 0, 1_073_741_824] as const;

type Profile = Readonly<{
  targetEnvelopeMm: readonly [number, number, number];
  maximumSourceExtentMm: number;
  minimumLargestExtentMm: number;
  minimumHeightMm?: number;
  minimumHeightRatioE6?: number;
}>;

const BASE_PROFILES: Readonly<Record<"character" | "enemy" | "weapon" | "armor", Profile>> = Object.freeze({
  character: Object.freeze({ targetEnvelopeMm: [1_800, 2_400, 1_800] as const, maximumSourceExtentMm: 25_000, minimumLargestExtentMm: 50, minimumHeightMm: 250, minimumHeightRatioE6: 250_000 }),
  enemy: Object.freeze({ targetEnvelopeMm: [3_000, 3_200, 3_000] as const, maximumSourceExtentMm: 50_000, minimumLargestExtentMm: 10, minimumHeightMm: 10, minimumHeightRatioE6: 100_000 }),
  weapon: Object.freeze({ targetEnvelopeMm: [1_400, 1_600, 1_400] as const, maximumSourceExtentMm: 30_000, minimumLargestExtentMm: 5 }),
  armor: Object.freeze({ targetEnvelopeMm: [1_200, 1_800, 1_000] as const, maximumSourceExtentMm: 20_000, minimumLargestExtentMm: 5 }),
});
const WORLD_ENVELOPE_MM: Readonly<Record<string, number>> = Object.freeze({
  building: 11_000, structure: 8_000, prop: 2_000,
  tree: 7_000, mountain: 18_000, rock: 2_000, plant: 1_000,
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw new Error("GLB_NORMALIZATION_INTEGER_BOUNDS");
  const n = BigInt(numerator), d = BigInt(denominator), magnitude = n < 0n ? -n : n;
  const rounded = (2n * magnitude + d) / (2n * d);
  const result = n < 0n ? -rounded : rounded;
  if (result < BigInt(Number.MIN_SAFE_INTEGER) || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("GLB_NORMALIZATION_INTEGER_BOUNDS");
  return Number(result);
}

function roundWorldMetersToMm(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error("GLB_SOURCE_UNIT_ENVELOPE");
  const scaled = Math.abs(value) * GLB_GLB_UNIT_TO_MM;
  const rounded = Math.floor(scaled + 0.5);
  if (!Number.isSafeInteger(rounded)) throw new Error("GLB_NORMALIZATION_INTEGER_BOUNDS");
  return value < 0 ? -rounded : rounded;
}

function profileFor(classification: GlbAssetClassification, purpose: GlbImportPurpose): Profile {
  if (classification.assetType !== "arena") return BASE_PROFILES[classification.assetType];
  const familyDefault = purpose === "world-nature" ? "plant" : "structure";
  const envelope = WORLD_ENVELOPE_MM[classification.subcategory ?? familyDefault] ?? (purpose === "world-nature" ? 7_000 : 11_000);
  return Object.freeze({ targetEnvelopeMm: [envelope, envelope, envelope] as const, maximumSourceExtentMm: 1_000_000, minimumLargestExtentMm: 5 });
}

function assertSourceEnvelope(extents: readonly number[], profile: Profile): void {
  if (extents.some(value => !Number.isSafeInteger(value) || value < 0) || Math.max(...extents) < profile.minimumLargestExtentMm) throw new Error("GLB_SOURCE_GEOMETRY_DEGENERATE");
  if (Math.max(...extents) > profile.maximumSourceExtentMm) throw new Error("GLB_SOURCE_UNIT_ENVELOPE");
  if (profile.minimumHeightMm !== undefined && extents[1]! < profile.minimumHeightMm) throw new Error("GLB_SOURCE_HEIGHT_ENVELOPE");
  if (profile.minimumHeightRatioE6 !== undefined && extents[1]! * 1_000_000 < Math.max(...extents) * profile.minimumHeightRatioE6) throw new Error("GLB_SOURCE_AXIS_ENVELOPE");
}

function transformedCoordinate(valueMm: number, scaleE8: number, translationMm: number): number {
  return roundHalfAwayFromZero(valueMm * scaleE8, GLB_NORMALIZATION_SCALE_E8) + translationMm;
}

function scaledPivot(valueMm: number, scaleE8: number): number {
  return roundHalfAwayFromZero(valueMm * scaleE8, GLB_NORMALIZATION_SCALE_E8);
}

/**
 * Measures the decoded POSITION stream after every active-scene node transform.
 * Input glTF coordinates are meters in the normative right-handed +Y-up frame;
 * Aurion uses that same frame, so the versioned axis conversion is explicitly
 * the identity rather than an inferred or AI-guessed rotation.
 */
export async function buildGlbNormalizationManifest(
  bytes: Buffer,
  sourceSha256: string,
  classification: GlbAssetClassification,
  purpose: GlbImportPurpose,
): Promise<GlbNormalizationManifest> {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("GLB_NORMALIZATION_SOURCE_HASH_INVALID");
  const profile = profileFor(classification, purpose);
  const measured = await audit(bytes, 2_000_000, { requireMeshopt: false, includeVertices: false });
  const sourceMin = measured.bounds.min.map(roundWorldMetersToMm);
  const sourceMax = measured.bounds.max.map(roundWorldMetersToMm);
  const sourceBoundsMm = { min: sourceMin, max: sourceMax } as const;
  const sourceExtents = sourceMax.map((maximum, axis) => maximum - sourceMin[axis]!);
  assertSourceEnvelope(sourceExtents, profile);

  const scaleNumerators = profile.targetEnvelopeMm.map((target, axis) =>
    BigInt(target) * BigInt(GLB_NORMALIZATION_SCALE_E8) / BigInt(Math.max(1, sourceExtents[axis]!))
  );
  const scaleE8 = Number(scaleNumerators.reduce((scale, candidate) => candidate < scale ? candidate : scale, BigInt(GLB_NORMALIZATION_SCALE_E8)));
  if (!Number.isSafeInteger(scaleE8) || scaleE8 < 1 || scaleE8 > GLB_NORMALIZATION_SCALE_E8) throw new Error("GLB_NORMALIZATION_SCALE_INVALID");

  const sourcePivotMm = [
    roundHalfAwayFromZero(sourceMin[0]! + sourceMax[0]!, 2),
    sourceMin[1]!,
    roundHalfAwayFromZero(sourceMin[2]! + sourceMax[2]!, 2),
  ] as const;
  const translationMm = sourcePivotMm.map(value => {
    const scaled = scaledPivot(value, scaleE8);
    return scaled === 0 ? 0 : -scaled;
  }) as [number, number, number];
  const normalizedMin = sourceMin.map((value, axis) => transformedCoordinate(value, scaleE8, translationMm[axis]!));
  const normalizedMax = sourceMax.map((value, axis) => transformedCoordinate(value, scaleE8, translationMm[axis]!));
  const normalizedBoundsMm = { min: normalizedMin, max: normalizedMax } as const;
  const normalizedExtents = normalizedMax.map((maximum, axis) => maximum - normalizedMin[axis]!);
  if (normalizedExtents.some((extent, axis) => extent > profile.targetEnvelopeMm[axis]!)) throw new Error("GLB_NORMALIZED_ENVELOPE_EXCEEDED");
  const maximumNormalizedExtent = Math.max(...normalizedExtents);
  const aspectRatioE6 = normalizedExtents.map(extent => maximumNormalizedExtent === 0 ? 0 : roundHalfAwayFromZero(extent * 1_000_000, maximumNormalizedExtent));
  const clearanceEnvelopeMm = profile.targetEnvelopeMm.map((extent, axis) => extent - normalizedExtents[axis]!);

  const lodLevel = classification.lod ?? 0;
  const triangleBudget = TRIANGLE_BUDGET_BY_LOD[lodLevel];
  if (!triangleBudget || measured.triangles > triangleBudget) throw new Error("GLB_LOD_TRIANGLE_BUDGET");
  const permittedGridSnap = purpose === "world-environment" || purpose === "world-nature";
  const stepMm = permittedGridSnap ? 1_000 : 0;
  const halfExtents = normalizedExtents.map(extent => roundHalfAwayFromZero(extent, 2)) as [number, number, number];
  const center = normalizedMin.map((minimum, axis) => roundHalfAwayFromZero(minimum + normalizedMax[axis]!, 2)) as [number, number, number];
  const bigExtents = normalizedExtents.map(value => BigInt(value));
  const targetExtents = profile.targetEnvelopeMm.map(value => BigInt(value));
  const volumeMm3 = (bigExtents[0]! * bigExtents[1]! * bigExtents[2]!).toString();
  const volumeBudgetMm3 = (targetExtents[0]! * targetExtents[1]! * targetExtents[2]!).toString();
  const surfaceAreaMm2 = (2n * (bigExtents[0]! * bigExtents[1]! + bigExtents[0]! * bigExtents[2]! + bigExtents[1]! * bigExtents[2]!)).toString();
  const surfaceAreaBudgetMm2 = (2n * (targetExtents[0]! * targetExtents[1]! + targetExtents[0]! * targetExtents[2]! + targetExtents[1]! * targetExtents[2]!)).toString();

  const transformCore = {
    revision: GLB_NORMALIZATION_REVISION,
    sourceSha256,
    axisTransform3x3: IDENTITY_AXIS,
    scaleE8,
    sourcePivotMm,
    translationMm,
  };
  const transformSha256 = sha256(JSON.stringify(transformCore));
  const manifestCore = {
    revision: GLB_NORMALIZATION_REVISION,
    sourceSha256,
    unitConvention: "gltf-rh-y-up-meter" as const,
    unitToMm: GLB_GLB_UNIT_TO_MM,
    axisConvention: "aurion-rh-y-up-forward-z" as const,
    axisTransform3x3: IDENTITY_AXIS,
    sourceBoundsMm,
    normalizedBoundsMm,
    targetEnvelopeMm: profile.targetEnvelopeMm,
    aspectRatioE6,
    clearanceEnvelopeMm,
    scaleE8,
    sourcePivotMm,
    translationMm,
    gridSnap: { permitted: permittedGridSnap, stepMm, aligned: true, errorMm: [0, 0, 0] as const },
    collision: {
      authority: "presentation-envelope-only" as const,
      aabbMm: normalizedBoundsMm,
      obb: { centerMm: center, halfExtentsMm: halfExtents, orientationQ30: IDENTITY_Q30 },
      volumeMm3,
      volumeBudgetMm3,
      surfaceAreaMm2,
      surfaceAreaBudgetMm2,
      triangleCount: measured.triangles,
      triangleBudget,
    },
    lod: {
      level: lodLevel,
      maxRenderDistanceMm: RENDER_DISTANCE_BY_LOD_MM[lodLevel],
      triangleCount: measured.triangles,
      triangleBudget,
    },
    transformSha256,
  };
  return glbNormalizationManifestSchema.parse({ ...manifestCore, manifestSha256: sha256(JSON.stringify(manifestCore)) });
}
