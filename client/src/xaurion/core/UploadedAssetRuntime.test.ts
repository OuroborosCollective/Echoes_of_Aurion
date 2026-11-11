import { describe, expect, it } from "vitest";
import { AURION_STARTER_CITY_WALL_LODS } from "@shared/aurionStarterCityWallContract";
import type { GlbCatalogEntry, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { AURION_RETURN_STONE_ASSET_ID, AURION_RETURN_STONE_POSITION, AURION_RETURN_STONE_SOURCE_SHA256 } from "@shared/aurionReturnStoneContract";
import { AURION_VILLAGE_FOUNTAIN_LODS, AURION_VILLAGE_FOUNTAIN_POSITION } from "@shared/aurionVillageFountainContract";
import { AURION_VILLAGE_STREET_LAMP_LODS, AURION_VILLAGE_STREET_LAMP_PLACEMENTS } from "@shared/aurionVillageStreetLampContract";
import type { WorldChunkCoordinate } from "@shared/worldChunkProtocol";
import { GLOBAL_WORLD_SEED } from "@shared/worldIdentity";
import { isCompleteTreeAsset, isFloraAsset, worldAssetById, worldAssetGroundRectMm, worldAssetsForChunk } from "@shared/worldAssetProtocol";
import { adjoinsWorldRoad, overlapsWorldRoad, type WorldGroundRectMm } from "@shared/worldRoadNetwork";
import { STARTER_CITY_FLAT_HALF_EXTENT_M } from "../world/starterCityGround";
import { isRoadBoundUploadedAsset, publicPlayerCharacterCatalog, returnStoneCatalogAsset, returnStoneVisualPlacement, selectEquipmentCatalogAsset, targetSizeMeters, uploadedWorldVisualsForChunk, villageFountainCatalogAsset, villageFountainVisualPlacement, villageStreetLampCatalogAsset, villageStreetLampVisualPlacements, type UploadedWorldVisualPlacement } from "./UploadedAssetRuntime";

/** A settlement chunk outside the starter city (chunk 0:0 lies inside the walls). */
const OUTER_SETTLEMENT: WorldChunkCoordinate = { x: 6, z: 0 };

const sha = (digit: string) => digit.repeat(64);
function entry(values: Partial<GlbCatalogEntry> & Pick<GlbCatalogEntry, "assetId" | "purpose" | "assetType">): GlbCatalogEntry {
  return {
    assetId: values.assetId,
    sha256: values.sha256 ?? sha(values.assetId.slice(-1) || "a"),
    displayName: values.displayName ?? values.assetId,
    assetType: values.assetType,
    storageUrl: values.storageUrl ?? `/api/assets/glb/${values.sha256 ?? sha(values.assetId.slice(-1) || "a")}.glb`,
    targetKey: values.targetKey ?? null,
    purpose: values.purpose,
    subcategory: values.subcategory ?? "test",
    equipmentSlot: values.equipmentSlot ?? null,
  };
}
function catalog(entries: GlbCatalogEntry[], revision = sha("f")): GlbRuntimeCatalog {
  return { version: "aurion.glb-import.v1", revision, entries };
}

function fountainEntry(overrides: Partial<GlbCatalogEntry> = {}): GlbCatalogEntry {
  const [lod1, lod2] = AURION_VILLAGE_FOUNTAIN_LODS;
  return {
    assetId: lod1.assetId,
    sha256: lod1.sha256,
    displayName: "World Environment · fountain · Aurion Village Fountain",
    assetType: "arena",
    storageUrl: `/api/assets/glb/${lod1.sha256}.glb`,
    targetKey: null,
    purpose: "world-environment",
    subcategory: "fountain",
    equipmentSlot: null,
    lods: [
      { level: 1, assetId: lod1.assetId, sha256: lod1.sha256, bytes: lod1.bytes, storageUrl: `/api/assets/glb/${lod1.sha256}.glb`, targetKey: null },
      { level: 2, assetId: lod2.assetId, sha256: lod2.sha256, bytes: lod2.bytes, storageUrl: `/api/assets/glb/${lod2.sha256}.glb`, targetKey: null },
    ],
    ...overrides,
  } as unknown as GlbCatalogEntry;
}

function streetLampEntry(overrides: Partial<GlbCatalogEntry> = {}): GlbCatalogEntry {
  const [lod0, lod1, lod2, lod3] = AURION_VILLAGE_STREET_LAMP_LODS;
  return {
    assetId: lod0.assetId,
    sha256: lod0.sha256,
    displayName: "World Environment · street-prop · Aurion Village Street Lamp",
    assetType: "arena",
    storageUrl: `/api/assets/glb/${lod0.sha256}.glb`,
    targetKey: null,
    purpose: "world-environment",
    subcategory: "street-prop",
    equipmentSlot: null,
    lods: [lod0, lod1, lod2, lod3].map(lod => ({
      level: lod.level,
      assetId: lod.assetId,
      sha256: lod.sha256,
      bytes: lod.bytes,
      storageUrl: `/api/assets/glb/${lod.sha256}.glb`,
      targetKey: null,
    })),
    ...overrides,
  } as unknown as GlbCatalogEntry;
}

function returnStoneEntry(overrides: Partial<GlbCatalogEntry> = {}): GlbCatalogEntry {
  return entry({
    assetId: AURION_RETURN_STONE_ASSET_ID,
    sha256: AURION_RETURN_STONE_SOURCE_SHA256,
    storageUrl: `/api/assets/glb/${AURION_RETURN_STONE_SOURCE_SHA256}.glb`,
    displayName: "World Environment · teleporter · Aurion Return Stone",
    purpose: "world-environment",
    assetType: "arena",
    subcategory: "teleporter",
    ...overrides,
  });
}

describe("uploaded GLB runtime selection", () => {
  it("reserves every approved wall LOD for explicit world designs instead of scattering city perimeters", () => {
    const walls = AURION_STARTER_CITY_WALL_LODS.map(lod => entry({
      assetId: `glb_${lod.sha256.slice(0, 48)}`, sha256: lod.sha256,
      purpose: "world-environment", assetType: "arena", subcategory: "structure",
    }));
    expect(uploadedWorldVisualsForChunk(catalog(walls), OUTER_SETTLEMENT)).toEqual([]);
    const ordinary = entry({ assetId: "glb_ordinary", purpose: "world-environment", assetType: "arena", subcategory: "structure" });
    const placements = uploadedWorldVisualsForChunk(catalog([...walls, ordinary]), OUTER_SETTLEMENT);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every(item => item.asset.assetId === ordinary.assetId)).toBe(true);
  });
  it("exposes only the explicitly public once-selectable character lane", () => {
    const result = publicPlayerCharacterCatalog(catalog([
      entry({ assetId: "glb_public_b", purpose: "player-public", assetType: "character" }),
      entry({ assetId: "glb_npc", purpose: "npc-fallback", assetType: "character" }),
      entry({ assetId: "glb_public_a", purpose: "player-public", assetType: "character" }),
      entry({ assetId: "glb_assigned", purpose: "player-public", assetType: "character", targetKey: "starter_player" }),
    ]));
    expect(result.map(value => value.assetId)).toEqual(["glb_public_a", "glb_public_b"]);
  });

  it("selects equipment only inside the confirmed slot and is stable for the same item identity", () => {
    const source = catalog([
      entry({ assetId: "glb_weapon_a", purpose: "equipment", assetType: "weapon", equipmentSlot: "weapon" }),
      entry({ assetId: "glb_weapon_b", purpose: "equipment", assetType: "weapon", equipmentSlot: "weapon" }),
      entry({ assetId: "glb_helmet", purpose: "equipment", assetType: "armor", equipmentSlot: "helmet" }),
      entry({ assetId: "glb_auto_weapon", purpose: "auto", assetType: "weapon", equipmentSlot: "weapon" }),
    ]);
    const first = selectEquipmentCatalogAsset(source, "weapon", "item:sword:receipt:42");
    const second = selectEquipmentCatalogAsset(source, "weapon", "item:sword:receipt:42");
    expect(second?.assetId).toBe(first?.assetId);
    expect(first?.equipmentSlot).toBe("weapon");
    expect(selectEquipmentCatalogAsset(source, "boots", "item:boots:42")).toBeNull();
  });

  it("binds the owner return-stone GLB only by exact immutable catalog identity", () => {
    const approved = returnStoneEntry();
    const source = catalog([
      approved,
      returnStoneEntry({ assetId: "glb_wrong_identity" }),
      returnStoneEntry({ sha256: sha("9"), storageUrl: `/api/assets/glb/${sha("9")}.glb` }),
      entry({ assetId: "glb_other_portal", purpose: "world-environment", assetType: "arena", subcategory: "teleporter" }),
    ]);
    expect(returnStoneCatalogAsset(source)).toEqual(approved);
    expect(returnStoneVisualPlacement(source)).toMatchObject({
      asset: approved,
      xMm: AURION_RETURN_STONE_POSITION.x,
      zMm: AURION_RETURN_STONE_POSITION.z,
      rotationQuarterTurns: 0,
    });
    expect(returnStoneCatalogAsset(catalog([returnStoneEntry({ purpose: "auto" })]))).toBeNull();
    expect(returnStoneCatalogAsset(catalog([returnStoneEntry({ subcategory: "fountain" })]))).toBeNull();
  });

  it("binds the owner fountain only when the complete two-stage family matches immutable hashes", () => {
    const approved = fountainEntry();
    const source = catalog([approved]);
    expect(villageFountainCatalogAsset(source)).toEqual(approved);
    expect(villageFountainVisualPlacement(source)).toMatchObject({
      asset: approved,
      xMm: AURION_VILLAGE_FOUNTAIN_POSITION.x,
      zMm: AURION_VILLAGE_FOUNTAIN_POSITION.z,
      rotationQuarterTurns: 0,
    });
    expect(villageFountainCatalogAsset(catalog([fountainEntry({ sha256: sha("9") })]))).toBeNull();
    expect(villageFountainCatalogAsset(catalog([fountainEntry({ subcategory: "street-prop" })]))).toBeNull();
    expect(villageFountainCatalogAsset(catalog([fountainEntry({ lods: [approved.lods![0]!] })]))).toBeNull();
  });

  it("binds the owner street lamp only when the complete four-stage family matches immutable hashes", () => {
    const approved = streetLampEntry();
    const source = catalog([approved]);
    expect(villageStreetLampCatalogAsset(source)).toEqual(approved);
    const placements = villageStreetLampVisualPlacements(source);
    expect(placements).toHaveLength(AURION_VILLAGE_STREET_LAMP_PLACEMENTS.length);
    expect(placements.map(value => [value.xMm, value.zMm, value.rotationQuarterTurns])).toEqual(
      AURION_VILLAGE_STREET_LAMP_PLACEMENTS.map(value => [value.x, value.z, value.rotationQuarterTurns]),
    );
    expect(placements.every(value => value.asset === approved)).toBe(true);
    expect(villageStreetLampCatalogAsset(catalog([streetLampEntry({ sha256: sha("9") })]))).toBeNull();
    expect(villageStreetLampCatalogAsset(catalog([streetLampEntry({ subcategory: "fountain" })]))).toBeNull();
    expect(villageStreetLampCatalogAsset(catalog([streetLampEntry({ lods: approved.lods!.slice(0, 3) })]))).toBeNull();
  });

  it("keeps uploaded world visuals deterministic and purpose-separated", () => {
    const source = catalog([
      entry({ assetId: "glb_house", purpose: "world-environment", assetType: "arena", subcategory: "building" }),
      fountainEntry(),
      streetLampEntry(),
      returnStoneEntry(),
      entry({ assetId: "glb_tree", purpose: "world-nature", assetType: "arena", subcategory: "tree" }),
      entry({ assetId: "glb_rock", purpose: "world-nature", assetType: "arena", subcategory: "rock" }),
    ]);
    const settlement = uploadedWorldVisualsForChunk(source, OUTER_SETTLEMENT);
    expect(uploadedWorldVisualsForChunk(source, OUTER_SETTLEMENT)).toEqual(settlement);
    expect(settlement.length).toBeGreaterThan(0);
    expect(settlement.every(value => value.asset.purpose === "world-environment")).toBe(true);
    expect(settlement.every(value => value.asset.sha256 !== AURION_RETURN_STONE_SOURCE_SHA256)).toBe(true);
    expect(settlement.every(value => value.asset.sha256 !== AURION_VILLAGE_FOUNTAIN_LODS[0].sha256)).toBe(true);
    expect(settlement.every(value => value.asset.sha256 !== AURION_VILLAGE_STREET_LAMP_LODS[0].sha256)).toBe(true);

    const nature = uploadedWorldVisualsForChunk(source, { x: 2, z: 2 });
    expect(nature.length).toBeGreaterThan(0);
    expect(nature.every(value => value.asset.purpose === "world-nature")).toBe(true);
    expect(nature).not.toEqual(settlement);
  });
});

