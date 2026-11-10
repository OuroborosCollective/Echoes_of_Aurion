import { describe, expect, it } from "vitest";
import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "../shared/aurionStarterCityWallContract";
import { worldAssetById, worldAssetsForChunk } from "../shared/worldAssetProtocol";
import { WorldNatureCollision } from "./worldNatureCollision";

/**
 * Exact source-catalog LOD envelopes, not a made-up fixed house size.
 * A placement is unsafe if any approved LOD touches the published
 * 110 x 110 m city-wall envelope plus a 6 m construction clearance.
 *
 * Issue #659 applied this to city GLBs only and deliberately kept the nature
 * placements (and their colliders) of the neighbouring chunks. The owner design
 * brief of 2026-11-10 supersedes that: the starter village inside the walls is a
 * flat hand-designed plane, so trees, rocks, flowers and props are excluded too.
 * Their colliders are removed with them, explicitly and by the same plan.
 */
function intersectsStarterWall(placement: ReturnType<typeof worldAssetsForChunk>[number]): boolean {
  const asset = worldAssetById.get(placement.assetId);
  if (!asset) throw new Error("WORLD_ASSET_CATALOG_MISSING");
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

describe("Issue #659 + owner brief 2026-11-10: nothing procedural inside the published starter-city wall", () => {
  it("never places any procedural GLB of any family inside or through the wall clearance", () => {
    const families = new Set<string>();
    for (const seed of ["echoes-of-aurion-v1", "seed-a", "seed-b"]) {
      for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
        if (x === 0 && z === 0) continue; // authored starter-village markers stay under their separate contract
        for (const placement of worldAssetsForChunk(seed, { x, z })) {
          expect(intersectsStarterWall(placement), `${seed} chunk(${x},${z}) ${placement.id} ${placement.assetId}`).toBe(false);
          families.add(worldAssetById.get(placement.assetId)!.family);
        }
      }
    }
    // Both families are still generated right outside the walls, so the rule is not vacuous.
    expect([...families].sort()).toEqual(["city", "nature"]);
  });

  it("removes the movement colliders together with the placements: no solid hull inside the walls", () => {
    const world = new WorldNatureCollision();
    let obstacles = 0;
    for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
      for (const obstacle of world.obstaclesForChunk({ x, z })) {
        obstacles++;
        const xs = obstacle.hull.map(point => obstacle.origin.x + point.x), zs = obstacle.hull.map(point => obstacle.origin.z + point.z);
        const outside = Math.min(...xs) >= 55_000 || Math.max(...xs) <= -55_000 || Math.min(...zs) >= 55_000 || Math.max(...zs) <= -55_000;
        expect(outside, `${obstacle.id} ${obstacle.assetId}`).toBe(true);
      }
    }
    expect(obstacles).toBeGreaterThan(10);
    expect(world.obstaclesForChunk({ x: 0, z: 0 })).toEqual([]);
    // A walk along both village diagonals and both main axes, wall to wall, meets no procedural obstacle.
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
      for (let step = -54_900; step < 54_900; step += 300) {
        const from = { x: dx * step, z: dz * step }, to = { x: dx * (step + 300), z: dz * (step + 300) };
        expect(world.blockingObstacle(from, to), `${from.x},${from.z}`).toBeUndefined();
      }
    }
  });

  it("retains stable exterior city/nature generation and preserves exact authored village", () => {
    for (const seed of ["seed-a", "seed-b"]) {
      for (const coordinate of [{ x: 6, z: 0 }, { x: -6, z: -6 }, { x: 24, z: 24 }, { x: 3, z: -3 }, { x: -93, z: 48 }]) {
        expect(worldAssetsForChunk(seed, coordinate)).toHaveLength(12);
        expect(worldAssetsForChunk(seed, coordinate)).toEqual(worldAssetsForChunk(seed, coordinate));
      }
    }
    // The chunk west of the village: only what lies beyond the wall clearance remains,
    // and every remaining placement is nature.
    const adjacentNature = worldAssetsForChunk("seed-a", { x: -1, z: 0 });
    expect(adjacentNature.length).toBeGreaterThan(0);
    expect(adjacentNature.length).toBeLessThan(12);
    expect(adjacentNature.every(p => worldAssetById.get(p.assetId)?.family === "nature")).toBe(true);
    expect(adjacentNature.every(p => p.xMm < -61_000)).toBe(true);
    const village = worldAssetsForChunk("seed-a", { x: 0, z: 0 });
    expect(village).toHaveLength(10);
    expect(worldAssetsForChunk("seed-b", { x: 0, z: 0 })).toEqual(village);
  });
});
