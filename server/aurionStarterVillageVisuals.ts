import { worldAssetRegion } from "../shared/worldAssetProtocol";
import { AURION_STARTER_VILLAGE_CONTRACT_VERSION } from "../shared/aurionStarterVillageContract";

/** Renderer-only attachment to a protected DB-backed chunk readback. */
export function attachStarterVillageVisuals<T extends { base: { worldId: string; coordinate: { x: number; z: number } } }>(readback: T, coordinate: { x: number; z: number }, worldSeed: string) {
  if (readback.base.coordinate.x !== coordinate.x || readback.base.coordinate.z !== coordinate.z) throw new Error("STARTER_VILLAGE_CHUNK_COORDINATE_MISMATCH");
  if (coordinate.x !== 0 || coordinate.z !== 0) return readback;
  const region = worldAssetRegion(readback.base.worldId, worldSeed, coordinate);
  const placements = region.placements.filter(p => p.id.startsWith(`${AURION_STARTER_VILLAGE_CONTRACT_VERSION}:`));
  if (placements.length !== 10) throw new Error("STARTER_VILLAGE_CONTRACT_COUNT_CHANGED");
  return { ...readback, starterVillageVisuals: {version:"aurion.starter-village-visuals.v1" as const, catalogHash: region.catalogHash, collisionHash: region.collisionHash, worldId: region.worldId, center: region.center, placements} };
}
