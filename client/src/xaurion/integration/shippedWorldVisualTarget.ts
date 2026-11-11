import { proceduralPlacementChunk, worldAssetById } from "@shared/worldAssetProtocol";
import { shippedPlacementRef, type WorldVisualTargetData } from "@shared/worldVisualOverrideContract";

/** `userData` an instanced world batch carries: instance index -> Aurion placement id. */
export type ShippedWorldBatchData = Readonly<{ worldPlacementIds?: readonly string[]; worldPlacementAssetId?: string }>;

/**
 * Admin target of one instance of a shipped (procedural) world model, so trees, rocks,
 * flowers and road houses are addressable one by one. Only the addressing: whether a
 * removal or replacement is allowed is decided by the Aurion server.
 *
 * The fixed starter-village pieces (walls, gates) are not procedural placements and are
 * not addressable here; they return null.
 */
export function shippedWorldVisualTarget(data: ShippedWorldBatchData | null | undefined, instanceId: number | undefined): WorldVisualTargetData | null {
  const ids = data?.worldPlacementIds;
  if (!Array.isArray(ids) || instanceId === undefined || !Number.isInteger(instanceId) || instanceId < 0) return null;
  const placementId = ids[instanceId];
  if (typeof placementId !== "string" || !proceduralPlacementChunk(placementId)) return null;
  const asset = data?.worldPlacementAssetId ? worldAssetById.get(data.worldPlacementAssetId) : undefined;
  let placementRef: string;
  try { placementRef = shippedPlacementRef(placementId); } catch { return null; }
  return Object.freeze({ placementRef, targetKind: "shipped_placement", assetId: null, displayName: asset?.name ?? "Welt-Objekt" });
}
