import { describe, expect, it } from "vitest";
import { generateBaseWorldChunk } from "./worldChunkProtocol";
import { resolveWorldChunkAction } from "./worldChunkActionProtocol";

const worldId = "echoes-of-aurion-global";
const worldSeed = "world-action-test-seed";
const coordinate = { x: 0, z: 0 };
const base = generateBaseWorldChunk({ worldId, worldSeed, coordinate });
const resource = base.resources[0];
if (!resource) throw new Error("The deterministic action test seed must yield a resource");
const actorPosition = { x: resource.positionMm.x - 32_000, z: resource.positionMm.z - 32_000 };

function common() {
  return { actorUserId: 11, actorPosition, worldId, worldSeed };
}

describe("worldChunkActionProtocol", () => {
  it("turns a reachable generated resource into a bounded depletion receipt shape", () => {
    expect(resolveWorldChunkAction({ ...common(), intent: {
      kind: "harvest_resource", coordinate, expectedBaseRevision: 1, expectedBaseHash: base.deterministicHash, resourceId: resource.id, idempotencyKey: "harvest:receipt:0001",
    } })).toEqual({ kind: "resource_depleted", targetId: resource.id, payload: { yieldKey: resource.yieldKey, resourceKind: resource.kind } });
  });

  it("accepts only approved structures and derives stable target identities", () => {
    const result = resolveWorldChunkAction({ ...common(), actorPosition: { x: 0, z: 0 }, intent: {
      kind: "place_structure", coordinate, expectedBaseRevision: 1, expectedBaseHash: base.deterministicHash, assetKey: "aurion_tripo_starpath_marker", xMm: 32_000, zMm: 32_000, idempotencyKey: "structure:receipt:0001",
    } });
    expect(result).toEqual({ kind: "structure_placed", targetId: "structure:11:5a075821ac97bcd9", payload: { assetKey: "aurion_tripo_starpath_marker", xMm: 32_000, zMm: 32_000 } });
  });

  it("keeps the deterministic structure target below the persistence limit for a maximal key", () => {
    const result = resolveWorldChunkAction({ ...common(), actorPosition: { x: 0, z: 0 }, intent: {
      kind: "place_structure", coordinate, expectedBaseRevision: 1, expectedBaseHash: base.deterministicHash, assetKey: "aurion_tripo_garden_border", xMm: 32_000, zMm: 32_000, idempotencyKey: `a${"x".repeat(127)}`,
    } });
    expect(result.targetId).toMatch(/^structure:11:[0-9a-f]{16}$/);
    expect(result.targetId.length).toBeLessThanOrEqual(128);
  });

  it("derives a bounded structure removal for a reachable prior structure identity", () => {
    expect(resolveWorldChunkAction({ ...common(), actorPosition: { x: 0, z: 0 }, intent: {
      kind: "remove_structure", coordinate, expectedBaseRevision: 1, expectedBaseHash: base.deterministicHash, structureId: "structure:11:5a075821ac97bcd9", xMm: 32_000, zMm: 32_000, idempotencyKey: "structure:remove:0001",
    } })).toEqual({ kind: "structure_removed", targetId: "structure:11:5a075821ac97bcd9", payload: { xMm: 32_000, zMm: 32_000 } });
  });

  it("rejects stale bases, distant placement and oversize roads", () => {
    expect(() => resolveWorldChunkAction({ ...common(), intent: {
      kind: "harvest_resource", coordinate, expectedBaseRevision: 1, expectedBaseHash: "fnv1a-wrong", resourceId: resource.id, idempotencyKey: "harvest:receipt:0002",
    } })).toThrow("base hash");
    expect(() => resolveWorldChunkAction({ ...common(), actorPosition: { x: -14_500, z: -14_500 }, intent: {
      kind: "place_structure", coordinate, expectedBaseRevision: 1, expectedBaseHash: base.deterministicHash, assetKey: "aurion_tripo_garden_border", xMm: 32_000, zMm: 32_000, idempotencyKey: "structure:receipt:0002",
    } })).toThrow("reach");
    expect(() => resolveWorldChunkAction({ ...common(), actorPosition: { x: 0, z: 0 }, intent: {
      kind: "build_road", coordinate, expectedBaseRevision: 1, expectedBaseHash: base.deterministicHash, fromXmm: 32_000, fromZmm: 32_000, toXmm: 40_000, toZmm: 32_000, idempotencyKey: "road:receipt:0001",
    } })).toThrow("road length");
  });
});
