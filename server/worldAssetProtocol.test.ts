import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  STARTER_CITY_PROCEDURAL_CLEARANCE_MM, WORLD_ASSET_SLOTS_PER_CHUNK, WORLD_SCATTER_EXCLUSIONS, findProceduralPlacement, intersectsStarterCityWallClearance,
  isCompleteTreeAsset, isFloraAsset, isHouseAsset, isProceduralScatterAsset, isSettlementChunk, proceduralPlacementChunk, worldAssetById, worldAssetCatalog,
  worldAssetGroundRectMm, worldAssetRegion, worldAssetRegionSchema, worldAssetsForChunk, worldAssetLod, legacyWorldAssetRegion, legacyWorldAssetRegionSchema,
} from "../shared/worldAssetProtocol";
import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "../shared/aurionStarterCityWallContract";
import { WORLD_CHUNK_COORDINATE_LIMIT } from "../shared/worldChunkProtocol";
import { WORLD_ROAD_FRONTAGE_MAX_GAP_MM, adjoinsWorldRoad, overlapsWorldRoad, worldRoadAxisGapMm, worldRoadFrontageGapMm } from "../shared/worldRoadNetwork";

const SEEDS = ["echoes-of-aurion-v1", "seed-a", "seed-b"] as const;
/** Independent of the generator's own predicates: judged by the original model names of the source catalog. */
const FRAGMENT_NAME = /^(Tree_Bare|Stump|Log|Timber|Branch|Root|Trunk)/;
const COMPLETE_TREE_NAME = /^Tree_(Cedar|Oak|Palm|Pine)_\d+$/;
const FLORA_NAME = /^(Flower|Grass_Clump)_/;
function forEachChunk(radius: number, visit: (seed: string, coordinate: { x: number; z: number }, placements: ReturnType<typeof worldAssetsForChunk>) => void) {
  for (const seed of SEEDS) for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
    if (x === 0 && z === 0) continue; // the authored starter village has its own contract
    visit(seed, { x, z }, worldAssetsForChunk(seed, { x, z }));
  }
}

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
 it("keeps the fixed village at the origin and the stable slot ids of the historical stream",()=>{
  const coordinates=[{x:-1,z:-1},{x:0,z:-1},{x:1,z:-1},{x:-1,z:0},{x:1,z:0},{x:-1,z:1},{x:0,z:1},{x:1,z:1},{x:6,z:0},{x:-93,z:48},{x:1_000_000,z:-1_000_000}];
  const historical=SEEDS.flatMap(seed=>coordinates.map(coordinate=>historicalCandidates(seed,coordinate)));
  // The pre-2026-11-10 allocation stream stays pinned as a historical reference only.
  // The owner design brief of 2026-11-10 deliberately replaced the cyclic catalog
  // scatter (houses in fields, bare trees, loose trunks) by the design rules below,
  // so asset choice and position are no longer expected to equal this stream.
  // What must survive is addressing: 12 slot ids per chunk, `version:x:z:slot`.
  expect(createHash("sha256").update(JSON.stringify(historical)).digest("hex"))
    .toBe("2bc0d9734648dd28f485b450d5bec805aecf84d2978e866dd2bd685ae53c5f0d");
  for(const coordinate of coordinates){
    for(const seed of SEEDS) {
      const slotIds = historicalCandidates(seed,coordinate).map(item=>item.id);
      const current = worldAssetsForChunk(seed,coordinate);
      expect(slotIds).toHaveLength(WORLD_ASSET_SLOTS_PER_CHUNK);
      expect(current.every(item => slotIds.includes(item.id))).toBe(true);
      expect(new Set(current.map(item=>item.id)).size).toBe(current.length);
      expect(current.map(item=>item.id)).toEqual(slotIds.filter(id=>current.some(item=>item.id===id)));
    }
    expect(worldAssetsForChunk("seed-a",coordinate)).toEqual(worldAssetsForChunk("seed-a",coordinate));
    // Far-world selection stays seed dependent.
    if(Math.abs(coordinate.x)>2 || Math.abs(coordinate.z)>2)
      expect(worldAssetsForChunk("seed-a",coordinate)).not.toEqual(worldAssetsForChunk("seed-b",coordinate));
  }
  expect(worldAssetsForChunk("seed-a",{x:0,z:0})).toEqual(worldAssetsForChunk("seed-b",{x:0,z:0}));
 });
 it("design rule: trees are complete - never a bare tree, loose trunk, crown, branch, root or stump",()=>{
  const trees=new Set<string>();
  forEachChunk(24,(seed,coordinate,placements)=>{
    for(const placement of placements){
      const asset=worldAssetById.get(placement.assetId)!;
      expect(FRAGMENT_NAME.test(asset.name),`${seed} ${placement.id} ${asset.name}`).toBe(false);
      if(asset.category==="tree"){expect(asset.name).toMatch(COMPLETE_TREE_NAME);trees.add(asset.id);}
    }
  });
  // All 23 complete trees stay in use; the 6 crownless ones do not.
  expect([...trees].sort()).toEqual(worldAssetCatalog.assets.filter(a=>COMPLETE_TREE_NAME.test(a.name)).map(a=>a.id).sort());
  expect(trees.size).toBe(23);
  expect(worldAssetCatalog.assets.filter(a=>a.category==="tree"&&!isCompleteTreeAsset(a)).map(a=>a.name)).toEqual([1,2,3,4,5,6].map(n=>`Tree_Bare_${n}`));
 });
 it("design rule: flowers and grasses outnumber trees in every chunk and trees stand singly",()=>{
  let trees=0,flora=0,natureChunks=0;
  forEachChunk(24,(seed,coordinate,placements)=>{
    const assets=placements.map(placement=>worldAssetById.get(placement.assetId)!);
    const chunkTrees=assets.filter(a=>a.category==="tree").length, chunkFlora=assets.filter(a=>FLORA_NAME.test(a.name)).length;
    expect(assets.filter(isFloraAsset)).toHaveLength(chunkFlora);
    if(isSettlementChunk(coordinate)){expect(chunkTrees).toBe(0);return;}
    natureChunks++;trees+=chunkTrees;flora+=chunkFlora;
    expect(chunkTrees,`${seed} ${coordinate.x},${coordinate.z}`).toBeLessThanOrEqual(3);
    if(chunkTrees>0)expect(chunkFlora,`${seed} ${coordinate.x},${coordinate.z}`).toBeGreaterThan(chunkTrees);
    // Far from the walls every wilderness chunk carries its full meadow.
    if(Math.abs(coordinate.x)>2||Math.abs(coordinate.z)>2){expect(placements).toHaveLength(WORLD_ASSET_SLOTS_PER_CHUNK);expect(chunkTrees).toBeGreaterThanOrEqual(1);expect(chunkFlora).toBeGreaterThanOrEqual(6);}
  });
  expect(natureChunks).toBeGreaterThan(6_000);
  expect(flora).toBeGreaterThan(trees*3);
 });
 it("design rule: houses stand on lots adjoining the road network, nothing stands on a road",()=>{
  let houses=0,foundations=0;
  forEachChunk(24,(seed,coordinate,placements)=>{
    for(const placement of placements){
      const asset=worldAssetById.get(placement.assetId)!, rect=worldAssetGroundRectMm(asset,placement);
      const label=`${seed} ${placement.id} ${asset.id}`;
      expect(overlapsWorldRoad(rect),label).toBe(false);
      if(asset.family!=="city")continue;
      // City models exist only in settlements, and there every one of them lines a road.
      expect(isSettlementChunk(coordinate),label).toBe(true);
      expect(adjoinsWorldRoad(rect),label).toBe(true);
      if(asset.category==="building"){houses++;expect(isHouseAsset(asset)).toBe(true);expect(worldRoadFrontageGapMm(rect)).toBe(1_500);
        // Long side along the road it adjoins: the short side is the lot depth.
        const nearNorthSouthRoad=worldRoadAxisGapMm(rect.minX,rect.maxX)<=worldRoadAxisGapMm(rect.minZ,rect.maxZ);
        expect(rect.maxZ-rect.minZ>rect.maxX-rect.minX,label).toBe(nearNorthSouthRoad);
      }
      if(asset.category==="structure")foundations++;
    }
  });
  expect(houses).toBeGreaterThan(3_000);expect(foundations).toBeGreaterThan(600);
  expect(WORLD_ROAD_FRONTAGE_MAX_GAP_MM).toBe(2_000);
 });
 it("design rule: nothing procedural stands inside the starter city walls",()=>{
  const limitX=AURION_STARTER_CITY_WALL_ENVELOPE_MM[0]/2+STARTER_CITY_PROCEDURAL_CLEARANCE_MM, limitZ=AURION_STARTER_CITY_WALL_ENVELOPE_MM[2]/2+STARTER_CITY_PROCEDURAL_CLEARANCE_MM;
  expect([limitX,limitZ]).toEqual([61_000,61_000]);
  let near=0;
  forEachChunk(3,(seed,coordinate,placements)=>{
    for(const placement of placements){
      const asset=worldAssetById.get(placement.assetId)!, rect=worldAssetGroundRectMm(asset,placement);
      const outside=rect.minX>=limitX||rect.maxX<=-limitX||rect.minZ>=limitZ||rect.maxZ<=-limitZ;
      expect(outside,`${seed} ${placement.id} ${asset.id}`).toBe(true);
      expect(intersectsStarterCityWallClearance(asset,placement)).toBe(false);
      near++;
    }
  });
  expect(near).toBeGreaterThan(1_000);
 });
 it("addresses each generated placement by its stable id and refuses ids the plan does not emit",()=>{
  const seed="echoes-of-aurion-v1", placements=worldAssetsForChunk(seed,{x:-93,z:48});
  for(const placement of placements){expect(proceduralPlacementChunk(placement.id)).toEqual({x:-93,z:48});expect(findProceduralPlacement(seed,placement.id)).toEqual(placement);}
  // A slot the wall rule cleared is not addressable; neither are starter-village or foreign ids.
  const cleared=[...Array(WORLD_ASSET_SLOTS_PER_CHUNK).keys()].map(slot=>`aurion-world-assets.v1:0:-1:${slot}`).filter(id=>!worldAssetsForChunk(seed,{x:0,z:-1}).some(p=>p.id===id));
  expect(cleared.length).toBeGreaterThan(0);
  for(const id of [...cleared,"aurion-world-assets.v1:0:0:0","aurion-world-assets.v1:5:5:12","aurion-world-assets.v1:1000001:0:0","aurion-world-assets.v1:1:1","aurion-world-assets.v2:1:1:1",...worldAssetsForChunk(seed,{x:0,z:0}).map(p=>p.id)])
    expect(findProceduralPlacement(seed,id),id).toBeUndefined();
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
 it("selects every model the design rules allow and names every model they exclude",()=>{
  const selected=new Set<string>();for(let x=-24;x<=24;x++)for(let z=-24;z<=24;z++)for(const p of worldAssetsForChunk("echoes-of-aurion-v1",{x,z}))selected.add(p.assetId);
  const excluded=worldAssetCatalog.assets.filter(a=>!isProceduralScatterAsset(a.id));
  expect([...selected].sort()).toEqual(worldAssetCatalog.assets.filter(a=>isProceduralScatterAsset(a.id)).map(a=>a.id).sort());
  expect(selected.size).toBe(117);expect(excluded).toHaveLength(35);expect(worldAssetCatalog.assets).toHaveLength(152);
  // Excluded = exactly the crownless trees, loose tree fragments and bridges; each has a stated rule.
  expect(excluded.every(a=>FRAGMENT_NAME.test(a.name)||/^Bridge/.test(a.name))).toBe(true);
  expect(worldAssetCatalog.assets.filter(a=>FRAGMENT_NAME.test(a.name)||/^Bridge/.test(a.name))).toHaveLength(35);
  expect(WORLD_SCATTER_EXCLUSIONS.map(entry=>entry.rule)).toEqual(["complete-trees-only","complete-trees-only","complete-trees-only","bridges-need-a-crossing"]);
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
  // The 20 m around every chunk centre stays open as before. The former "origin more than
  // 4 m off both centre lines" rule is replaced by the stronger road rule: no footprint
  // of any placement touches a road strip (houses now deliberately line the road).
  for(const coordinate of [{x:6,z:0},{x:7,z:1},{x:3,z:3},{x:-93,z:48}])for(const seed of SEEDS){const placements=worldAssetsForChunk(seed,coordinate);expect(placements).toHaveLength(12);for(const p of placements){
    expect(Math.hypot(p.xMm-coordinate.x*64_000,p.zMm-coordinate.z*64_000)).toBeGreaterThan(20_000);
    expect(overlapsWorldRoad(worldAssetGroundRectMm(worldAssetById.get(p.assetId)!,p))).toBe(false);}}
  expect(worldAssetLod(10,5,55,true)).toBe(0);expect(worldAssetLod(1,100,55,true)).toBe(2);expect(worldAssetLod(10,60,55,true)).toBe(1);
 });
 it("binds every original GLB to bounded budgets, positive scale and per-LOD measured grounding",()=>{
  expect(worldAssetCatalog.assets.reduce((n,a)=>n+a.lods.length+(a.collider?1:0),0)).toBe(568);
  for(const asset of worldAssetCatalog.assets){expect(asset.scale).toBeGreaterThan(0);for(const [i,lod] of asset.lods.entries()){expect(lod.triangles).toBeLessThanOrEqual([1600,800,300][i]!);expect(lod.sha256).toMatch(/^[a-f0-9]{64}$/);expect(lod.bounds.max[1]!).toBeGreaterThan(lod.bounds.min[1]!);}}
 });
});
