import collision from "./worldCollisionManifest.json" with { type: "json" };
import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "./aurionStarterCityWallContract";
import { z } from "zod";
import catalog from "./worldAssetCatalog.json" with { type: "json" };
import { WORLD_CHUNK_COORDINATE_LIMIT, type WorldChunkCoordinate } from "./worldChunkProtocol";
import { AURION_STARTER_VILLAGE_ASSET_PLACEMENTS, AURION_STARTER_VILLAGE_CONTRACT_VERSION } from "./aurionStarterVillageContract";
import { WORLD_ROAD_WIDTH_MM, type WorldGroundRectMm } from "./worldRoadNetwork";
export const WORLD_ASSET_VERSION = "aurion-world-assets.v1" as const;
export const worldAssetCatalog = catalog;
export type WorldAsset = typeof catalog.assets[number];
export const worldAssetById = new Map(catalog.assets.map(a => [a.id, a]));
const coordinate = z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT);
export const worldAssetRegionInput = z.object({ x: coordinate, z: coordinate }).strict();
const placement = z.object({ id: z.string(), assetId: z.string().refine(id => worldAssetById.has(id)), xMm: z.number().int().safe(), zMm: z.number().int().safe(), rotation: z.number().int().min(0).max(3) }).strict();
export const legacyWorldAssetRegionSchema = z.object({ version: z.literal(WORLD_ASSET_VERSION), catalogHash: z.literal(catalog.bundleSha256), worldId: z.string().min(1), center: worldAssetRegionInput, placements: z.array(placement).max(108) }).strict();
export const worldAssetRegionSchema = legacyWorldAssetRegionSchema.extend({ version: z.literal("aurion-world-assets.v2"), collisionHash: z.literal(collision.manifestSha256), collisionVersion: z.literal(collision.version) }).strict();
export type WorldAssetPlacement = z.infer<typeof placement>;
export type WorldAssetRegion = z.infer<typeof worldAssetRegionSchema>;
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
function seedHash(seed: string): number { let hash=2166136261; for(const c of seed) hash=Math.imul(hash^c.charCodeAt(0),16777619); return hash>>>0; }
/** Deterministic 32-bit integer mix; no clock, no Math.random, identical on server and client. */
function mix(...values: number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) { hash = Math.imul(hash ^ (value | 0), 0x9e3779b1); hash ^= hash >>> 15; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; }
  return hash >>> 0;
}
const city = catalog.assets.filter(a => a.family === "city"), nature = catalog.assets.filter(a => a.family === "nature");

/** Largest approved LOD envelope of an asset on the ground, centred like `WorldAssetProjection` renders it. */
const footprints = new Map(catalog.assets.map(asset => [asset.id, Object.freeze({
  halfX: Math.ceil(Math.max(...asset.lods.map(lod => lod.bounds.max[0]! - lod.bounds.min[0]!)) * asset.scale * 500),
  halfZ: Math.ceil(Math.max(...asset.lods.map(lod => lod.bounds.max[2]! - lod.bounds.min[2]!)) * asset.scale * 500),
})]));
export function worldAssetFootprintMm(asset: WorldAsset, rotation: number): { halfX: number; halfZ: number } {
  const base = footprints.get(asset.id);
  if (!base) throw Error("WORLD_ASSET_CATALOG_MISSING");
  return rotation % 2 === 0 ? { halfX: base.halfX, halfZ: base.halfZ } : { halfX: base.halfZ, halfZ: base.halfX };
}
export function worldAssetGroundRectMm(asset: WorldAsset, placement: Pick<WorldAssetPlacement, "xMm" | "zMm" | "rotation">): WorldGroundRectMm {
  const { halfX, halfZ } = worldAssetFootprintMm(asset, placement.rotation);
  return { minX: placement.xMm - halfX, maxX: placement.xMm + halfX, minZ: placement.zMm - halfZ, maxZ: placement.zMm + halfZ };
}

/**
 * The published city-wall GLB encloses the origin across multiple 64 m chunks.
 * Owner design brief 2026-11-10: the starter village inside the walls is a flat,
 * hand-designed plane. NO procedural placement of any family (houses, trees, rocks,
 * flowers, props) may stand inside the measured 110 x 110 m wall footprint plus 6 m
 * of construction clearance. The matching nature colliders disappear together with
 * their placements because `WorldNatureCollision` derives them from this same plan.
 * Only the authored starter-village contract of the origin chunk remains.
 */
