import type { GlbCatalogEntry, GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { isStarterCityWallSource } from "@shared/aurionStarterCityWallContract";
import { WORLD_CHUNK_SIZE_MM, type WorldChunkCoordinate } from "@shared/worldChunkProtocol";
import { WORLD_ROAD_WIDTH_MM } from "@shared/worldRoadNetwork";
import { touchesStarterCityGround } from "../world/starterCityGround";
import {
  AURION_RETURN_STONE_ASSET_ID,
  AURION_RETURN_STONE_CONTRACT_VERSION,
  AURION_RETURN_STONE_POSITION,
  AURION_RETURN_STONE_SOURCE_SHA256,
} from "@shared/aurionReturnStoneContract";
import {
  AURION_VILLAGE_FOUNTAIN_CONTRACT_VERSION,
  AURION_VILLAGE_FOUNTAIN_LODS,
  AURION_VILLAGE_FOUNTAIN_POSITION,
} from "@shared/aurionVillageFountainContract";
import {
  AURION_VILLAGE_STREET_LAMP_CONTRACT_VERSION,
  AURION_VILLAGE_STREET_LAMP_LODS,
  AURION_VILLAGE_STREET_LAMP_PLACEMENTS,
} from "@shared/aurionVillageStreetLampContract";

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
  scalePermille?: number;
}>;

/** Longest edge a world visual is fitted to, by catalog subcategory (metres). */
export function targetSizeMeters(subcategory: string | null): number {
  if (subcategory === "building") return 9;
  if (subcategory === "structure") return 5;
  if (subcategory === "teleporter") return 3.2;
  if (subcategory === "fountain") return 2.4;
  if (subcategory === "street-prop") return 1.8;
  if (subcategory === "tree") return 7;
  if (subcategory === "plant") return 1.2;
  if (subcategory === "rock") return 2.6;
  return 2.5;
}

/**
 * Design rules of the automatic uploaded-model layout (owner design brief 2026-11-10),
 * the same rules the Aurion placement plan follows (`shared/worldAssetProtocol`):
 *  - nothing automatic inside the starter city walls (plus clearance);
 *  - houses and structures only on a lot adjoining the canonical road network;
 *  - nothing stands on a road;
 *  - trees never outnumber flowers and grasses.
 * An anchor index is a fixed location of its chunk and admits one class of model, so
 * the admin reference `uploaded:<chunkX>:<chunkZ>:<anchor>` always means the same spot.
 */
export type UploadedAnchorClass = "road-lot" | "verge" | "garden" | "wild";
type Anchor = Readonly<{ kind: UploadedAnchorClass; x: number; z: number; corner?: number }>;
const ROAD_LOT_GAP_M = 1;
const VERGE_GAP_M = 0.6;
const VERGE_ALONG_M = 16.25;
const ROAD_WIDTH_M = WORLD_ROAD_WIDTH_MM / 1000;
const CORNERS = Object.freeze([[1, 1], [-1, 1], [1, -1], [-1, -1]] as const);
/** Road lots: the four corners of the chunk's crossing; x/z are the side of each road. */
const ROAD_LOTS: readonly Anchor[] = Object.freeze(CORNERS.map(([x, z], corner) => Object.freeze({ kind: "road-lot" as const, x, z, corner })));
/** Street furniture: on the verge of each road side, clear of lots and houses (x or z 0 = across that axis). */
const VERGES: readonly Anchor[] = Object.freeze([
  { kind: "verge" as const, x: 1, z: 0 }, { kind: "verge" as const, x: -1, z: 0 },
  { kind: "verge" as const, x: 0, z: 1 }, { kind: "verge" as const, x: 0, z: -1 },
].map(anchor => Object.freeze(anchor)));
/** Gardens behind the houses of a settlement chunk. */
const GARDENS: readonly Anchor[] = Object.freeze(CORNERS.map(([x, z]) => Object.freeze({ kind: "garden" as const, x: x * 24, z: z * 24 })));
/** Wilderness: the four centre cells the Aurion placement plan leaves empty. */
const WILDS: readonly Anchor[] = Object.freeze(CORNERS.map(([x, z], corner) => Object.freeze({ kind: "wild" as const, x: x * 8, z: z * 8, corner })));
const SETTLEMENT_ANCHORS: readonly Anchor[] = Object.freeze([...ROAD_LOTS, ...VERGES, ...GARDENS]);
/** A wilderness cell and the road lot of the same corner share ground: the lot, listed first, wins. */
const NATURE_ANCHORS: readonly Anchor[] = Object.freeze([...ROAD_LOTS.slice(0, 2), ...WILDS]);

