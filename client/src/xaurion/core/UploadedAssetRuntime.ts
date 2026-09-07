import type { GlbCatalogEntry, GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { WORLD_CHUNK_SIZE_MM, type WorldChunkCoordinate } from "@shared/worldChunkProtocol";

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash >>> 0;
}

const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const byIdentity = (left: GlbCatalogEntry, right: GlbCatalogEntry) => left.assetId.localeCompare(right.assetId) || left.sha256.localeCompare(right.sha256);

export function publicPlayerCharacterCatalog(catalog: GlbRuntimeCatalog): readonly GlbCatalogEntry[] {
  return Object.freeze(catalog.entries
    .filter(entry => entry.purpose === "player-public" && entry.assetType === "character" && entry.targetKey === null)
    .slice()
    .sort(byIdentity));
}

export function selectEquipmentCatalogAsset(
  catalog: GlbRuntimeCatalog,
  slot: GlbEquipmentSlot,
  confirmedItemIdentity: string,
): GlbCatalogEntry | null {
  if (!confirmedItemIdentity) return null;
  const candidates = catalog.entries
    .filter(entry => entry.purpose === "equipment" && entry.equipmentSlot === slot && (entry.assetType === "weapon" || entry.assetType === "armor"))
    .slice()
    .sort(byIdentity);
  if (!candidates.length) return null;
  return candidates[fnv1a(`aurion-equipment-v1:${slot}:${confirmedItemIdentity}`) % candidates.length] ?? null;
}

export type UploadedWorldVisualPlacement = Readonly<{
  id: string;
  asset: GlbCatalogEntry;
  xMm: number;
  zMm: number;
  rotationQuarterTurns: 0 | 1 | 2 | 3;
}>;

const ENVIRONMENT_ANCHORS = Object.freeze([
  [-24, -24], [24, -24], [-24, 24], [24, 24], [-24, 0], [24, 0],
] as const);
const NATURE_ANCHORS = Object.freeze([
  [-24, -24], [-8, -24], [8, -24], [24, -24], [-24, 24], [-8, 24], [8, 24], [24, 24],
] as const);

/**
 * Presentation-only deterministic placements for admin-approved uploaded world GLBs.
 * The central road/spawn cross stays clear and no collision, interaction, teleport,
 * quest, loot or world mutation authority is derived from these placements.
 */
export function uploadedWorldVisualsForChunk(
  catalog: GlbRuntimeCatalog,
  coordinate: WorldChunkCoordinate,
): readonly UploadedWorldVisualPlacement[] {
  const settlement = mod(coordinate.x, 6) < 2 && mod(coordinate.z, 6) < 2;
  const purpose = settlement ? "world-environment" : "world-nature";
  const assets = catalog.entries
    .filter(entry => entry.purpose === purpose && entry.assetType === "arena" && entry.targetKey === null)
    .slice()
    .sort(byIdentity);
  if (!assets.length) return Object.freeze([]);

  const anchors = settlement ? ENVIRONMENT_ANCHORS : NATURE_ANCHORS;
  const limit = Math.min(anchors.length, assets.length * 2, 8);
  const start = fnv1a(`aurion-uploaded-world-v1:${catalog.revision}:${coordinate.x}:${coordinate.z}:${purpose}`);
  const result: UploadedWorldVisualPlacement[] = [];
  for (let index = 0; index < limit; index += 1) {
    const anchor = anchors[index]!;
    const asset = assets[(start + index) % assets.length]!;
    const rotationQuarterTurns = ((start >>> ((index % 4) * 4)) + index) % 4 as 0 | 1 | 2 | 3;
    result.push(Object.freeze({
      id: `uploaded:${catalog.revision.slice(0, 12)}:${coordinate.x}:${coordinate.z}:${index}:${asset.assetId}`,
      asset,
      xMm: coordinate.x * WORLD_CHUNK_SIZE_MM + anchor[0] * 1000,
      zMm: coordinate.z * WORLD_CHUNK_SIZE_MM + anchor[1] * 1000,
      rotationQuarterTurns,
    }));
  }
  return Object.freeze(result);
}
