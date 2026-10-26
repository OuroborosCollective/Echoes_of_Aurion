import type { GlbRuntimeCatalog } from "../shared/glbImportContract";
import { aurionQuestNpcIds, aurionStarterVillageQuestNpcs } from "./aurionStarterVillageContract";

/** Read-only projection of Aurion-owned, fixed starter-quest NPC anchors. */
export const QUEST_NPC_VISUAL_VERSION = "aurion.quest-npc-visuals.v1" as const;
export const QUEST_NPC_STANDARD_HUMANOID_SHA256 =
  "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc" as const;
export const QUEST_NPC_STANDARD_HUMANOID_ASSET_ID =
  "glb_" + QUEST_NPC_STANDARD_HUMANOID_SHA256.slice(0, 48);

export function projectQuestNpcVisuals(catalog: Pick<GlbRuntimeCatalog, "revision" | "entries">) {
  if (!/^[a-f0-9]{64}$/.test(catalog.revision)) throw new Error("GLB_NPC_CATALOG_REVISION_INVALID");
  const npcs = aurionQuestNpcIds.map(npcId => {
    const npc = aurionStarterVillageQuestNpcs[npcId];
    const assigned = catalog.entries.filter(entry => entry.targetKey === "npc_" + npcId);
    if (assigned.length > 1) throw new Error("GLB_NPC_ASSIGNMENT_DRIFT");
    const asset = assigned[0];
    if (asset && (asset.purpose !== "npc-fallback" || asset.assetType !== "character" ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      asset.storageUrl !== "/api/assets/glb/" + asset.sha256 + ".glb"))
      throw new Error("GLB_NPC_ASSIGNED_MODEL_INVALID");
    return Object.freeze({
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