export const STARTER_CITY_PROCEDURAL_CLEARANCE_MM = 6_000;
export function intersectsStarterCityWallClearance(
  asset: WorldAsset,
  placement: Pick<WorldAssetPlacement, "xMm" | "zMm" | "rotation">,
): boolean {
  const { halfX, halfZ } = worldAssetFootprintMm(asset, placement.rotation);
  return Math.abs(placement.xMm) - halfX < AURION_STARTER_CITY_WALL_ENVELOPE_MM[0] / 2 + STARTER_CITY_PROCEDURAL_CLEARANCE_MM
    && Math.abs(placement.zMm) - halfZ < AURION_STARTER_CITY_WALL_ENVELOPE_MM[2] / 2 + STARTER_CITY_PROCEDURAL_CLEARANCE_MM;
}

/**
 * Design rules of the procedural plan (owner design brief 2026-11-10).
 * These catalog members stay loadable and hand-placeable, but are never scattered.
 */
export const WORLD_SCATTER_EXCLUSIONS = Object.freeze([
  Object.freeze({ rule: "complete-trees-only", pattern: /^nature-tree-bare-/, reason: "tree without a crown" }),
  Object.freeze({ rule: "complete-trees-only", pattern: /^nature-(stump|log|timber|branch|root)-/, reason: "loose trunk, crown or root fragment" }),
  Object.freeze({ rule: "complete-trees-only", pattern: /^city-trunk/, reason: "loose trunk prop" }),
  Object.freeze({ rule: "bridges-need-a-crossing", pattern: /^city-bridge/, reason: "a bridge is only meaningful at a hand-designed crossing" }),
]);
export const isProceduralScatterAsset = (assetId: string) => !WORLD_SCATTER_EXCLUSIONS.some(entry => entry.pattern.test(assetId));
/** A complete tree: trunk and crown in one model. Bare trees and fragments never qualify. */
export const isCompleteTreeAsset = (asset: WorldAsset) => asset.family === "nature" && asset.category === "tree" && isProceduralScatterAsset(asset.id);
/** Flowers and grasses; they must outnumber trees in every chunk. */
export const isFloraAsset = (asset: WorldAsset) => /^nature-(flower|grass-clump)-/.test(asset.id);
export const isHouseAsset = (asset: WorldAsset) => asset.family === "city" && asset.category === "building";

const completeTrees = nature.filter(isCompleteTreeAsset);
const flora = nature.filter(isFloraAsset);
const groundCover = nature.filter(a => a.category !== "tree" && !isFloraAsset(a) && isProceduralScatterAsset(a.id));
const houses = city.filter(isHouseAsset);
const foundations = city.filter(a => a.category === "structure" && isProceduralScatterAsset(a.id));
const streetProps = city.filter(a => a.category === "prop" && isProceduralScatterAsset(a.id));
if (!completeTrees.length || flora.length < 2 || !groundCover.length || !houses.length || !foundations.length || !streetProps.length) throw Error("WORLD_ASSET_DESIGN_POOL_EMPTY");

/** Stable slot grid: 12 slots per chunk, historical order, ids `aurion-world-assets.v1:x:z:slot`. */
const SLOTS: readonly (readonly [number, number])[] = Object.freeze([-24, -8, 8, 24].flatMap(dz => [-24, -8, 8, 24].filter(dx => !(Math.abs(dx) === 8 && Math.abs(dz) === 8)).map(dx => Object.freeze([dx, dz] as const))));
export const WORLD_ASSET_SLOTS_PER_CHUNK = 12 as const;
const NATURE_GROUND_SLOTS = 3;
const NATURE_ROAD_VERGE_MM = 500;
const HOUSE_SETBACK_MM = 1_500;
const STREET_PROP_VERGE_MM = 600;
/** A settlement repeats every 6 chunks and spans 2 x 2 chunks, as before. */
export const isSettlementChunk = (coordinate: WorldChunkCoordinate) => mod(coordinate.x, 6) < 2 && mod(coordinate.z, 6) < 2;

type LotKind = "house" | "foundation" | "prop";
/** Road "z" is the north-south strip of the chunk, road "x" the east-west strip. */
const LOTS = Object.freeze([
  { road: "z", side: -1, alongMm: -20_000 }, { road: "z", side: 1, alongMm: -20_000 },
  { road: "z", side: -1, alongMm: 24_000 }, { road: "z", side: 1, alongMm: 24_000 },
  { road: "x", side: -1, alongMm: -20_000 }, { road: "x", side: 1, alongMm: -20_000 },
  { road: "x", side: -1, alongMm: 24_000 }, { road: "x", side: 1, alongMm: 24_000 },
] as const);
/** Slots 0-7: house lots. Slots 8-11: street furniture at the far end of each street side. */
const LOT_KINDS: readonly LotKind[] = ["house", "house", "house", "house", "house", "foundation", "prop", "prop"];
const STREET_END_LOTS = Object.freeze([
  { road: "z", side: -1, alongMm: -29_000 }, { road: "z", side: 1, alongMm: -29_000 },
  { road: "x", side: -1, alongMm: -29_000 }, { road: "x", side: 1, alongMm: -29_000 },
] as const);
/** Offset from the chunk centre across a road strip: beside the kerb on the given side. */
const besideRoad = (side: number, half: number, gapMm: number) => side < 0 ? -(gapMm + half) : WORLD_ROAD_WIDTH_MM + gapMm + half;
function shuffled<T>(values: readonly T[], hash: number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) { const other = mix(hash, index) % (index + 1); [result[index], result[other]] = [result[other]!, result[index]!]; }
  return result;
}

