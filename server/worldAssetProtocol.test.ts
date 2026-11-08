import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { intersectsStarterCityWallClearance, worldAssetCatalog, worldAssetRegion, worldAssetRegionSchema, worldAssetsForChunk, worldAssetLod, legacyWorldAssetRegion, legacyWorldAssetRegionSchema } from "../shared/worldAssetProtocol";
import { WORLD_CHUNK_COORDINATE_LIMIT } from "../shared/worldChunkProtocol";

/** Historical deterministic candidate stream, intentionally kept as a test-only reference.
 * The source generator must retain all far-world allocations; only city-adjacent
 * projection admission may change. Never expose this ungated stream at runtime.
 */
function historicalCandidates(seed: string, coordinate: { x: number; z: number }) {
  const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const { x, z } = coordinate;
  const settlement = mod(x, 6) < 2 && mod(z, 6) < 2;
  const city = worldAssetCatalog.assets.filter(a => a.family === "city");
  const nature = worldAssetCatalog.assets.filter(a => a.family === "nature");
  const models = settlement ? city : nature;
  const start = mod(x * 31 + z * 17 + (hash >>> 0), models.length);
  const result: { id: string; assetId: string; xMm: number; zMm: number; rotation: number }[] = [];
  let slot = 0;
  for (const dz of [-24, -8, 8, 24]) for (const dx of [-24, -8, 8, 24]) {
    if (Math.abs(dx) === 8 && Math.abs(dz) === 8) continue;
    let asset = models[(start + slot) % models.length]!;
    const anchors = models.filter(a => a.category === (settlement ? "building" : "tree"));
    if ((slot === 0 || slot === 6) && anchors.length) asset = anchors[mod(start + slot, anchors.length)]!;
    result.push({ id: `aurion-world-assets.v1:${x}:${z}:${slot}`, assetId: asset.id,
      xMm: x * 64_000 + dx * 1000, zMm: z * 64_000 + dz * 1000, rotation: mod(start + slot, 4) });
    slot++;
  }
  return result;
}

describe("worldwide optimized GLB selection",()=>{
 it("limits the fixed village to origin and preserves the pre-village outer-world asset pipeline",()=>{
  const coordinates=[{x:-1,z:-1},{x:0,z:-1},{x:1,z:-1},{x:-1,z:0},{x:1,z:0},{x:-1,z:1},{x:0,z:1},{x:1,z:1},{x:6,z:0},{x:-93,z:48},{x:1_000_000,z:-1_000_000}];
  const seeds=["echoes-of-aurion-v1","seed-a","seed-b"];
  const historical=seeds.flatMap(seed=>coordinates.map(coordinate=>historicalCandidates(seed,coordinate)));
  // Preserve the exact pre-starter external allocation stream as a historical
  // independent baseline, including stable IDs and rotation: NEVER change its SHA
  // to hide a regression in far-world geometry.
  expect(createHash("sha256").update(JSON.stringify(historical)).digest("hex"))
    .toBe("2bc0d9734648dd28f485b450d5bec805aecf84d2978e866dd2bd685ae53c5f0d");
  for(const coordinate of coordinates){
    for(const seed of seeds) {
      const original = historicalCandidates(seed,coordinate);
      const current = worldAssetsForChunk(seed,coordinate);
      expect(current).toEqual(original.filter(item => {
        const asset = worldAssetCatalog.assets.find(a => a.id === item.assetId)!;
        return asset.family !== "city" || !intersectsStarterCityWallClearance(asset,item);
      }));
      expect(current.every(item => original.some(o => JSON.stringify(o) === JSON.stringify(item)))).toBe(true);
    }
    expect(worldAssetsForChunk("seed-a",coordinate)).toEqual(worldAssetsForChunk("seed-a",coordinate));
    // Far-world seed-dependent selection is unchanged; origin-adjacent city exclusion may be empty.
    if(Math.abs(coordinate.x)>2 || Math.abs(coordinate.z)>2)
      expect(worldAssetsForChunk("seed-a",coordinate)).not.toEqual(worldAssetsForChunk("seed-b",coordinate));
  }
  expect(worldAssetsForChunk("seed-a",{x:0,z:0})).toEqual(worldAssetsForChunk("seed-b",{x:0,z:0}));
 });
 it("keeps the strict legacy response compatible and negotiates collision metadata through v2",()=>{
  const legacy=legacyWorldAssetRegion("world","seed",{x:0,z:-1}), current=worldAssetRegion("world","seed",{x:0,z:-1});
  expect(Object.keys(legacy).sort()).toEqual(["version","catalogHash","worldId","center","placements"].sort());
  expect(legacy.version).toBe("aurion-world-assets.v1");expect(current.version).toBe("aurion-world-assets.v2");
  expect(legacy.placements).toEqual(current.placements);
  expect(legacyWorldAssetRegionSchema.safeParse(legacy).success).toBe(true);
  expect(legacyWorldAssetRegionSchema.safeParse(current).success).toBe(false);
  expect(worldAssetRegionSchema.safeParse(legacy).success).toBe(false);
  expect(worldAssetRegionSchema.safeParse({...current,collisionHash:"unrelated"}).success).toBe(false);
 });
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
 it("keeps non-starter procedural spawn paths open and selects LOD using apparent size",()=>{
  for(const p of worldAssetsForChunk("seed",{x:6,z:0})){expect(Math.hypot(p.xMm-6*64_000,p.zMm)).toBeGreaterThan(20_000);expect(Math.abs(p.xMm-6*64_000)).toBeGreaterThan(4_000);expect(Math.abs(p.zMm)).toBeGreaterThan(4_000);}
  expect(worldAssetLod(10,5,55,true)).toBe(0);expect(worldAssetLod(1,100,55,true)).toBe(2);expect(worldAssetLod(10,60,55,true)).toBe(1);
 });
 it("binds every original GLB to bounded budgets, positive scale and per-LOD measured grounding",()=>{
  expect(worldAssetCatalog.assets.reduce((n,a)=>n+a.lods.length+(a.collider?1:0),0)).toBe(568);
  for(const asset of worldAssetCatalog.assets){expect(asset.scale).toBeGreaterThan(0);for(const [i,lod] of asset.lods.entries()){expect(lod.triangles).toBeLessThanOrEqual([1600,800,300][i]!);expect(lod.sha256).toMatch(/^[a-f0-9]{64}$/);expect(lod.bounds.max[1]!).toBeGreaterThan(lod.bounds.min[1]!);}}
 });
});
