import collision from "./worldCollisionManifest.json";
import { z } from "zod";
import catalog from "./worldAssetCatalog.json";
import { WORLD_CHUNK_COORDINATE_LIMIT, type WorldChunkCoordinate } from "./worldChunkProtocol";
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
const city = catalog.assets.filter(a => a.family === "city"), nature = catalog.assets.filter(a => a.family === "nature");
/** Stable server plan over the full canonical ±1,000,000-chunk world. No user-specific seed,
 * clock, local randomness, progression, inventory or reward writes participate. Open central
 * roads and a 20 m spawn/service area stay free. Each catalog member is selected by a cyclic
 * permutation as chunks change; LOD choice cannot alter placement or gameplay state. */
export function worldAssetsForChunk(worldSeed: string, coordinate: WorldChunkCoordinate): WorldAssetPlacement[] {
  worldAssetRegionInput.parse(coordinate); if(!worldSeed) throw Error("WORLD_SEED_REQUIRED");
  const {x,z}=coordinate;const settlement=mod(x,6)<2 && mod(z,6)<2;
  const models=settlement?city:nature;
  const start=mod(x*31+z*17+seedHash(worldSeed),models.length);
  const result: WorldAssetPlacement[]=[];let slot=0;
  for(const dz of [-24,-8,8,24]) for(const dx of [-24,-8,8,24]) {
    if(Math.abs(dx)===8&&Math.abs(dz)===8)continue;
    let asset=models[(start+slot)%models.length]!;
    const anchors=models.filter(a=>a.category===(settlement?"building":"tree"));
    if((slot===0||slot===6)&&anchors.length)asset=anchors[mod(start+slot,anchors.length)]!;
    result.push({id:`${WORLD_ASSET_VERSION}:${x}:${z}:${slot}`,assetId:asset.id,xMm:x*64_000+dx*1000,zMm:z*64_000+dz*1000,rotation:mod(start+slot,4)});slot++;
  }
  return result;
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
