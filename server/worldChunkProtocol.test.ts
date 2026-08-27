import { describe, expect, it } from "vitest";
import { WORLD_CHUNK_COORDINATE_LIMIT, WORLD_CHUNK_SIZE_MM, createWorldChunkDelta, generateBaseWorldChunk, materializeWorldChunk, toWorldChunkDeltaOverlay } from "./worldChunkProtocol";

const baseInput = { worldId: "echoes-of-aurion-global", worldSeed: "echoes-of-aurion-v1", coordinate: { x: -3, z: 7 } };

function delta(input: Partial<Omit<Parameters<typeof createWorldChunkDelta>[0], "id" | "worldId" | "coordinate" | "baseRevision" | "sequence" | "kind" | "targetId" | "actorUserId" | "idempotencyKey" | "payload">> & { id?: string; sequence?: number; kind?: "resource_depleted" | "structure_placed" | "structure_removed" | "road_built"; targetId?: string; idempotencyKey?: string; payload?: Record<string, string | number | boolean> } = {}) {
  return createWorldChunkDelta({
    id: input.id ?? "delta:1",
    worldId: baseInput.worldId,
    coordinate: baseInput.coordinate,
    baseRevision: 1,
    sequence: input.sequence ?? 1,
    kind: input.kind ?? "structure_placed",
    targetId: input.targetId ?? "structure:1",
    actorUserId: 42,
    idempotencyKey: input.idempotencyKey ?? "player:42:place:1",
    payload: input.payload ?? { assetKey: "observatory-beacon", xMm: 12_000, zMm: 22_000 },
  });
}

describe("worldChunkProtocol", () => {
  it("regenerates an untouched chunk exactly from world seed and integer coordinates", () => {
    const first = generateBaseWorldChunk(baseInput);
    const replay = generateBaseWorldChunk({ ...baseInput, coordinate: { ...baseInput.coordinate } });
    const adjacent = generateBaseWorldChunk({ ...baseInput, coordinate: { x: -2, z: 7 } });
    expect(first).toEqual(replay);
    expect(first.deterministicHash).toBe(replay.deterministicHash);
    expect(adjacent.deterministicHash).not.toBe(first.deterministicHash);
    expect(first.tiles).toHaveLength(256);
    expect(first.tiles.every(tile => Number.isSafeInteger(tile.heightMm))).toBe(true);
    expect(first.resources.every(resource => resource.positionMm.x >= 4_000 && resource.positionMm.x < WORLD_CHUNK_SIZE_MM - 4_000 && resource.positionMm.z >= 4_000 && resource.positionMm.z < WORLD_CHUNK_SIZE_MM - 4_000)).toBe(true);
  });

  it("persists only authoritative deltas while retaining the generated base", () => {
    const base = generateBaseWorldChunk(baseInput);
    const resource = base.resources[0]!;
    const depleted = delta({ id: "delta:resource", kind: "resource_depleted", targetId: resource.id, idempotencyKey: "player:42:gather:1", payload: {} });
    const placed = delta({ id: "delta:structure", sequence: 2, idempotencyKey: "player:42:build:1" });
    const road = delta({ id: "delta:road", sequence: 3, kind: "road_built", targetId: "road:1", idempotencyKey: "player:42:road:1", payload: { fromXmm: 2_000, fromZmm: 5_000, toXmm: 60_000, toZmm: 50_000 } });
    const model = materializeWorldChunk(base, [road, placed, depleted]);
    expect(model.appliedDeltaIds).toEqual(["delta:resource", "delta:road", "delta:structure"]);
    expect(model.visibleResources.some(candidate => candidate.id === resource.id)).toBe(false);
    expect(model.structures).toEqual([{ id: "structure:1", assetKey: "observatory-beacon", positionMm: { x: 12_000, z: 22_000 } }]);
    expect(model.roads).toEqual([{ id: "road:1", fromMm: { x: 2_000, z: 5_000 }, toMm: { x: 60_000, z: 50_000 } }]);
    expect(model.base.deterministicHash).toBe(base.deterministicHash);
  });

  it("projects only public confirmed delta data to the chunk renderer", () => {
    const receipt = delta();
    expect(toWorldChunkDeltaOverlay(receipt)).toEqual({
      id: "delta:1",
      worldId: "echoes-of-aurion-global",
      coordinate: { x: -3, z: 7 },
      baseRevision: 1,
      sequence: 1,
      kind: "structure_placed",
      targetId: "structure:1",
      payload: { assetKey: "observatory-beacon", xMm: 12_000, zMm: 22_000 },
      deterministicHash: receipt.deterministicHash,
    });
    expect(JSON.stringify(toWorldChunkDeltaOverlay(receipt))).not.toContain("actorUserId");
    expect(JSON.stringify(toWorldChunkDeltaOverlay(receipt))).not.toContain("idempotencyKey");
  });

  it("rejects duplicate/replayed delta authority and invalid chunk placement", () => {
    const base = generateBaseWorldChunk(baseInput);
    const first = delta();
    const replay = delta({ id: "delta:replay", idempotencyKey: first.idempotencyKey });
    expect(() => materializeWorldChunk(base, [first, replay])).toThrow(/identity/);
    expect(() => materializeWorldChunk(base, [delta({ payload: { assetKey: "invalid", xMm: WORLD_CHUNK_SIZE_MM, zMm: 0 } })])).toThrow(/outside chunk/);
    expect(() => generateBaseWorldChunk({ ...baseInput, coordinate: { x: 0.5, z: 0 } })).toThrow(/safe integer/);
    expect(generateBaseWorldChunk({ ...baseInput, coordinate: { x: WORLD_CHUNK_COORDINATE_LIMIT, z: -WORLD_CHUNK_COORDINATE_LIMIT } }).coordinate).toEqual({ x: WORLD_CHUNK_COORDINATE_LIMIT, z: -WORLD_CHUNK_COORDINATE_LIMIT });
    expect(() => generateBaseWorldChunk({ ...baseInput, coordinate: { x: WORLD_CHUNK_COORDINATE_LIMIT + 1, z: 0 } })).toThrow(/world boundary/);
  });
});