/** Wilderness: single complete trees, a strict majority of flowers and grasses, some ground cover. Nothing on a road. */
function natureChunk(seed: number, x: number, z: number): WorldAssetPlacement[] {
  const start = x * 31 + z * 17 + seed, hash = mix(seed, x, z, 1);
  const treeCount = 1 + hash % 3;
  const roles = shuffled(SLOTS.map((_, index) => index < treeCount ? "tree" : index < treeCount + NATURE_GROUND_SLOTS ? "ground" : "flora"), hash);
  return SLOTS.map(([dx, dz], slot) => {
    const role = roles[slot]!, pool = role === "tree" ? completeTrees : role === "flora" ? flora : groundCover;
    let asset = pool[mod(start + slot, pool.length)]!;
    // A mountain only fits a chunk corner; elsewhere the next ground-cover model takes the slot.
    const corner = Math.abs(dx) === 24 && Math.abs(dz) === 24;
    for (let step = 1; asset.category === "mountain" && !corner && step < pool.length; step++) asset = pool[mod(start + slot + step, pool.length)]!;
    const rotation = mod(start + slot, 4), { halfX, halfZ } = worldAssetFootprintMm(asset, rotation);
    const offset = (base: number, half: number, axis: number) => {
      const value = base * 1000 + (mix(hash, slot, axis) % 9 - 4) * 1000;
      return base > 0 ? Math.max(value, WORLD_ROAD_WIDTH_MM + NATURE_ROAD_VERGE_MM + half) : Math.min(value, -NATURE_ROAD_VERGE_MM - half);
    };
    return { id: `${WORLD_ASSET_VERSION}:${x}:${z}:${slot}`, assetId: asset.id, xMm: x * 64_000 + offset(dx, halfX, 2), zMm: z * 64_000 + offset(dz, halfZ, 3), rotation };
  });
}

/**
 * Settlement: nothing is scattered. Every house, building site and street prop stands
 * on a lot beside the canonical road strips of its chunk, long side along the road.
 * The crossing itself and 20 m around the chunk centre stay open.
 */
function settlementChunk(seed: number, x: number, z: number): WorldAssetPlacement[] {
  const start = x * 31 + z * 17 + seed, hash = mix(seed, x, z, 2);
  const kinds: LotKind[] = [...shuffled(LOT_KINDS, hash), ...STREET_END_LOTS.map(() => "prop" as const)];
  return [...LOTS, ...STREET_END_LOTS].map((lot, slot) => {
    const kind = kinds[slot]!, pool = kind === "house" ? houses : kind === "foundation" ? foundations : streetProps;
    const asset = pool[mod(start + slot, pool.length)]!, natural = worldAssetFootprintMm(asset, 0);
    const alongZ = lot.road === "z";
    // Long side parallel to the road; the two sides of a road mirror each other.
    const parity = alongZ === natural.halfX > natural.halfZ ? 1 : 0;
    const rotation = parity + (lot.side > 0 ? 2 : 0), { halfX, halfZ } = worldAssetFootprintMm(asset, rotation);
    const gap = kind === "prop" ? STREET_PROP_VERGE_MM : HOUSE_SETBACK_MM;
    return { id: `${WORLD_ASSET_VERSION}:${x}:${z}:${slot}`, assetId: asset.id, rotation,
      xMm: x * 64_000 + (alongZ ? besideRoad(lot.side, halfX, gap) : lot.alongMm),
      zMm: z * 64_000 + (alongZ ? lot.alongMm : besideRoad(lot.side, halfZ, gap)) };
  });
}

/** Stable server plan over the full canonical ±1,000,000-chunk world. No user-specific seed,
 * clock, local randomness, progression, inventory or reward writes participate.
 *
 * Design contract (owner brief 2026-11-10, replaces the cyclic catalog scatter):
 *  - nothing procedural inside the starter city walls (+ clearance);
 *  - houses only on lots adjoining the canonical road network (`worldRoadNetwork`),
 *    which originates in the starter village; nothing stands on a road;
 *  - trees are complete (trunk and crown), never bare trees or loose fragments;
 *  - flowers and grasses strictly outnumber trees in every chunk that has a tree.
 * Slot ids stay `aurion-world-assets.v1:x:z:slot` so admin overrides address them. */
