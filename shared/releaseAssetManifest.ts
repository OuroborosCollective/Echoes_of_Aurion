import { AURION_RELEASE_BUDGET, assertRuntimeBinaryLimit, assertRuntimeIntegerInRange } from "./runtimeContracts";

export type ReleaseAssetMetric = {
  id: string;
  assetPath: string;
  bytes: number;
  triangles: number;
  materials: number;
  textures: number;
  skins: number;
  animations: number;
};

export const baselineReleaseAssets: readonly ReleaseAssetMetric[] = [];

export function assertReleaseAssetBudget(asset: ReleaseAssetMetric): ReleaseAssetMetric {
  if (!asset.assetPath.startsWith("/manus-storage/") || !asset.assetPath.endsWith(".glb")) throw new Error(`${asset.id}: freigegebener S3-GLB-Pfad erforderlich.`);
  assertRuntimeBinaryLimit(asset.bytes, AURION_RELEASE_BUDGET.maxCommunityGlbBytes, `${asset.id}: GLB überschreitet die Community-/Release-Grenze.`);
  assertRuntimeIntegerInRange(asset.triangles, 1, AURION_RELEASE_BUDGET.maxMobileCharacterTriangles, `${asset.id}: Dreiecksbudget für mobile Charaktere überschritten.`);
  assertRuntimeIntegerInRange(asset.materials, 1, 2, `${asset.id}: Materialbudget überschritten.`);
  assertRuntimeIntegerInRange(asset.textures, 0, 2, `${asset.id}: Textureinsatz überschreitet das Baseline-Budget.`);
  assertRuntimeIntegerInRange(asset.skins, 1, 1, `${asset.id}: genau ein bipedales Skin erforderlich.`);
  assertRuntimeIntegerInRange(asset.animations, 3, 8, `${asset.id}: Idle-, Walk- und Run-Animationen erforderlich.`);
  return asset;
}
