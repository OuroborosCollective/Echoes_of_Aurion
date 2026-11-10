import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "@shared/aurionStarterCityWallContract";
import { STARTER_CITY_LEVEL_BLEND_MM } from "@shared/deterministicTerrainPipelineProtocol";
import { STARTER_CITY_PROCEDURAL_CLEARANCE_MM } from "@shared/worldAssetProtocol";

/**
 * Starter-city ground envelope of the browser presentation (owner design brief
 * 2026-11-10): inside the city walls the ground is one flat plane and carries no
 * legacy client scenery. Only Aurion-confirmed content (authored starter village,
 * city wall, admin placements, NPCs, resource nodes) is projected there.
 *
 * The envelope is the same square the Aurion placement plan keeps free of
 * procedural models (`intersectsStarterCityWallClearance`): the wall envelope plus
 * its clearance. Presentation only; it creates no terrain or collision truth.
 */
export const STARTER_CITY_FLAT_HALF_EXTENT_M =
  (AURION_STARTER_CITY_WALL_ENVELOPE_MM[0] / 2 + STARTER_CITY_PROCEDURAL_CLEARANCE_MM) / 1000;
export const STARTER_CITY_GROUND_BLEND_M = STARTER_CITY_LEVEL_BLEND_MM / 1000;

const chebyshev = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));

/** 0 on the flat city plane, 1 on natural terrain, smooth in the blend ring between. */
export function starterCityGroundFactor(x: number, z: number): number {
  const t = (chebyshev(x, z) - STARTER_CITY_FLAT_HALF_EXTENT_M) / STARTER_CITY_GROUND_BLEND_M;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** True when a circular footprint touches the flat city plane. */
export function touchesStarterCityGround(x: number, z: number, radius = 0): boolean {
  return chebyshev(x, z) - Math.max(0, radius) < STARTER_CITY_FLAT_HALF_EXTENT_M;
}
