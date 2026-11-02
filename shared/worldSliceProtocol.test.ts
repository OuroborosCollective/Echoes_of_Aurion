import { describe, expect, it } from "vitest";
import { parseWorldSliceHttpQuery, worldSliceReadbackSchema } from "./worldSliceProtocol";
import { canonicalSha256 } from "./aurionCanonicalHash";

export function worldSliceFixture() {
  const slice = {
    schema: "aurion.world-slice.v1", policy: "actor-observed-current-epoch.v1",
    worldId: "echoes-of-aurion-global", zoneId: "observatory_threshold",
    actorId: "player:1", epoch: 1, observedAtTick: 12,
    worldRoot: "sha256:" + "a".repeat(64), sourceRevision: "b".repeat(40),
    coordinate: { x: 0, z: 0 }, radius: 0, lod: "full",
    knowledgeHash: "sha256:" + "c".repeat(64),
    chunks: [{ coordinate: { x: 0, z: 0 }, authorityReceiptHash: "sha256:" + "d".repeat(64),
      tiles: Array.from({ length: 256 }, (_, i) => ({ x: i % 16, z: Math.floor(i / 16), heightMm: 0, surface: "grass" })),
      structures: [], roads: [],
    }], entities: [{ entityId: "player:1", position: { x: 0, z: 0 } }],
  };
  return { status: "VERIFIED", connectionId: "zone_peer_worldtable_fixture", slice,
    fingerprint: canonicalSha256({ domain: slice.schema, slice }), mutationAuthority: "none" };
}

describe("WorldSlice public consumer boundary", () => {
  it("accepts the existing wire without changing its fingerprint inputs", () => {
    const reply = worldSliceFixture();
    expect(worldSliceReadbackSchema.parse(reply)).toEqual(reply);
  });
  it("rejects cross-actor, off-window and malformed geometry before presentation", () => {
    for (const alter of [
      (r: any) => { r.slice.entities[0].entityId = "player:2"; },
      (r: any) => { r.slice.chunks[0].coordinate.x = 1; },
      (r: any) => { r.slice.chunks[0].tiles[1] = r.slice.chunks[0].tiles[0]; },
      (r: any) => { r.slice.entities[0].position.x = 64000; },
      (r: any) => { r.slice.chunks[0].tiles[0].collision = "private"; },
      (r: any) => { r.slice.seed = "private"; },
    ]) {
      const reply = worldSliceFixture(); alter(reply);
      expect(worldSliceReadbackSchema.safeParse(reply).success).toBe(false);
    }
  });
  it("does not accept fogged geometry or unproven knowledge", () => {
    const reply = worldSliceFixture(); reply.status = "FOGGED";
    expect(worldSliceReadbackSchema.safeParse(reply).success).toBe(false);
    reply.slice.chunks = []; reply.slice.knowledgeHash = null as any;
    expect(worldSliceReadbackSchema.safeParse(reply).success).toBe(true);
    reply.status = "VERIFIED";
    expect(worldSliceReadbackSchema.safeParse(reply).success).toBe(false);
  });
  it("keeps camera queries bounded and actor-free", () => {
    expect(parseWorldSliceHttpQuery({ x: "0", z: "-1", radius: "0", lod: "map" }).coordinate).toEqual({ x: 0, z: -1 });
    for (const extra of [{ actorId: "player:2" }, { radius: "2" }, { x: "0.5" }, { worldId: "private" }]) {
      expect(() => parseWorldSliceHttpQuery({ x: "0", z: "0", radius: "0", lod: "full", ...extra })).toThrow();
    }
  });
});
