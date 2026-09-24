import { describe, expect, it } from "vitest";
import {
  AURION_STRUCTURE_GRAMMAR_PROTOCOL,
  type StructureObservationRequest,
} from "@shared/structureObservationProtocol";
import {
  createCanonicalChunkReceipt,
  type CanonicalChunkReceipt,
} from "@shared/aurionChunkStateContract";
import { generateBaseWorldChunk, createWorldChunkDelta, type WorldChunkDelta } from "@shared/worldChunkProtocol";
import { canonicalSha256 } from "@shared/aurionCanonicalHash";
import { StructureObservationRuntime, materializeConfirmedStructure } from "./structureObservationRuntime";

const WORLD_ID = "echoes-of-aurion-global";
const WORLD_SEED = "issue-514-unit-seed";
const CHUNK = { x: -17, z: 23 };

function grammar(version = "1.0.0") {
  return {
    grammarId: "unit-house",
    grammarVersion: version,
    rootRuleId: "root",
    rules: [{
      id: "root",
      body: {
        kind: "primitive" as const,
        primitive: {
          kind: "box" as const,
          assetKey: "aurion_unit_stone",
          materialKey: "stone",
          sizeMm: { x: 2_000, y: 2_500, z: 3_000 },
        },
      },
    }],
  };
}

function confirmedChunk(overrides: Partial<CanonicalChunkReceipt> = {}, worldRootHash = canonicalSha256({ domain: "unit-world-root", value: 1 })) {
  const receiptPair = createCanonicalChunkReceipt({
    worldId: WORLD_ID,
    worldSeed: WORLD_SEED,
    coordinate: CHUNK,
    deltas: [],
    epoch: 1,
    sourceRevision: "a".repeat(40),
    previousChunkReceiptHash: null,
  });
  return {
    status: "VERIFIED" as const,
    membership: "GENERATOR_AND_EMPTY_STREAM" as const,
    worldRootHash,
    receipt: Object.freeze({ ...receiptPair.receipt, ...overrides }),
    state: receiptPair.state,
  };
}

function request(override: Partial<StructureObservationRequest> = {}): StructureObservationRequest {
  return {
    worldId: WORLD_ID,
    epoch: 1,
    chunkCoordinate: CHUNK,
    structureId: "unit-house",
    anchorId: "anchor:unit-house",
    grammar: grammar(),
    ...override,
  };
}

