import { describe, expect, it } from "vitest";
import { resolveChunkDeltaConflict, chunkDeltaPageInputSchema } from "./worldChunkDeltaPaging";

const delta = (id: string, hash: string, sequence = 4) => ({ id, worldId: "echoes", chunkX: 2, chunkZ: -1, baseRevision: 7, sequence, kind: "road_built" as const, targetId: `road:${id}`, actorUserId: 9, idempotencyKey: `delta-${id}-with-long-key`, payloadJson: JSON.stringify({ fromXmm: 1, fromZmm: 2, toXmm: 3, toZmm: 4 }), deterministicHash: hash });

describe("AIM-234 chunk delta paging and conflict resolution", () => {
  it("accepts bounded stable paging requests", () => {
    expect(chunkDeltaPageInputSchema.parse({ worldId: "echoes", chunkX: 2, chunkZ: -1, expectedBaseRevision: 7, limit: 50 })).toMatchObject({ afterSequence: 0, afterId: null, limit: 50 });
    expect(() => chunkDeltaPageInputSchema.parse({ worldId: "echoes", chunkX: 2, chunkZ: -1, expectedBaseRevision: 6, limit: 101 })).toThrow();
  });

  it("selects the lowest deterministic hash independent of argument order", () => {
    const left = delta("left", "f".repeat(64)); const right = delta("right", "0".repeat(64));
    expect(resolveChunkDeltaConflict(left, right)).toEqual(resolveChunkDeltaConflict(right, left));
    expect(resolveChunkDeltaConflict(left, right).winnerId).toBe("right");
  });

  it("rejects conflicts from different chunk, base, or sequence scopes", () => {
    expect(() => resolveChunkDeltaConflict(delta("a", "a".repeat(64)), delta("b", "b".repeat(64), 5))).toThrow("CHUNK_CONFLICT_SCOPE_MISMATCH");
  });
});