/**
 * Owner design brief 2026-11-10 for the automatic layout of uploaded models: nothing
 * automatic inside the starter city walls, houses only on a lot adjoining the road
 * network, nothing on a road, and trees never outnumbering flowers and grasses.
 */
describe("uploaded world visual design rules", () => {
  const SUBCATEGORIES = ["building", "structure", "teleporter", "fountain", "street-prop", "tree", "plant", "rock", "other"] as const;
  const everything = (revision: string) => catalog((["world-environment", "world-nature"] as const).flatMap(purpose =>
    SUBCATEGORIES.flatMap(subcategory => [1, 2].map(n => entry({
      assetId: `glb_${purpose}_${subcategory}_${n}`, sha256: `${purpose}:${subcategory}:${n}`.padEnd(64, "0"),
      purpose, assetType: "arena", subcategory,
    })))), revision);
  const rect = (value: UploadedWorldVisualPlacement): WorldGroundRectMm => {
    const half = Math.round(targetSizeMeters(value.asset.subcategory) * 500);
    return { minX: value.xMm - half, maxX: value.xMm + half, minZ: value.zMm - half, maxZ: value.zMm + half };
  };
  const overlap = (a: WorldGroundRectMm, b: WorldGroundRectMm) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  const chunks: WorldChunkCoordinate[] = [];
  for (let z = -7; z <= 7; z++) for (let x = -7; x <= 7; x++) chunks.push({ x, z });
  const sources = [everything(sha("a")), everything(sha("b"))];
  const forEachChunk = (visit: (placements: readonly UploadedWorldVisualPlacement[], coordinate: WorldChunkCoordinate) => void) => {
    for (const source of sources) for (const coordinate of chunks) visit(uploadedWorldVisualsForChunk(source, coordinate), coordinate);
  };

  it("places nothing automatic inside the starter city walls or their clearance", () => {
    const source = sources[0]!;
    expect(uploadedWorldVisualsForChunk(source, { x: 0, z: 0 })).toEqual([]);
    const cityHalfMm = STARTER_CITY_FLAT_HALF_EXTENT_M * 1000;
    let outside = 0;
    forEachChunk(placements => {
      for (const value of placements) {
        const r = rect(value);
        // The square footprint stays completely outside the flat city square.
        expect(r.minX >= cityHalfMm || r.maxX <= -cityHalfMm || r.minZ >= cityHalfMm || r.maxZ <= -cityHalfMm).toBe(true);
        outside += 1;
      }
    });
    expect(outside).toBeGreaterThan(1000);
    // The chunks the wall reaches into still carry models on their outer side.
    expect(uploadedWorldVisualsForChunk(source, { x: 1, z: 1 }).length).toBeGreaterThan(0);
  });

  it("puts every uploaded house and structure on a lot adjoining the road network and nothing on a road", () => {
    let roadBound = 0, others = 0;
    forEachChunk(placements => {
      for (const value of placements) {
        const r = rect(value);
        expect(overlapsWorldRoad(r)).toBe(false);
        if (isRoadBoundUploadedAsset(value.asset)) {
          expect(adjoinsWorldRoad(r)).toBe(true);
          roadBound += 1;
        } else others += 1;
      }
    });
    expect(roadBound).toBeGreaterThan(500);
    expect(others).toBeGreaterThan(500);
  });

  it("never stacks an uploaded model on an Aurion world placement or on another uploaded model", () => {
    forEachChunk((placements, coordinate) => {
      const planned: WorldGroundRectMm[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        for (const placement of worldAssetsForChunk(GLOBAL_WORLD_SEED, { x: coordinate.x + dx, z: coordinate.z + dz })) {
          planned.push(worldAssetGroundRectMm(worldAssetById.get(placement.assetId)!, placement));
        }
      }
      const rects = placements.map(rect);
      rects.forEach((r, index) => {
        expect(planned.some(other => overlap(r, other))).toBe(false);
        expect(rects.some((other, otherIndex) => otherIndex > index && overlap(r, other))).toBe(false);
      });
    });
  });

  it("keeps uploaded trees in the minority against flowers and grasses", () => {
    const trees = (placements: readonly UploadedWorldVisualPlacement[]) => placements.filter(value => value.asset.subcategory === "tree").length;
    const flora = (placements: readonly UploadedWorldVisualPlacement[]) => placements.filter(value => value.asset.subcategory === "plant").length;
    const plannedSurplus = (coordinate: WorldChunkCoordinate) => {
      const assets = worldAssetsForChunk(GLOBAL_WORLD_SEED, coordinate).map(placement => worldAssetById.get(placement.assetId)!);
      return assets.filter(isFloraAsset).length - assets.filter(isCompleteTreeAsset).length;
    };
    let withTrees = 0;
    forEachChunk((placements, coordinate) => {
      if (trees(placements)) withTrees += 1;
      // Aurion's own plan plus the uploaded models: flowers and grasses stay in the majority.
      if (trees(placements)) expect(plannedSurplus(coordinate) + flora(placements)).toBeGreaterThan(trees(placements));
    });
    expect(withTrees).toBeGreaterThan(20);

    // Only trees uploaded: a settlement gets none, open wilderness at most two per chunk.
    const onlyTrees = catalog([
      entry({ assetId: "glb_env_tree", purpose: "world-environment", assetType: "arena", subcategory: "tree" }),
      entry({ assetId: "glb_wild_tree", purpose: "world-nature", assetType: "arena", subcategory: "tree" }),
    ]);
    expect(uploadedWorldVisualsForChunk(onlyTrees, OUTER_SETTLEMENT)).toEqual([]);
    const wild = uploadedWorldVisualsForChunk(onlyTrees, { x: 3, z: 3 });
    expect(wild.length).toBeGreaterThan(0);
    expect(wild.length).toBeLessThanOrEqual(2);
  });

  it("keeps an anchor index bound to one spot of its chunk across catalog revisions", () => {
    const spots = new Map<string, string>();
    forEachChunk(placements => {
      for (const value of placements) {
        const [, , chunkX, chunkZ, anchor] = value.id.split(":");
        const key = `${chunkX}:${chunkZ}:${anchor}`;
        const spot = `${value.xMm}:${value.zMm}`;
        expect(spots.get(key) ?? spot).toBe(spot);
        spots.set(key, spot);
      }
    });
  });
});