export function worldAssetsForChunk(worldSeed: string, coordinate: WorldChunkCoordinate): WorldAssetPlacement[] {
  worldAssetRegionInput.parse(coordinate); if(!worldSeed) throw Error("WORLD_SEED_REQUIRED");
  const {x,z}=coordinate;
  // The origin chunk is the canonical starter village. It is never selected by
  // seed, random choice or catalog cycling; the client receives this confirmed plan.
  if(x===0&&z===0)return AURION_STARTER_VILLAGE_ASSET_PLACEMENTS.map(placement=>({
    ...placement,id:`${AURION_STARTER_VILLAGE_CONTRACT_VERSION}:${placement.id}`,
  }));
  const seed = seedHash(worldSeed);
  const result = (isSettlementChunk(coordinate) ? settlementChunk(seed, x, z) : natureChunk(seed, x, z))
    .filter(candidate => !intersectsStarterCityWallClearance(worldAssetById.get(candidate.assetId)!, candidate));
  // Next to the wall some flora slots are cleared; never leave trees in the majority.
  const isTree = (p: WorldAssetPlacement) => isCompleteTreeAsset(worldAssetById.get(p.assetId)!);
  let trees = result.filter(isTree).length;
  const floraCount = result.filter(p => isFloraAsset(worldAssetById.get(p.assetId)!)).length;
  for (let index = result.length - 1; index >= 0 && trees > 0 && floraCount <= trees; index--) if (isTree(result[index]!)) { result.splice(index, 1); trees--; }
  return result;
}
function escapeRegexLiteral(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
const PROCEDURAL_PLACEMENT_ID = new RegExp(`^${escapeRegexLiteral(WORLD_ASSET_VERSION)}:(-?\\d{1,7}):(-?\\d{1,7}):(\\d{1,2})$`);
/** Chunk of a procedural placement id, or null for authored/unknown ids. Never matches the starter village. */
export function proceduralPlacementChunk(placementId: string): WorldChunkCoordinate | null {
  const match = PROCEDURAL_PLACEMENT_ID.exec(placementId);
  if (!match) return null;
  const coordinate = { x: Number(match[1]), z: Number(match[2]) };
  return worldAssetRegionInput.safeParse(coordinate).success && Number(match[3]) < WORLD_ASSET_SLOTS_PER_CHUNK ? coordinate : null;
}
/** The placement the generator actually emits for this id; undefined when it does not exist. */
export function findProceduralPlacement(worldSeed: string, placementId: string): WorldAssetPlacement | undefined {
  const coordinate = proceduralPlacementChunk(placementId);
  return coordinate ? worldAssetsForChunk(worldSeed, coordinate).find(candidate => candidate.id === placementId) : undefined;
}
export function worldAssetRegion(worldId: string, worldSeed: string, center: WorldChunkCoordinate): WorldAssetRegion {
  worldAssetRegionInput.parse(center);const placements: WorldAssetPlacement[]=[];
  for(let z=center.z-1;z<=center.z+1;z++)for(let x=center.x-1;x<=center.x+1;x++)if(Math.abs(x)<=WORLD_CHUNK_COORDINATE_LIMIT&&Math.abs(z)<=WORLD_CHUNK_COORDINATE_LIMIT)placements.push(...worldAssetsForChunk(worldSeed,{x,z}));
  return worldAssetRegionSchema.parse({version:"aurion-world-assets.v2",catalogHash:catalog.bundleSha256,collisionHash:collision.manifestSha256,collisionVersion:collision.version,worldId,center,placements});
}
/** Preserve the exact strict v1 response for already loaded clients during rollout. */
export function legacyWorldAssetRegion(worldId: string, worldSeed: string, center: WorldChunkCoordinate) {
  const { collisionHash: _hash, collisionVersion: _collisionVersion, ...region } = worldAssetRegion(worldId, worldSeed, center);
  return legacyWorldAssetRegionSchema.parse({ ...region, version: WORLD_ASSET_VERSION });
}
/** Vertical screen occupancy, with a lower phone budget. Boundaries have hysteresis in the renderer. */
export function worldAssetLod(heightMeters: number, distance: number, fovDegrees: number, phone: boolean): 0|1|2 {
  const fraction=heightMeters/(2*Math.max(1,distance)*Math.tan(fovDegrees*Math.PI/360));
  return fraction>(phone?0.2:0.14)?0:fraction>(phone?0.065:0.04)?1:2;
}
