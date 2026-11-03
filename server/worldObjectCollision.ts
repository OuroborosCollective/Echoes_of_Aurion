import { validWorldPosition } from "../shared/zonePresenceContract";
import { sweptCircleHitsHull, WORLD_PLAYER_COLLISION_RADIUS_MM, type GroundPoint } from "./worldNatureCollision";
import { requireWorldCollisionSnapshot, type WorldCollisionObject, type WorldCollisionSnapshot } from "../shared/worldObjectCollisionContract";
export { makeWorldCollisionSnapshot, requireWorldCollisionSnapshot } from "../shared/worldObjectCollisionContract";

function scaled(value: number, scale: number): number {
  const numerator = BigInt(value) * BigInt(scale), magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude + 500n) / 1000n;
  return Number(numerator < 0n ? -rounded : rounded);
}
function point(value: readonly number[], object: WorldCollisionObject): GroundPoint {
  const x = scaled(value[0]!, object.scalePermille), z = scaled(value[1]!, object.scalePermille);
  switch (object.rotationQuarterTurns) {
    case 1: return { x: z, z: -x };
    case 2: return { x: -x, z: -z };
    case 3: return { x: -z, z: x };
    default: return { x, z };
  }
}
type Hull = { id: string; origin: GroundPoint; points: GroundPoint[]; min: GroundPoint; max: GroundPoint };

/** Derived broadphase only. The immutable recorded input is sufficient for an
 * independent replay; current catalog/DB/files/clock are never read here. */
export class WorldObjectCollision {
  private readonly value: WorldCollisionSnapshot;
  private readonly cells = new Map<string, Hull[]>();
  get snapshot(): WorldCollisionSnapshot { return structuredClone(this.value); }
  constructor(snapshot: WorldCollisionSnapshot) {
    this.value = requireWorldCollisionSnapshot(snapshot);
    let references = 0;
    for (const object of this.value.objects) for (const source of object.hulls) {
      const points = source.map(p => point(p, object));
      const hull: Hull = { id: object.id, origin: object.origin, points,
        min: { x: Math.min(...points.map(p => p.x)), z: Math.min(...points.map(p => p.z)) },
        max: { x: Math.max(...points.map(p => p.x)), z: Math.max(...points.map(p => p.z)) } };
      const radius = WORLD_PLAYER_COLLISION_RADIUS_MM;
      for (let x = Math.floor((object.origin.x + hull.min.x - radius) / 64000); x <= Math.floor((object.origin.x + hull.max.x + radius) / 64000); x++) {
        for (let z = Math.floor((object.origin.z + hull.min.z - radius) / 64000); z <= Math.floor((object.origin.z + hull.max.z + radius) / 64000); z++) {
          if (++references > 131072) throw Error("WORLD_OBJECT_COLLISION_SPATIAL_BUDGET");
          const key = `${x}:${z}`, bucket = this.cells.get(key) ?? [];
          bucket.push(hull); this.cells.set(key, bucket);
        }
      }
    }
  }
  blockingObject(from: GroundPoint, to: GroundPoint): string | undefined {
    if (!validWorldPosition(from) || !validWorldPosition(to)) throw Error("WORLD_OBJECT_COLLISION_POSITION_INVALID");
    if (Math.abs(to.x - from.x) > 340 || Math.abs(to.z - from.z) > 340) throw Error("WORLD_OBJECT_COLLISION_STEP_EXCEEDED");
    const seen = new Set<Hull>(), radius = WORLD_PLAYER_COLLISION_RADIUS_MM;
    for (let x = Math.floor(Math.min(from.x,to.x) / 64000); x <= Math.floor(Math.max(from.x,to.x) / 64000); x++) {
      for (let z = Math.floor(Math.min(from.z,to.z) / 64000); z <= Math.floor(Math.max(from.z,to.z) / 64000); z++) {
        for (const hull of this.cells.get(`${x}:${z}`) ?? []) {
          if (seen.has(hull)) continue; seen.add(hull);
          const a = { x: from.x - hull.origin.x, z: from.z - hull.origin.z }, b = { x: to.x - hull.origin.x, z: to.z - hull.origin.z };
          if (Math.max(a.x,b.x) + radius < hull.min.x || Math.min(a.x,b.x) - radius > hull.max.x
            || Math.max(a.z,b.z) + radius < hull.min.z || Math.min(a.z,b.z) - radius > hull.max.z) continue;
          if (sweptCircleHitsHull(a,b,hull.points)) return hull.id;
        }
      }
    }
    return undefined;
  }
  resolve(from: GroundPoint, to: GroundPoint, otherBlocked?: (from: GroundPoint, to: GroundPoint) => boolean): GroundPoint {
    const blocked = (end: GroundPoint) => this.blockingObject(from,end) !== undefined || Boolean(otherBlocked?.(from,end));
    if (!blocked(to)) return { ...to };
    for (const slide of [{x:to.x,z:from.z},{x:from.x,z:to.z}]) {
      if ((slide.x !== from.x || slide.z !== from.z) && !blocked(slide)) return slide;
    }
    return { ...from };
  }
}
