import { wasdGlbCatalog, wasdGlbSourceRevision, type WasdGlbAsset } from "./wasdGlbCatalog";

/**
 * Scene mappings are catalog evidence, not runtime activation. A scene load requires
 * separate Babylon readback and an explicit ACTIVE transition after all gates pass.
 */
export type WasdSceneAssetAssignment = {
  asset: WasdGlbAsset;
  target: "emberfall_settlement_water_source";
  status: "INACTIVE" | "ACTIVE";
  category: "PROP";
  rightsStatus: "VERIFIED";
  sourceRevision: typeof wasdGlbSourceRevision;
  requiredReadback: readonly ["babylon_visible_mesh", "runtime_memory_budget", "no_fallback_texture"];
};

function streamableAsset(id: string): WasdGlbAsset {
  const asset = wasdGlbCatalog.find(candidate => candidate.id === id);
  if (!asset || asset.budgetStatus !== "streamable") throw new Error(`Missing streamable Wasd scene candidate: ${id}`);
  return asset;
}

export const wasdAurionSceneAssetAssignments: readonly WasdSceneAssetAssignment[] = Object.freeze([
  Object.freeze({
    asset: streamableAsset("wasd_d043b07bc436ceb2"),
    target: "emberfall_settlement_water_source",
    status: "INACTIVE",
    category: "PROP",
    rightsStatus: "VERIFIED",
    sourceRevision: wasdGlbSourceRevision,
    requiredReadback: ["babylon_visible_mesh", "runtime_memory_budget", "no_fallback_texture"] as const,
  }),
]);

export const wasdAurionSceneAssetSummary = Object.freeze({
  sourceRevision: wasdGlbSourceRevision,
  mappedCandidates: wasdAurionSceneAssetAssignments.length,
  activeCandidates: wasdAurionSceneAssetAssignments.filter(candidate => candidate.status === "ACTIVE").length,
  inactiveCandidates: wasdAurionSceneAssetAssignments.filter(candidate => candidate.status === "INACTIVE").length,
});
