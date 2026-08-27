import { aurionAssets } from "@/lib/aurionAssets";
import { wasdGlbCatalog, wasdGlbSourceRevision, type WasdGlbAsset } from "@/lib/wasdGlbCatalog";

export const AURION_GLB_USAGE_PLAN_VERSION = "aurion-glb-usage-plan.v1" as const;

export type GlbUsageTarget = "tower_observatory" | "tower_quarters" | "tower_storage" | "tower_guest_space" | "open_world" | "expedition" | "character_loadout";
export type GlbRuntimeDisposition = "runtime_load" | "prepare_lod" | "parser_review";

export type GlbUsagePlanEntry = {
  readonly id: string;
  readonly sourceUrl: string;
  readonly sourceRevision: string;
  readonly sourceHash: string | null;
  readonly role: WasdGlbAsset["role"] | "aurion_native";
  readonly target: GlbUsageTarget;
  readonly runtimeDisposition: GlbRuntimeDisposition;
  readonly bytes: number | null;
  readonly triangleEstimate: number | null;
};

export type GlbUsagePlan = {
  readonly version: typeof AURION_GLB_USAGE_PLAN_VERSION;
  readonly sourceRevision: typeof wasdGlbSourceRevision;
  readonly entries: readonly GlbUsagePlanEntry[];
  readonly deterministicHash: string;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareText).map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function deterministicHash(value: unknown): string {
  let state = 2166136261;
  for (const character of stableStringify(value)) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return `fnv1a-${(state >>> 0).toString(16).padStart(8, "0")}`;
}

function nativeEntry(id: string, sourceUrl: string, target: GlbUsageTarget): GlbUsagePlanEntry {
  return { id, sourceUrl, sourceRevision: "aurion-native-manifest", sourceHash: null, role: "aurion_native", target, runtimeDisposition: "runtime_load", bytes: null, triangleEstimate: null };
}

function targetForWasdRole(role: WasdGlbAsset["role"]): GlbUsageTarget {
  if (role === "structure") return "tower_quarters";
  if (role === "equipment") return "tower_storage";
  if (role === "character") return "tower_guest_space";
  if (role === "weapon") return "character_loadout";
  if (role === "enemy") return "expedition";
  return "open_world";
}

function dispositionForWasdAsset(asset: WasdGlbAsset): GlbRuntimeDisposition {
  return asset.budgetStatus === "streamable" ? "runtime_load" : asset.budgetStatus === "lod_required" ? "prepare_lod" : "parser_review";
}

const nativeEntries: readonly GlbUsagePlanEntry[] = [
  nativeEntry("aurion_floor_kit", aurionAssets.floorKit, "tower_observatory"),
  nativeEntry("aurion_archway", aurionAssets.archway, "tower_observatory"),
  nativeEntry("aurion_wayfinder", aurionAssets.wayfinder, "character_loadout"),
  nativeEntry("aurion_veilguard", aurionAssets.veilguard, "tower_guest_space"),
  nativeEntry("aurion_astralwisp", aurionAssets.glbCandidates.astralwisp, "tower_observatory"),
  nativeEntry("aurion_return_stone", aurionAssets.glbCandidates.returnStone, "tower_storage"),
  nativeEntry("aurion_starpath_archway", aurionAssets.glbCandidates.starpathArchway, "open_world"),
  nativeEntry("aurion_tripo_flower_shrub", aurionAssets.glbCandidates.tripoFlowerShrub, "open_world"),
  nativeEntry("aurion_tripo_starpath_marker", aurionAssets.glbCandidates.tripoStarpathMarker, "open_world"),
  nativeEntry("aurion_tripo_garden_border", aurionAssets.glbCandidates.tripoGardenBorder, "open_world"),
];

export function buildDeterministicGlbUsagePlan(): GlbUsagePlan {
  const entries = [
    ...nativeEntries,
    ...wasdGlbCatalog.map((asset): GlbUsagePlanEntry => ({
      id: asset.id,
      sourceUrl: asset.sourceUrl,
      sourceRevision: wasdGlbSourceRevision,
      sourceHash: asset.sha256,
      role: asset.role,
      target: targetForWasdRole(asset.role),
      runtimeDisposition: dispositionForWasdAsset(asset),
      bytes: asset.bytes,
      triangleEstimate: asset.triangleEstimate,
    })),
  ].slice().sort((left, right) => compareText(left.id, right.id));
  const snapshot = { version: AURION_GLB_USAGE_PLAN_VERSION, sourceRevision: wasdGlbSourceRevision, entries };
  return Object.freeze({ ...snapshot, deterministicHash: deterministicHash(snapshot) });
}

export const deterministicGlbUsagePlan = buildDeterministicGlbUsagePlan();

export const essentialTowerGlbPlan = deterministicGlbUsagePlan.entries.filter(entry => entry.id === "aurion_astralwisp" || entry.id === "aurion_return_stone" || entry.id === "aurion_starpath_archway");
