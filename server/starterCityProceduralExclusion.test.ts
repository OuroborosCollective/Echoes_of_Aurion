import { describe, expect, it } from "vitest";
import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "../shared/aurionStarterCityWallContract";
import { worldAssetById, worldAssetsForChunk } from "../shared/worldAssetProtocol";

/**
 * Exact source-catalog LOD envelopes, not a made-up fixed house size.
 * A city placement is unsafe if any approved LOD touches the published
 * 110 x 110 m city-wall envelope plus a 6 m construction clearance.
 */
function intersectsStarterWall(placement: ReturnType<typeof worldAssetsForChunk>[number]): boolean {
  const asset = worldAssetById.get(placement.assetId);
  if (!asset) throw new Error("WORLD_ASSET_CATALOG_MISSING");
  if (asset.family !== "city") return false;
  const halfX = Math.ceil(Math.max(...asset.lods.map(lod =>
    lod.bounds.max[0] - lod.bounds.min[0])) * asset.scale * 500);
  const halfZ = Math.ceil(Math.max(...asset.lods.map(lod =>
    lod.bounds.max[2] - lod.bounds.min[2])) * asset.scale * 500);
  const xHalf = placement.rotation % 2 === 0 ? halfX : halfZ;
  const zHalf = placement.rotation % 2 === 0 ? halfZ : halfX;
  const clearanceMm = 6_000;
  return Math.abs(placement.xMm) - xHalf < AURION_STARTER_CITY_WALL_ENVELOPE_MM[0] / 2 + clearanceMm
    && Math.abs(placement.zMm) - zHalf < AURION_STARTER_CITY_WALL_ENVELOPE_MM[2] / 2 + clearanceMm;
}

describe("Issue #659: no procedural structures through the published starter-city wall", () => {
  it("never places generic city GLBs inside or through the wall clearance across nearby chunks", () => {
    for (const seed of ["echoes-of-aurion-v1", "seed-a", "seed-b"]) {
      for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
        if (x === 0 && z === 0) continue; // authored starter-village markers stay under their separate contract
        for (const placement of worldAssetsForChunk(seed, { x, z })) {
          expect(intersectsStarterWall(placement), `${seed} chunk(${x},${z}) ${placement.id} ${placement.assetId}`).toBe(false);
        }
      }
    }
  });

  it("retains stable exterior city/nature generation and preserves exact authored village", () => {
    for (const seed of ["seed-a", "seed-b"]) {
      for (const coordinate of [{ x: 6, z: 0 }, { x: -6, z: -6 }, { x: 24, z: 24 }]) {
        expect(worldAssetsForChunk(seed, coordinate)).toHaveLength(12);
        expect(worldAssetsForChunk(seed, coordinate)).toEqual(worldAssetsForChunk(seed, coordinate));
      }
    }
    // All 112 nature assets carry existing game-authoritative colliders. A visual
    // clean-up must not silently remove them and change movement/replay outcomes.
    const adjacentNature = worldAssetsForChunk("seed-a", { x: -1, z: 0 });
    expect(adjacentNature).toHaveLength(12);
    expect(adjacentNature.every(p => worldAssetById.get(p.assetId)?.family === "nature")).toBe(true);
    const village = worldAssetsForChunk("seed-a", { x: 0, z: 0 });
    expect(village).toHaveLength(10);
    expect(worldAssetsForChunk("seed-b", { x: 0, z: 0 })).toEqual(village);
  });
});