export const isRoadBoundUploadedAsset = (asset: Pick<GlbCatalogEntry, "subcategory">) => asset.subcategory === "building" || asset.subcategory === "structure";
const isUploadedTree = (asset: Pick<GlbCatalogEntry, "subcategory">) => asset.subcategory === "tree";
const isUploadedFlora = (asset: Pick<GlbCatalogEntry, "subcategory">) => asset.subcategory === "plant";
const isGardenAsset = (asset: Pick<GlbCatalogEntry, "subcategory">) => isUploadedTree(asset) || isUploadedFlora(asset) || asset.subcategory === "rock";
const ANCHOR_POOL: Readonly<Record<UploadedAnchorClass, (asset: GlbCatalogEntry) => boolean>> = Object.freeze({
  "road-lot": isRoadBoundUploadedAsset,
  verge: asset => !isRoadBoundUploadedAsset(asset) && !isGardenAsset(asset),
  garden: isGardenAsset,
  wild: asset => !isRoadBoundUploadedAsset(asset),
});
/** Offset across a road strip `[0 m, 4 m)`: beside the kerb on the given side. */
const besideRoad = (side: number, half: number, gap: number) => side < 0 ? -(gap + half) : ROAD_WIDTH_M + gap + half;
/** Chunk-local centre (metres) of an anchor for a model with this half footprint. */
function anchorOffset(anchor: Anchor, half: number): readonly [number, number] {
  if (anchor.kind === "road-lot") return [besideRoad(anchor.x, half, ROAD_LOT_GAP_M), besideRoad(anchor.z, half, ROAD_LOT_GAP_M)];
  if (anchor.kind === "verge") return anchor.x ? [besideRoad(anchor.x, half, VERGE_GAP_M), VERGE_ALONG_M] : [VERGE_ALONG_M, besideRoad(anchor.z, half, VERGE_GAP_M)];
  return [anchor.x, anchor.z];
}
/**
 * Flowers and grasses the Aurion plan guarantees over its own trees in a chunk. Open
 * wilderness: at least 6 flora against at most 3 trees. Settlements and the chunks the
 * city wall reaches into guarantee none, so uploaded trees need uploaded flora there.
 */
const floraSurplus = (coordinate: WorldChunkCoordinate, settlement: boolean) =>
  settlement || (Math.abs(coordinate.x) <= 1 && Math.abs(coordinate.z) <= 1) ? 0 : 3;

/**
 * Resolve only the immutable owner-supplied return-stone GLB from the approved
 * catalog. The binding is exact SHA + asset identity + purpose/category and is
 * presentation-only. Absence or mismatch fails closed to no visual.
 */
export function returnStoneCatalogAsset(catalog: GlbRuntimeCatalog): GlbCatalogEntry | null {
  const expectedUrl = `/api/assets/glb/${AURION_RETURN_STONE_SOURCE_SHA256}.glb`;
  return catalog.entries.find(entry =>
    entry.assetId === AURION_RETURN_STONE_ASSET_ID
    && entry.sha256 === AURION_RETURN_STONE_SOURCE_SHA256
    && entry.storageUrl === expectedUrl
    && entry.purpose === "world-environment"
    && entry.assetType === "arena"
    && entry.subcategory === "teleporter"
    && entry.targetKey === null
  ) ?? null;
}

