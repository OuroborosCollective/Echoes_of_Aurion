import { WORLD_CHUNK_SIZE_MM } from "./worldChunkCoordinates";

/**
 * Canonical Aurion road network (owner design brief 2026-11-10).
 *
 * The road network is exactly the base-chunk road tiles (`isBaseChunkRoadTile`:
 * tile 8 of 16 on either axis). In world space those tiles form two families of
 * 4 m wide strips, `[0 m, 4 m)` from every chunk centre on X and on Z. The two
 * strips of the origin chunk are the main axes of the starter village, so every
 * road cell of the world is connected to the starter village zone: the network
 * has its origin there and nothing else may declare a road.
 *
 * Pure integer geometry shared by the server placement plan and by presentation
 * layers. It adds no second road truth; `server/worldRoadNetwork.test.ts` binds it
 * to `isBaseChunkRoadTile`.
 */
export const WORLD_ROAD_WIDTH_MM = 4_000 as const;
/** A lot counts as adjoining a road when its footprint is at most this far from the kerb. */
export const WORLD_ROAD_FRONTAGE_MAX_GAP_MM = 2_000 as const;

const period = (valueMm: number) => ((valueMm % WORLD_CHUNK_SIZE_MM) + WORLD_CHUNK_SIZE_MM) % WORLD_CHUNK_SIZE_MM;

/** True when the world position lies on a road strip (either direction). */
export function isWorldRoadPositionMm(xMm: number, zMm: number): boolean {
  return period(xMm) < WORLD_ROAD_WIDTH_MM || period(zMm) < WORLD_ROAD_WIDTH_MM;
}

/**
 * Distance of the half-open interval `[minMm, maxMm)` to the nearest road strip
 * running across this axis, or -1 when the interval overlaps a strip.
 */
export function worldRoadAxisGapMm(minMm: number, maxMm: number): number {
  if (!Number.isSafeInteger(minMm) || !Number.isSafeInteger(maxMm) || maxMm <= minMm) throw new Error("WORLD_ROAD_INTERVAL_INVALID");
  const start = period(minMm), end = start + (maxMm - minMm);
  if (start < WORLD_ROAD_WIDTH_MM || end > WORLD_CHUNK_SIZE_MM) return -1;
  return Math.min(start - WORLD_ROAD_WIDTH_MM, WORLD_CHUNK_SIZE_MM - end);
}

export type WorldGroundRectMm = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

/** True when the ground rectangle covers any part of a road strip. */
export function overlapsWorldRoad(rect: WorldGroundRectMm): boolean {
  return worldRoadAxisGapMm(rect.minX, rect.maxX) < 0 || worldRoadAxisGapMm(rect.minZ, rect.maxZ) < 0;
}

/**
 * Gap between the rectangle and the nearest kerb, or -1 when it stands on a road.
 * A house lot must return a value in `[0, WORLD_ROAD_FRONTAGE_MAX_GAP_MM]`.
 */
export function worldRoadFrontageGapMm(rect: WorldGroundRectMm): number {
  const x = worldRoadAxisGapMm(rect.minX, rect.maxX), z = worldRoadAxisGapMm(rect.minZ, rect.maxZ);
  return x < 0 || z < 0 ? -1 : Math.min(x, z);
}

export function adjoinsWorldRoad(rect: WorldGroundRectMm): boolean {
  const gap = worldRoadFrontageGapMm(rect);
  return gap >= 0 && gap <= WORLD_ROAD_FRONTAGE_MAX_GAP_MM;
}
