import { AX1_INITIAL_RESOURCE_NODES } from "@shared/ax1ResourceEcologyProtocol";

/**
 * Ore outcrops of the browser presentation (owner design brief 2026-11-10): an ore
 * vein never lies on bare flat ground, it crowns a raised rock outcrop.
 *
 * The outcrop is part of the presentation ground query, so the player, camera, NPCs
 * and the ore visual all stand on the same rise. Presentation only: the resource
 * node, its position and its availability remain Aurion's confirmed truth, and no
 * terrain or collision truth is created here.
 */
export const ORE_OUTCROP_HEIGHT_M = 1.1;
/** Radius of the level crown the ore stands on. */
export const ORE_OUTCROP_CROWN_RADIUS_M = 1.2;
/** Radius at which the outcrop has fully merged with the surrounding ground. */
export const ORE_OUTCROP_RADIUS_M = 3.6;

const ORE_SITES = Object.freeze(AX1_INITIAL_RESOURCE_NODES
  .filter(node => node.nodeKind === "ore")
  .map(node => Object.freeze({ nodeId: node.id, x: node.xFixed / 1000, z: node.zFixed / 1000 })));

export function oreOutcropSites(): readonly { nodeId: string; x: number; z: number }[] {
  return ORE_SITES;
}

/** Height of the outcrop profile at a horizontal distance from the vein. */
export function oreOutcropProfileM(distance: number): number {
  if (!(distance > ORE_OUTCROP_CROWN_RADIUS_M)) return ORE_OUTCROP_HEIGHT_M;
  if (distance >= ORE_OUTCROP_RADIUS_M) return 0;
  const t = (distance - ORE_OUTCROP_CROWN_RADIUS_M) / (ORE_OUTCROP_RADIUS_M - ORE_OUTCROP_CROWN_RADIUS_M);
  return ORE_OUTCROP_HEIGHT_M * (1 - t * t * (3 - 2 * t));
}

/** Ground rise contributed by ore outcrops at a world position (0 away from every vein). */
export function oreOutcropHeightM(x: number, z: number): number {
  let height = 0;
  for (const site of ORE_SITES) {
    const dx = x - site.x, dz = z - site.z;
    if (Math.abs(dx) >= ORE_OUTCROP_RADIUS_M || Math.abs(dz) >= ORE_OUTCROP_RADIUS_M) continue;
    height = Math.max(height, oreOutcropProfileM(Math.hypot(dx, dz)));
  }
  return height;
}