/** Dedicated visual placement for the live return stone at the confirmed zone
 * origin. This function creates no interaction or gameplay authority. */
export function returnStoneVisualPlacement(catalog: GlbRuntimeCatalog): UploadedWorldVisualPlacement | null {
  const asset = returnStoneCatalogAsset(catalog);
  if (!asset) return null;
  return Object.freeze({
    id: `${AURION_RETURN_STONE_CONTRACT_VERSION}:${catalog.revision.slice(0, 12)}:${asset.assetId}`,
    asset,
    xMm: AURION_RETURN_STONE_POSITION.x,
    zMm: AURION_RETURN_STONE_POSITION.z,
    rotationQuarterTurns: 0,
  });
}

export function villageFountainCatalogAsset(catalog: GlbRuntimeCatalog): GlbCatalogEntry | null {
  const [lod1, lod2] = AURION_VILLAGE_FOUNTAIN_LODS;
  return catalog.entries.find(entry => {
    const lods = entry.lods ?? [];
    return entry.assetId === lod1.assetId
      && entry.sha256 === lod1.sha256
      && entry.storageUrl === `/api/assets/glb/${lod1.sha256}.glb`
      && entry.purpose === "world-environment"
      && entry.assetType === "arena"
      && entry.subcategory === "fountain"
      && entry.targetKey === null
      && lods.length === 2
      && lods[0]?.level === 1
      && lods[0]?.assetId === lod1.assetId
      && lods[0]?.sha256 === lod1.sha256
      && lods[0]?.bytes === lod1.bytes
      && lods[1]?.level === 2
      && lods[1]?.assetId === lod2.assetId
      && lods[1]?.sha256 === lod2.sha256
      && lods[1]?.bytes === lod2.bytes;
  }) ?? null;
}

export function villageFountainVisualPlacement(catalog: GlbRuntimeCatalog): UploadedWorldVisualPlacement | null {
  const asset = villageFountainCatalogAsset(catalog);
  if (!asset) return null;
  return Object.freeze({
    id: `${AURION_VILLAGE_FOUNTAIN_CONTRACT_VERSION}:${catalog.revision.slice(0, 12)}:${asset.assetId}`,
    asset,
    xMm: AURION_VILLAGE_FOUNTAIN_POSITION.x,
    zMm: AURION_VILLAGE_FOUNTAIN_POSITION.z,
    rotationQuarterTurns: 0,
  });
}

export function villageStreetLampCatalogAsset(catalog: GlbRuntimeCatalog): GlbCatalogEntry | null {
  const [lod0, lod1, lod2, lod3] = AURION_VILLAGE_STREET_LAMP_LODS;
  return catalog.entries.find(entry => {
    const lods = entry.lods ?? [];
    return entry.assetId === lod0.assetId
      && entry.sha256 === lod0.sha256
      && entry.storageUrl === `/api/assets/glb/${lod0.sha256}.glb`
      && entry.purpose === "world-environment"
      && entry.assetType === "arena"
      && entry.subcategory === "street-prop"
      && entry.targetKey === null
      && lods.length === 4
      && [lod0, lod1, lod2, lod3].every((expected, index) =>
        lods[index]?.level === expected.level
        && lods[index]?.assetId === expected.assetId
        && lods[index]?.sha256 === expected.sha256
        && lods[index]?.bytes === expected.bytes
      );
  }) ?? null;
}

export function villageStreetLampVisualPlacements(catalog: GlbRuntimeCatalog): readonly UploadedWorldVisualPlacement[] {
  const asset = villageStreetLampCatalogAsset(catalog);
  if (!asset) return Object.freeze([]);
  return Object.freeze(AURION_VILLAGE_STREET_LAMP_PLACEMENTS.map(placement => Object.freeze({
    id: `${AURION_VILLAGE_STREET_LAMP_CONTRACT_VERSION}:${catalog.revision.slice(0, 12)}:${placement.key}:${asset.assetId}`,
    asset,
    xMm: placement.x,
    zMm: placement.z,
    rotationQuarterTurns: placement.rotationQuarterTurns,
  })));
}