describe("StructureObservationRuntime", () => {
  it("materializes only from confirmed evidence and reconstructs byte-identically after cache eviction", async () => {
    const firstConfirmed = confirmedChunk();
    let deltaReads = 0;
    const runtime = new StructureObservationRuntime({
      causalRootService: {
        readChunk: async () => firstConfirmed,
      } as any,
      deltaPageReader: async () => {
        deltaReads += 1;
        return {
          worldId: WORLD_ID,
          chunkX: CHUNK.x,
          chunkZ: CHUNK.z,
          baseRevision: 1,
          deltas: [],
          nextCursor: null,
          pageHash: canonicalSha256({ domain: "unit-page", value: 0 }),
        };
      },
    });

    const first = await runtime.observe(request());
    expect(first.status).toBe("VERIFIED");
    if (first.status !== "VERIFIED") throw new Error(first.reason);
    expect(first.identity.protocol).toBe(AURION_STRUCTURE_OBSERVATION_PROTOCOL);
    expect(first.materialization.state).toBe("BASE_GRAMMAR");
    expect(first.materialization.primitives).toHaveLength(1);
    expect(first.cacheHit).toBe(false);

    const second = await runtime.observe(request());
    expect(second.status).toBe("VERIFIED");
    if (second.status !== "VERIFIED") throw new Error(second.reason);
    expect(second.cacheHit).toBe(true);
    expect(second.observationKey).toBe(first.observationKey);
    expect(second.recipeHash).toBe(first.recipeHash);
    expect(second.materialization.materializationHash).toBe(first.materialization.materializationHash);
    expect(deltaReads).toBe(1);

    runtime.clearCache();
    const rebuilt = await runtime.observe(request());
    expect(rebuilt.status).toBe("VERIFIED");
    if (rebuilt.status !== "VERIFIED") throw new Error(rebuilt.reason);
    expect(rebuilt.cacheHit).toBe(false);
    expect(rebuilt.observationKey).toBe(first.observationKey);
    expect(rebuilt.recipeHash).toBe(first.recipeHash);
    expect(rebuilt.materialization.materializationHash).toBe(first.materialization.materializationHash);
  });

  it("changes observation identity when the causal root or grammar version changes", async () => {
    const rootA = canonicalSha256({ domain: "root", value: "a" });
    const rootB = canonicalSha256({ domain: "root", value: "b" });
    const aConfirmed = confirmedChunk({}, rootA);
    const bConfirmed = confirmedChunk({}, rootB);

    const runtimeA = new StructureObservationRuntime({
      causalRootService: { readChunk: async () => aConfirmed } as any,
      deltaPageReader: async () => ({ worldId: WORLD_ID, chunkX: CHUNK.x, chunkZ: CHUNK.z, baseRevision: 1, deltas: [], nextCursor: null, pageHash: canonicalSha256({ domain: "unit-page", value: 0 }) }),
    });
    const runtimeB = new StructureObservationRuntime({
      causalRootService: { readChunk: async () => bConfirmed } as any,
      deltaPageReader: async () => ({ worldId: WORLD_ID, chunkX: CHUNK.x, chunkZ: CHUNK.z, baseRevision: 1, deltas: [], nextCursor: null, pageHash: canonicalSha256({ domain: "unit-page", value: 0 }) }),
    });

    const observationA = await runtimeA.observe(request());
    const observationB = await runtimeB.observe(request({ grammar: grammar("2.0.0") }));
    expect(observationA.status).toBe("VERIFIED");
    expect(observationB.status).toBe("VERIFIED");
    if (observationA.status !== "VERIFIED" || observationB.status !== "VERIFIED") throw new Error("OBSERVATION_EXPECTED");
    expect(observationA.observationKey).not.toBe(observationB.observationKey);
    expect(observationA.recipeHash).not.toBe(observationB.recipeHash);

    const rootChanged = await runtimeB.observe(request());
    expect(rootChanged.status).toBe("VERIFIED");
    if (rootChanged.status !== "VERIFIED") throw new Error(rootChanged.reason);
    expect(rootChanged.observationKey).not.toBe(observationA.observationKey);
  });

  it("honours confirmed structure_placed and structure_removed precedence", () => {
    const placed = createWorldChunkDelta({
      id: "unit-place-0001",
      worldId: WORLD_ID,
      coordinate: CHUNK,
      baseRevision: 1,
      sequence: 1,
      kind: "structure_placed",
      targetId: "unit-house",
      actorUserId: 1,
      idempotencyKey: "unit-place-0001",
      payload: { xMm: 1_200, zMm: 2_300, assetKey: "aurion_confirmed_house" },
    });
    const base = confirmedChunk();
    const materialized = materializeConfirmedStructure({
      request: request(),
      confirmedChunk: base,
      confirmedDeltas: [placed],
    });
    expect(materialized.status).toBe("VERIFIED");
    if (materialized.status !== "VERIFIED") throw new Error(materialized.reason);
    expect(materialized.materialization.state).toBe("DELTA_OVERRIDE");
    expect(materialized.materialization.primitives).toHaveLength(0);
    expect(materialized.materialization.deltaOverride).toMatchObject({
      source: "structure_placed_delta",
      targetId: "unit-house",
      assetKey: "aurion_confirmed_house",
      positionMm: { x: 1_200, z: 2_300 },
    });

    const removed = createWorldChunkDelta({
      id: "unit-remove-0002",
      worldId: WORLD_ID,
      coordinate: CHUNK,
      baseRevision: 1,
      sequence: 2,
      kind: "structure_removed",
      targetId: "unit-house",
      actorUserId: 1,
      idempotencyKey: "unit-remove-0002",
      payload: {},
    });
    const afterRemove = materializeConfirmedStructure({
      request: request(),
      confirmedChunk: base,
      confirmedDeltas: [placed, removed],
    });
    expect(afterRemove.status).toBe("REMOVED");
    if (afterRemove.status !== "REMOVED") throw new Error("REMOVE_EXPECTED");
    expect(afterRemove.sourceDeltaId).toBe("unit-remove-0002");
  });

  it("never invokes grammar or delta projection when confirmed world evidence is unavailable", async () => {
    let deltaReads = 0;
    const runtime = new StructureObservationRuntime({
      causalRootService: {
        readChunk: async () => ({ status: "UNPROVABLE" as const, reason: "WORLD_ROOT_EVIDENCE_MISSING" }),
      } as any,
      deltaPageReader: async () => {
        deltaReads += 1;
        throw new Error("MUST_NOT_BE_CALLED");
      },
    });
    const result = await runtime.observe(request());
    expect(result).toEqual({ status: "UNPROVABLE", reason: "WORLD_ROOT_EVIDENCE_MISSING" });
    expect(deltaReads).toBe(0);
  });

  it("keeps the materializer deterministic when the same confirmed inputs are supplied in a different array order", () => {
    const base = confirmedChunk();
    const delta = createWorldChunkDelta({
      id: "unit-place-0001",
      worldId: WORLD_ID,
      coordinate: CHUNK,
      baseRevision: 1,
      sequence: 1,
      kind: "structure_placed",
      targetId: "other-house",
      actorUserId: 1,
      idempotencyKey: "unit-place-0001",
      payload: { xMm: 1_200, zMm: 2_300, assetKey: "aurion_confirmed_house" },
    });
    const one = materializeConfirmedStructure({
      request: request({ structureId: "other-house" }),
      confirmedChunk: base,
      confirmedDeltas: [delta],
    });
    const two = materializeConfirmedStructure({
      request: request({ structureId: "other-house" }),
      confirmedChunk: base,
      confirmedDeltas: [delta],
    });
    expect(one).toEqual(two);
  });
});
