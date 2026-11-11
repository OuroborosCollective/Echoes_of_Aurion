import { describe, expect, it } from "vitest";
import { AURION_STARTER_VILLAGE_CENTER_MM, AURION_STARTER_VILLAGE_GATES } from "../shared/aurionStarterVillageContract";
import { isBaseChunkRoadTile, splitWorldChunkPositionMm } from "../shared/worldChunkProtocol";
import {
  WORLD_ROAD_FRONTAGE_MAX_GAP_MM,
  WORLD_ROAD_WIDTH_MM,
  adjoinsWorldRoad,
  isWorldRoadPositionMm,
  overlapsWorldRoad,
  worldRoadAxisGapMm,
  worldRoadFrontageGapMm,
} from "../shared/worldRoadNetwork";

const TILE_MM = 4_000;
/** The canonical owner of "is this a road": the base-chunk tile rule. */
function canonicalRoad(xMm: number, zMm: number): boolean {
  const { localPositionMm } = splitWorldChunkPositionMm({ x: xMm, z: zMm });
  return isBaseChunkRoadTile({ x: Math.floor(localPositionMm.x / TILE_MM), z: Math.floor(localPositionMm.z / TILE_MM) });
}

describe("canonical Aurion road network (owner design brief 2026-11-10)", () => {
  it("is exactly the base-chunk road tiles, also across negative and far chunks", () => {
    expect(WORLD_ROAD_WIDTH_MM).toBe(TILE_MM);
    for (const origin of [{ x: 0, z: 0 }, { x: -64_000, z: 128_000 }, { x: 63_999_936_000, z: -63_999_936_000 }]) {
      for (let dx = -70_000; dx <= 70_000; dx += 1_000) for (let dz = -70_000; dz <= 70_000; dz += 7_000) {
        const x = origin.x + dx, z = origin.z + dz + (dx % 3_000);
        expect(isWorldRoadPositionMm(x, z), `${x},${z}`).toBe(canonicalRoad(x, z));
      }
    }
    // Exact kerbs of the half-open strip [0 m, 4 m).
    for (const [value, road] of [[-1, false], [0, true], [3_999, true], [4_000, false], [63_999, false], [64_000, true], [-64_000, true], [-60_001, true], [-60_000, false]] as const) {
      expect(isWorldRoadPositionMm(value, 20_000), `x=${value}`).toBe(road);
      expect(isWorldRoadPositionMm(20_000, value), `z=${value}`).toBe(road);
    }
  });

  it("originates in the starter village: every road tile is connected to the village centre", () => {
    expect(isWorldRoadPositionMm(AURION_STARTER_VILLAGE_CENTER_MM.x, AURION_STARTER_VILLAGE_CENTER_MM.z)).toBe(true);
    // The two road strips of the origin chunk leave the village through its four gate positions.
    for (const gate of AURION_STARTER_VILLAGE_GATES) expect(isWorldRoadPositionMm(gate.position.x, gate.position.z), gate.id).toBe(true);
    // Flood fill over 4 m tiles of an 11 x 11 chunk window, starting at the village centre.
    const half = 88, key = (x: number, z: number) => `${x}:${z}`;
    const road = (x: number, z: number) => Math.abs(x) <= half && Math.abs(z) <= half && canonicalRoad(x * TILE_MM, z * TILE_MM);
    const seen = new Set<string>([key(0, 0)]), queue: [number, number][] = [[0, 0]];
    while (queue.length) {
      const [x, z] = queue.pop()!;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as const) {
        if (!road(nx, nz) || seen.has(key(nx, nz))) continue;
        seen.add(key(nx, nz)); queue.push([nx, nz]);
      }
    }
    let roadTiles = 0;
    for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) if (road(x, z)) roadTiles++;
    expect(roadTiles).toBeGreaterThan(3_000);
    expect(seen.size).toBe(roadTiles);
  });

  it("measures lot frontage against the kerb and rejects anything standing on a road", () => {
    expect(worldRoadAxisGapMm(4_000, 9_000)).toBe(0);
    expect(worldRoadAxisGapMm(5_500, 9_000)).toBe(1_500);
    expect(worldRoadAxisGapMm(-9_000, -1_500)).toBe(1_500);
    expect(worldRoadAxisGapMm(-9_000, 0)).toBe(0);
    expect(worldRoadAxisGapMm(-9_000, 1)).toBe(-1);
    expect(worldRoadAxisGapMm(3_999, 9_000)).toBe(-1);
    expect(worldRoadAxisGapMm(10_000, 80_000)).toBe(-1);
    expect(worldRoadAxisGapMm(-64_000 * 7 + 30_000, -64_000 * 7 + 34_000)).toBe(26_000);
    expect(() => worldRoadAxisGapMm(5, 5)).toThrow("WORLD_ROAD_INTERVAL_INVALID");
    expect(() => worldRoadAxisGapMm(0.5, 5)).toThrow("WORLD_ROAD_INTERVAL_INVALID");

    const lot = { minX: 5_500, maxX: 12_000, minZ: 20_000, maxZ: 31_000 };
    expect(overlapsWorldRoad(lot)).toBe(false);
    expect(worldRoadFrontageGapMm(lot)).toBe(1_500);
    expect(adjoinsWorldRoad(lot)).toBe(true);
    // In the middle of a field: no road, so no house.
    const field = { minX: 26_000, maxX: 37_000, minZ: 26_000, maxZ: 34_000 };
    expect(overlapsWorldRoad(field)).toBe(false);
    expect(worldRoadFrontageGapMm(field)).toBeGreaterThan(WORLD_ROAD_FRONTAGE_MAX_GAP_MM);
    expect(adjoinsWorldRoad(field)).toBe(false);
    // Across the road: never.
    const blocking = { minX: 2_000, maxX: 12_000, minZ: 20_000, maxZ: 31_000 };
    expect(overlapsWorldRoad(blocking)).toBe(true);
    expect(worldRoadFrontageGapMm(blocking)).toBe(-1);
    expect(adjoinsWorldRoad(blocking)).toBe(false);
  });
});