/**
 * Presentation-only deterministic placements for admin-approved uploaded world GLBs.
 * They follow the owner design rules above; no collision, interaction, teleport,
 * quest, loot or world mutation authority is derived from these placements.
 * The exact return-stone GLB is reserved for the dedicated city-centre projection.
 */
export function uploadedWorldVisualsForChunk(
  catalog: GlbRuntimeCatalog,
  coordinate: WorldChunkCoordinate,
): readonly UploadedWorldVisualPlacement[] {
  const settlement = mod(coordinate.x, 6) < 2 && mod(coordinate.z, 6) < 2;
  const purpose = settlement ? "world-environment" : "world-nature";
  const assets = catalog.entries
    .filter(entry => entry.purpose === purpose
      && entry.assetType === "arena"
      && entry.targetKey === null
      && entry.sha256 !== AURION_RETURN_STONE_SOURCE_SHA256
      && !isStarterCityWallSource(entry.sha256)
      && !AURION_VILLAGE_FOUNTAIN_LODS.some(lod => lod.sha256 === entry.sha256)
      && !AURION_VILLAGE_STREET_LAMP_LODS.some(lod => lod.sha256 === entry.sha256))
    .slice()
    .sort(byIdentity);
  if (!assets.length) return Object.freeze([]);

  const anchors = settlement ? SETTLEMENT_ANCHORS : NATURE_ANCHORS;
  const start = fnv1a(`aurion-uploaded-world-v1:${catalog.revision}:${coordinate.x}:${coordinate.z}:${purpose}`);
  const pools = new Map<UploadedAnchorClass, GlbCatalogEntry[]>();
  const used = new Map<UploadedAnchorClass, number>();
  const corners = new Set<number>();
  const result: UploadedWorldVisualPlacement[] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index]!;
    let pool = pools.get(anchor.kind);
    if (!pool) pools.set(anchor.kind, pool = assets.filter(ANCHOR_POOL[anchor.kind]));
    const count = used.get(anchor.kind) ?? 0;
    // As before, a model repeats at most twice per chunk.
    if (!pool.length || count >= pool.length * 2) continue;
    if (anchor.corner !== undefined && corners.has(anchor.corner)) continue;
    used.set(anchor.kind, count + 1);
    const asset = pool[(start + index) % pool.length]!;
    const half = targetSizeMeters(asset.subcategory) / 2;
    const [dx, dz] = anchorOffset(anchor, half);
    const xMm = coordinate.x * WORLD_CHUNK_SIZE_MM + Math.round(dx * 1000);
    const zMm = coordinate.z * WORLD_CHUNK_SIZE_MM + Math.round(dz * 1000);
    // The starter city inside the walls is hand-designed: nothing automatic stands there.
    if (touchesStarterCityGround(xMm / 1000, zMm / 1000, half)) continue;
    if (anchor.corner !== undefined) corners.add(anchor.corner);
    const rotationQuarterTurns = ((start >>> ((index % 4) * 4)) + index) % 4 as 0 | 1 | 2 | 3;
    result.push(Object.freeze({
      id: `uploaded:${catalog.revision.slice(0, 12)}:${coordinate.x}:${coordinate.z}:${index}:${asset.assetId}`,
      asset,
      xMm,
      zMm,
      rotationQuarterTurns,
    }));
  }
  // More flowers and grasses than trees: drop the trees the chunk's flora does not outnumber.
  const flora = result.filter(placement => isUploadedFlora(placement.asset)).length;
  let surplusTrees = result.filter(placement => isUploadedTree(placement.asset)).length - Math.max(0, floraSurplus(coordinate, settlement) + flora - 1);
  for (let index = result.length - 1; index >= 0 && surplusTrees > 0; index -= 1) {
    if (isUploadedTree(result[index]!.asset)) { result.splice(index, 1); surplusTrees -= 1; }
  }
  return Object.freeze(result);
}
