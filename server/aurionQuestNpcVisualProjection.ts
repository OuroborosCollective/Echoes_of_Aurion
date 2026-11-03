import { GLB_IMPORT_VERSION, type GlbRuntimeCatalog } from "../shared/glbImportContract";
import { selectNpcGlb } from "../shared/npcGlbSelection";
import { aurionQuestNpcIds, aurionStarterVillageQuestNpcs } from "./aurionStarterVillageContract";

/** Read-only projection of Aurion-owned, fixed starter-quest NPC anchors. */
export const QUEST_NPC_VISUAL_VERSION = "aurion.quest-npc-visuals.v1" as const;
export const QUEST_NPC_STANDARD_HUMANOID_SHA256 =
  "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc" as const;
export const QUEST_NPC_STANDARD_HUMANOID_ASSET_ID =
  "glb_" + QUEST_NPC_STANDARD_HUMANOID_SHA256.slice(0, 48);

export function projectQuestNpcVisuals(catalog: Pick<GlbRuntimeCatalog, "revision" | "entries">) {
  if (!/^[a-f0-9]{64}$/.test(catalog.revision)) throw new Error("GLB_NPC_CATALOG_REVISION_INVALID");
  const fallbackEntries = catalog.entries.filter(entry => entry.purpose === "npc-fallback" && entry.targetKey === null && typeof entry.displayName === "string");
  const fallbackCatalog = {version: GLB_IMPORT_VERSION, revision: catalog.revision, entries: fallbackEntries};
  const npcs = aurionQuestNpcIds.map(npcId => {
    const npc = aurionStarterVillageQuestNpcs[npcId];
    const assigned = catalog.entries.filter(entry => entry.targetKey === "npc_" + npcId);
    if (assigned.length > 1) throw new Error("GLB_NPC_ASSIGNMENT_DRIFT");
    const asset = assigned[0];
    if (asset && (asset.purpose !== "npc-fallback" || asset.assetType !== "character" ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      asset.storageUrl !== "/api/assets/glb/" + asset.sha256 + ".glb"))
      throw new Error("GLB_NPC_ASSIGNED_MODEL_INVALID");
    // Additive v1 field: old clients keep the audited model, new clients join
    // this approved choice to the same catalog revision before streaming bytes.
    const selected = asset ? null : selectNpcGlb(fallbackCatalog, npcId, null, 2, "phone");
    const parents = selected ? fallbackEntries.filter(entry =>
      (entry.assetId === selected.entry.assetId && entry.sha256 === selected.entry.sha256)
      || entry.lods?.some(lod => lod.assetId === selected.entry.assetId && lod.sha256 === selected.entry.sha256)) : [];
    if (selected && parents.length !== 1) throw new Error("GLB_NPC_FALLBACK_DRIFT");
    const fallback = parents[0];
    if (fallback && (!/^[a-f0-9]{64}$/.test(fallback.sha256) || fallback.storageUrl !== "/api/assets/glb/" + fallback.sha256 + ".glb"))
      throw new Error("GLB_NPC_FALLBACK_INVALID");
    return Object.freeze({
      ...(fallback ? {fallbackModel: Object.freeze({source: "approved-fallback" as const, catalogAssetId: fallback.assetId, sha256: fallback.sha256})} : {}),
      entityId: "npc:" + npc.id,
      npcId: npc.id,
      displayName: npc.displayName,
      position: Object.freeze({x: npc.position.x, z: npc.position.z}),
      model: asset
        ? Object.freeze({source: "approved-assignment" as const, catalogAssetId: asset.assetId, sha256: asset.sha256})
        : Object.freeze({source: "audited-standard" as const, catalogAssetId: QUEST_NPC_STANDARD_HUMANOID_ASSET_ID, sha256: QUEST_NPC_STANDARD_HUMANOID_SHA256}),
    });
  });
  return Object.freeze({
    version: QUEST_NPC_VISUAL_VERSION,
    zoneId: "observatory_threshold" as const,
    stateSource: "aurion-canonical-quest-anchors" as const,
    catalogRevision: catalog.revision,
    npcs: Object.freeze(npcs),
  });
}
