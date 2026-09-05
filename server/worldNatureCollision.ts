import { createHash } from "node:crypto";
import manifest from "../shared/worldCollisionManifest.json";
import {
  worldAssetCatalog,
  worldAssetsForChunk,
} from "../shared/worldAssetProtocol";
import { GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import {
  splitWorldChunkPositionMm,
  WORLD_CHUNK_COORDINATE_LIMIT,
  type WorldChunkCoordinate,
} from "../shared/worldChunkProtocol";

export type GroundPoint = Readonly<{ x: number; z: number }>;
export type NatureObstacle = Readonly<{
  id: string;
  assetId: string;
  origin: GroundPoint;
  hull: readonly GroundPoint[];
  min: GroundPoint;
  max: GroundPoint;
}>;
const { manifestSha256, ...payload } = manifest;
if (
  createHash("sha256").update(JSON.stringify(payload)).digest("hex") !==
    manifestSha256 ||
  manifest.bundleSha256 !== worldAssetCatalog.bundleSha256
)
  throw Error("WORLD_COLLISION_MANIFEST_INVALID");
const footprints = new Map(manifest.colliders.map(c => [c.assetId, c]));
for (const asset of worldAssetCatalog.assets)
  if (
    asset.collider &&
    footprints.get(asset.id)?.sourceSha256 !== asset.collider.sha256
  )
    throw Error("WORLD_COLLISION_SOURCE_MISMATCH");
export const WORLD_PLAYER_COLLISION_RADIUS_MM =
  manifest.playerRadiusMm + manifest.quantizationMarginMm;

// All predicates use exact integer products. Even a small hull's squared cross
// product can exceed Number's 53-bit range. No floating-point physics or clock.
const orient = (a: GroundPoint, b: GroundPoint, c: GroundPoint) =>
  BigInt(b.x - a.x) * BigInt(c.z - a.z) - BigInt(b.z - a.z) * BigInt(c.x - a.x);
const dot = (x: bigint, z: bigint) => x * x + z * z;
function nearSegment(
  p: GroundPoint,
  a: GroundPoint,
  b: GroundPoint,
  radius: bigint
): boolean {
  const x = BigInt(b.x - a.x),
    z = BigInt(b.z - a.z),
    px = BigInt(p.x - a.x),
    pz = BigInt(p.z - a.z),
    length = dot(x, z),
    projection = px * x + pz * z;
  if (projection <= 0n) return dot(px, pz) <= radius * radius;
  if (projection >= length)
    return dot(BigInt(p.x - b.x), BigInt(p.z - b.z)) <= radius * radius;
  const cross = px * z - pz * x;
  return cross * cross <= radius * radius * length;
}
function intersects(
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  d: GroundPoint
): boolean {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.z, b.z) < Math.min(c.z, d.z) ||
    Math.max(c.z, d.z) < Math.min(a.z, b.z)
  )
    return false;
  const abC = orient(a, b, c),
    abD = orient(a, b, d),
    cdA = orient(c, d, a),
    cdB = orient(c, d, b);
  return (
    ((abC <= 0n && abD >= 0n) || (abC >= 0n && abD <= 0n)) &&
    ((cdA <= 0n && cdB >= 0n) || (cdA >= 0n && cdB <= 0n))
  );
}
/** Sweep a player disc over a CCW convex ground footprint; checks the full path. */
export function sweptCircleHitsHull(
  from: GroundPoint,
  to: GroundPoint,
  hull: readonly GroundPoint[],
  radiusMm = WORLD_PLAYER_COLLISION_RADIUS_MM
): boolean {
  if (hull.length < 3 || !Number.isSafeInteger(radiusMm) || radiusMm < 0)
    throw Error("COLLISION_HULL_INVALID");
  const radius = BigInt(radiusMm);
  let fromInside = true,
    toInside = true;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!,
      b = hull[(i + 1) % hull.length]!;
    fromInside &&= orient(a, b, from) >= 0n;
    toInside &&= orient(a, b, to) >= 0n;
    if (
      intersects(from, to, a, b) ||
      nearSegment(from, a, b, radius) ||
      nearSegment(to, a, b, radius) ||
      nearSegment(a, from, to, radius) ||
      nearSegment(b, from, to, radius)
    )
      return true;
  }
  return fromInside || toInside;
}
function rotate(p: GroundPoint, quarter: number): GroundPoint {
  // Matches Three's positive rotation around Y: (x,z) -> (z,-x).
  return quarter === 0
    ? p
    : quarter === 1
      ? { x: p.z, z: -p.x }
      : quarter === 2
        ? { x: -p.x, z: -p.z }
        : { x: -p.z, z: p.x };
}

