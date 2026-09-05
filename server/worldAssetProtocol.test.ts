import { describe, expect, it } from "vitest";
import { worldAssetCatalog, worldAssetRegion, worldAssetRegionSchema, worldAssetsForChunk, worldAssetLod } from "../shared/worldAssetProtocol";
import { WORLD_CHUNK_COORDINATE_LIMIT } from "../shared/worldChunkProtocol";

describe("worldwide optimized GLB selection",()=>{
 it("selects every supplied city and nature model across deterministic server chunks",()=>{
  const selected=new Set<string>();for(let x=-24;x<=24;x++)for(let z=-24;z<=24;z++)for(const p of worldAssetsForChunk("echoes-of-aurion-v1",{x,z}))selected.add(p.assetId);
  expect([...selected].sort()).toEqual(worldAssetCatalog.assets.map(a=>a.id).sort());expect(selected.size).toBe(152);
  expect(worldAssetCatalog.assets.filter(a=>a.family==="nature"&&a.collider)).toHaveLength(112);
 });
 it("reconstructs identical bounded regions for separate users and negative/far coordinates",()=>{
  for(const center of [{x:0,z:0},{x:-93,z:48},{x:WORLD_CHUNK_COORDINATE_LIMIT,z:-WORLD_CHUNK_COORDINATE_LIMIT}]){
   const a=worldAssetRegion("world","seed",center);expect(a).toEqual(worldAssetRegion("world","seed",center));expect(a.placements.length).toBeLessThanOrEqual(108);expect(new Set(a.placements.map(p=>p.id)).size).toBe(a.placements.length);for(const p of a.placements){expect(Number.isSafeInteger(p.xMm)).toBe(true);expect(Number.isSafeInteger(p.zMm)).toBe(true);}
  }
  expect(()=>worldAssetsForChunk("seed",{x:WORLD_CHUNK_COORDINATE_LIMIT+1,z:0})).toThrow();
  expect(()=>worldAssetRegionSchema.parse({...worldAssetRegion("world","seed",{x:0,z:0}),catalogHash:"wrong"})).toThrow();
 });
 it("keeps spawn and central paths open and selects LOD using apparent size",()=>{
  for(const p of worldAssetsForChunk("seed",{x:0,z:0})){expect(Math.hypot(p.xMm,p.zMm)).toBeGreaterThan(20_000);expect(Math.abs(p.xMm)).toBeGreaterThan(4_000);expect(Math.abs(p.zMm)).toBeGreaterThan(4_000);}
  expect(worldAssetLod(10,5,55,true)).toBe(0);expect(worldAssetLod(1,100,55,true)).toBe(2);expect(worldAssetLod(10,60,55,true)).toBe(1);
 });
 it("binds every original GLB to bounded budgets, positive scale and per-LOD measured grounding",()=>{
  expect(worldAssetCatalog.assets.reduce((n,a)=>n+a.lods.length+(a.collider?1:0),0)).toBe(568);
  for(const asset of worldAssetCatalog.assets){expect(asset.scale).toBeGreaterThan(0);for(const [i,lod] of asset.lods.entries()){expect(lod.triangles).toBeLessThanOrEqual([1600,800,300][i]!);expect(lod.sha256).toMatch(/^[a-f0-9]{64}$/);expect(lod.bounds.max[1]!).toBeGreaterThan(lod.bounds.min[1]!);}}
 });
});
