/**
 * Presentation-only actor LOD contract.
 *
 * Distances and animation scheduling may reduce render cost, but they never
 * change confirmed positions, gameplay entities, collision, combat or world
 * state. Every confirmed actor remains represented: near/mid as a skinned GLB
 * when available, far/very-far through a bounded visual proxy.
 */
export type ActorLodBand = "near" | "mid" | "far" | "very_far";

export const ACTOR_LOD_NEAR_MAX_METERS = 24;
export const ACTOR_LOD_MID_MAX_METERS = 56;
export const ACTOR_LOD_FAR_MAX_METERS = 120;

export const actorAnimationStride: Readonly<Record<ActorLodBand, 0 | 1 | 3>> = Object.freeze({
  near: 1,
  mid: 3,
  far: 0,
  very_far: 0,
});

export function actorLodBand(distanceMeters: number): ActorLodBand {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) throw new Error("ACTOR_LOD_DISTANCE_INVALID");
  if (distanceMeters < ACTOR_LOD_NEAR_MAX_METERS) return "near";
  if (distanceMeters < ACTOR_LOD_MID_MAX_METERS) return "mid";
  if (distanceMeters < ACTOR_LOD_FAR_MAX_METERS) return "far";
  return "very_far";
}

export function actorUsesSkinnedVisual(band: ActorLodBand): boolean {
  return band === "near" || band === "mid";
}

function actorHash(value: string): number {
  if (!value.trim() || value.length > 256) throw new Error("ACTOR_LOD_IDENTITY_INVALID");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Mid-distance mixers are phase-staggered by stable actor identity so a crowd
 * does not wake every AnimationMixer on the same render frame. Far bands never
 * advance a skinned mixer; their visual proxy stays position-authoritative.
 */
export function shouldUpdateActorAnimation(logicalTick: number, actorIdentity: string, band: ActorLodBand): boolean {
  if (!Number.isSafeInteger(logicalTick) || logicalTick < 0) throw new Error("ACTOR_LOD_TICK_INVALID");
  const stride = actorAnimationStride[band];
  if (stride === 0) return false;
  if (stride === 1) return true;
  return logicalTick % stride === actorHash(actorIdentity) % stride;
}

export type ActorLodCounts = Readonly<Record<ActorLodBand, number>>;
export function emptyActorLodCounts(): ActorLodCounts {
  return Object.freeze({ near: 0, mid: 0, far: 0, very_far: 0 });
}
