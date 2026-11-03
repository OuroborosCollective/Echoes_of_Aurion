import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import wall from "../shared/starterCityWallCollision.json";
import { WorldObjectCollision, makeWorldCollisionSnapshot, requireWorldCollisionSnapshot } from "./worldObjectCollision";

// These are explicit placement fixtures using the actual pinned wall footprint.
// They do not claim that the world design has been published in production.
function snapshot(rotation = 0, origin = { x: 0, z: 0 }) {
  return makeWorldCollisionSnapshot({
    worldDesignRevision: "a".repeat(64), catalogRevision: "b".repeat(64),
    objects: [{ id: "starter-city-wall:perimeter", assetSha256: wall.sourceSha256,
      profileHash: wall.manifestSha256, origin, rotationQuarterTurns: rotation,
      scalePermille: 1000, hulls: wall.hulls as [number, number][][] }],
  });
}

describe("versioned source-bound world-object collision", () => {
  it("preserves the actual courtyard and all four city gates", () => {
    const collision = new WorldObjectCollision(snapshot());
    expect(collision.blockingObject({ x: 0, z: 0 }, { x: 200, z: 0 })).toBeUndefined();
    for (const axis of ["x", "z"] as const) for (const sign of [-1, 1]) {
      for (let distance = 60_000; distance > 0; distance -= 300) {
        const from = { x: 0, z: 0 }, to = { x: 0, z: 0 };
        from[axis] = sign * distance; to[axis] = sign * (distance - 300);
        expect(collision.blockingObject(from, to), `${axis}/${sign}/${distance}`).toBeUndefined();
      }
    }
  });
  it("blocks the source wall at every quarter turn and far signed world coordinates", () => {
    const hull = wall.hulls[0]!;
    const point = { x: Math.round(hull.reduce((n,p) => n + p[0]!,0) / hull.length),
      z: Math.round(hull.reduce((n,p) => n + p[1]!,0) / hull.length) };
    for (let quarter = 0; quarter < 4; quarter++) {
      const rotated = quarter === 0 ? point : quarter === 1 ? { x: point.z, z: -point.x }
        : quarter === 2 ? { x: -point.x, z: -point.z } : { x: -point.z, z: point.x };
      const origin = { x: 6_000_000_000, z: -6_000_000_000 };
      const p = { x: origin.x + rotated.x, z: origin.z + rotated.z };
      expect(new WorldObjectCollision(snapshot(quarter, origin)).blockingObject(p, p)).toBe("starter-city-wall:perimeter");
    }
  });
  it("checks the whole swept disc and composes sliding against every obstacle", () => {
    const make = (id: string, hulls: [number, number][][]) => ({ id, assetSha256: "c".repeat(64),
      profileHash: "d".repeat(64), origin: { x: 0, z: 0 }, rotationQuarterTurns: 0, scalePermille: 1000, hulls });
    const value = makeWorldCollisionSnapshot({ worldDesignRevision: "a".repeat(64), catalogRevision: "b".repeat(64),
      objects: [make("thin-wall", [[[0,-1000],[1,-1000],[1,1000],[0,1000]]])] });
    const collision = new WorldObjectCollision(value);
    expect(collision.resolve({x:-500,z:0},{x:-200,z:300})).toEqual({x:-500,z:300});
    expect(collision.resolve({x:-500,z:0},{x:-200,z:300}, (_a,b) => b.z > 200)).toEqual({x:-500,z:0});
    expect(() => collision.resolve({x:-500,z:0},{x:500,z:0})).toThrow("WORLD_OBJECT_COLLISION_STEP_EXCEEDED");
  });
  it("rejects changed hashes, nonconvex geometry and duplicate identities", () => {
    const value = snapshot();
    const altered = structuredClone(value); altered.objects[0]!.origin.x++;
    expect(() => requireWorldCollisionSnapshot(altered)).toThrow("WORLD_OBJECT_COLLISION_HASH_INVALID");
    const { revision: _revision, ...payload } = value;
    expect(() => makeWorldCollisionSnapshot({ ...payload, objects: [payload.objects[0]!, payload.objects[0]!] })).toThrow();
    const nonconvex = structuredClone(payload); nonconvex.objects[0]!.hulls = [[[0,0],[1000,0],[500,100],[1000,1000],[0,1000]]];
    expect(() => makeWorldCollisionSnapshot(nonconvex)).toThrow("WORLD_OBJECT_COLLISION_CONVEX_REQUIRED");
    const invalid = { ...payload, schemaVersion: "foreign" };
    expect(() => requireWorldCollisionSnapshot({ ...invalid, revision: canonicalSha256(invalid) })).toThrow();
  });
  it("takes immutable copies and retains source identity independently of input order", () => {
    const value = snapshot(); const collision = new WorldObjectCollision(value);
    value.objects[0]!.hulls.length = 0;
    expect(collision.snapshot.objects[0]!.hulls.length).toBe(202);
    expect(requireWorldCollisionSnapshot(collision.snapshot).revision).toBe(collision.snapshot.revision);
  });
});
