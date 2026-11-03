import { z } from "zod";
import { canonicalJson, canonicalSha256 } from "./aurionCanonicalHash";

export const WORLD_OBJECT_COLLISION_VERSION = "aurion.world-object-collision.v1" as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const canonicalDigest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const coordinate = z.number().int().safe().min(-64_000_000_000).max(64_000_000_000);
const local = z.number().int().safe().min(-1_000_000).max(1_000_000);
const objectSchema = z.object({
  id: z.string().min(1).max(200), assetSha256: digest, profileHash: digest,
  origin: z.object({ x: coordinate, z: coordinate }).strict(),
  rotationQuarterTurns: z.number().int().min(0).max(3),
  scalePermille: z.number().int().min(250).max(4000),
  hulls: z.array(z.array(z.tuple([local, local])).min(3).max(64)).min(1).max(256),
}).strict();
const snapshotSchema = z.object({
  schemaVersion: z.literal(WORLD_OBJECT_COLLISION_VERSION),
  worldDesignRevision: digest, catalogRevision: digest,
  objects: z.array(objectSchema).max(256), revision: canonicalDigest,
}).strict();
export type WorldCollisionObject = z.infer<typeof objectSchema>;
export type WorldCollisionSnapshot = z.infer<typeof snapshotSchema>;
type SnapshotInput = Omit<WorldCollisionSnapshot, "schemaVersion" | "revision">;

const cross = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
  BigInt(b[0]! - a[0]!) * BigInt(c[1]! - a[1]!) - BigInt(b[1]! - a[1]!) * BigInt(c[0]! - a[0]!);

/** This validates a recorded Aurion geometry input; it grants no publication
 * permission and performs no database or runtime activation. */
export function requireWorldCollisionSnapshot(raw: unknown): WorldCollisionSnapshot {
  const snapshot = snapshotSchema.parse(raw);
  const { revision, ...payload } = snapshot;
  if (canonicalSha256(payload) !== revision) throw Error("WORLD_OBJECT_COLLISION_HASH_INVALID");
  if (canonicalJson(payload).length > 512 * 1024) throw Error("WORLD_OBJECT_COLLISION_BYTE_BUDGET");
  let previous = "", hullCount = 0;
  for (const object of snapshot.objects) {
    if (object.id <= previous) throw Error("WORLD_OBJECT_COLLISION_ID_ORDER_INVALID");
    previous = object.id;
    for (const hull of object.hulls) {
      if (++hullCount > 4096) throw Error("WORLD_OBJECT_COLLISION_HULL_BUDGET");
      if (new Set(hull.map(p => p.join(":"))).size !== hull.length) throw Error("WORLD_OBJECT_COLLISION_CONVEX_REQUIRED");
      let positive = false;
      // Every vertex must be on the inside of every edge. Checking adjacent
      // turns alone would admit some self-intersecting star polygons.
      for (let i = 0; i < hull.length; i++) for (const point of hull) {
        const area = cross(hull[i]!, hull[(i + 1) % hull.length]!, point);
        if (area < 0n) throw Error("WORLD_OBJECT_COLLISION_CONVEX_REQUIRED");
        positive ||= area > 0n;
      }
      if (!positive) throw Error("WORLD_OBJECT_COLLISION_CONVEX_REQUIRED");
    }
  }
  return snapshot;
}

export function makeWorldCollisionSnapshot(input: SnapshotInput): WorldCollisionSnapshot {
  const payload = { schemaVersion: WORLD_OBJECT_COLLISION_VERSION,
    worldDesignRevision: input.worldDesignRevision, catalogRevision: input.catalogRevision,
    objects: structuredClone(input.objects).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  return requireWorldCollisionSnapshot({ ...payload, revision: canonicalSha256(payload) });
}