/** Bounded derived cache only; eviction never changes collision outcomes. */
export class WorldNatureCollision {
  private readonly chunks = new Map<string, readonly NatureObstacle[]>();
  constructor(private readonly worldSeed = GLOBAL_WORLD_SEED) {}
  obstaclesForChunk(
    coordinate: WorldChunkCoordinate
  ): readonly NatureObstacle[] {
    const key = `${coordinate.x}:${coordinate.z}`,
      cached = this.chunks.get(key);
    if (cached) {
      this.chunks.delete(key);
      this.chunks.set(key, cached);
      return cached;
    }
    const obstacles = worldAssetsForChunk(this.worldSeed, coordinate).flatMap(
      p => {
        const source = footprints.get(p.assetId);
        if (!source?.blocksMovement) return [];
        const hull = Object.freeze(
          source.hullMm.map(([x, z]) =>
            Object.freeze(rotate({ x: x!, z: z! }, p.rotation))
          )
        );
        return [
          Object.freeze({
            id: p.id,
            assetId: p.assetId,
            origin: Object.freeze({ x: p.xMm, z: p.zMm }),
            hull,
            min: Object.freeze({
              x: Math.min(...hull.map(v => v.x)),
              z: Math.min(...hull.map(v => v.z)),
            }),
            max: Object.freeze({
              x: Math.max(...hull.map(v => v.x)),
              z: Math.max(...hull.map(v => v.z)),
            }),
          }),
        ];
      }
    );
    this.chunks.set(key, Object.freeze(obstacles));
    if (this.chunks.size > 256)
      this.chunks.delete(this.chunks.keys().next().value!);
    return obstacles;
  }
  blockingObstacle(
    from: GroundPoint,
    to: GroundPoint
  ): NatureObstacle | undefined {
    // Production calls are one tick (at most 340 mm); reject oversized sweeps
    // rather than silently querying too few chunks.
    if (Math.abs(to.x - from.x) > 340 || Math.abs(to.z - from.z) > 340)
      throw Error("COLLISION_STEP_EXCEEDED");
    const center = splitWorldChunkPositionMm(from).coordinate;
    splitWorldChunkPositionMm(to);
    for (let z = center.z - 1; z <= center.z + 1; z++)
      for (let x = center.x - 1; x <= center.x + 1; x++) {
        if (
          Math.abs(x) > WORLD_CHUNK_COORDINATE_LIMIT ||
          Math.abs(z) > WORLD_CHUNK_COORDINATE_LIMIT
        )
          continue;
        for (const obstacle of this.obstaclesForChunk({ x, z })) {
          const a = {
              x: from.x - obstacle.origin.x,
              z: from.z - obstacle.origin.z,
            },
            b = { x: to.x - obstacle.origin.x, z: to.z - obstacle.origin.z },
            r = WORLD_PLAYER_COLLISION_RADIUS_MM;
          if (
            Math.max(a.x, b.x) + r < obstacle.min.x ||
            Math.min(a.x, b.x) - r > obstacle.max.x ||
            Math.max(a.z, b.z) + r < obstacle.min.z ||
            Math.min(a.z, b.z) - r > obstacle.max.z
          )
            continue;
          if (sweptCircleHitsHull(a, b, obstacle.hull)) return obstacle;
        }
      }
    return undefined;
  }
  resolve(from: GroundPoint, to: GroundPoint): GroundPoint {
    if (from.x === to.x && from.z === to.z) return { ...from };
    if (!this.blockingObstacle(from, to)) return to;
    // Deterministic wall sliding: X first, then Z. No partial/variable timestep.
    for (const slide of [
      { x: to.x, z: from.z },
      { x: from.x, z: to.z },
    ]) {
      if (
        (slide.x !== from.x || slide.z !== from.z) &&
        !this.blockingObstacle(from, slide)
      )
        return slide;
    }
    return { ...from };
  }
}
export const worldNatureCollision = new WorldNatureCollision();
