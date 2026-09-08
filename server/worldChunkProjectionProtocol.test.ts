import { describe, expect, it } from "vitest";
import { generateBaseWorldChunk } from "../shared/worldChunkProtocol";
import {
  WORLD_CHUNK_PROJECTION_MAX_QUEUE,
  WORLD_CHUNK_PROJECTION_VERSION,
  assertWorldChunkProjectionManifest,
  canTransitionWorldChunkProjectionState,
  createWorldChunkProjectionManifest,
  createWorldChunkProjectionWorkerJob,
  createWorldChunkProjectionWorkerResult,
  matchesWorldChunkProjectionWorkerResult,
  orderWorldChunkProjectionWorkerQueue,
  transitionWorldChunkProjectionState,
} from "../shared/worldChunkProjectionProtocol";

function baseAt(x = 4, z = -3) {
  return generateBaseWorldChunk({ worldId: "aurion-global", worldSeed: "confirmed-seed-v1", coordinate: { x, z } });
}

function manifestAt(x = 4, z = -3, contentVersion = "catalog-v7") {
  return createWorldChunkProjectionManifest({
    base: baseAt(x, z),
    generatorVersion: "ax1-world-projection-v1",
    contentVersion,
    layer: "world-assets",
  });
}

describe("AIM-288 world chunk projection protocol", () => {
  it("binds confirmed world identity and presentation versions into a deterministic manifest without carrying the raw seed", () => {
    const first = manifestAt();
    const second = manifestAt();
    expect(first).toEqual(second);
    expect(first.version).toBe(WORLD_CHUNK_PROJECTION_VERSION);
    expect(first.coordinate).toEqual({ x: 4, z: -3 });
    expect(first.sourceHash).toBe(baseAt().deterministicHash);
    expect(first).not.toHaveProperty("worldSeed");
    expect(() => assertWorldChunkProjectionManifest(first)).not.toThrow();
  });

  it("changes projection identity only when a bound source or presentation version changes", () => {
    expect(manifestAt(4, -3).manifestHash).not.toBe(manifestAt(5, -3).manifestHash);
    expect(manifestAt(4, -3, "catalog-v7").manifestHash).not.toBe(manifestAt(4, -3, "catalog-v8").manifestHash);
    expect(manifestAt(4, -3, "catalog-v7").sourceHash).toBe(manifestAt(4, -3, "catalog-v8").sourceHash);
  });

  it("fails closed when manifest identity is tampered after construction", () => {
    const manifest = manifestAt();
    expect(() => assertWorldChunkProjectionManifest({ ...manifest, contentVersion: "catalog-v8" })).toThrow("manifest hash mismatch");
    expect(() => assertWorldChunkProjectionManifest({ ...manifest, coordinate: { x: 1_000_001, z: 0 } })).toThrow("world boundary");
  });

  it("uses generation-bound worker identities so superseded jobs reject stale results", () => {
    const manifest = manifestAt();
    const oldJob = createWorldChunkProjectionWorkerJob({ manifest, generation: 7, priority: 20, enqueueSequence: 1 });
    const currentJob = createWorldChunkProjectionWorkerJob({ manifest, generation: 8, priority: 20, enqueueSequence: 2 });
    const oldResult = createWorldChunkProjectionWorkerResult({ job: oldJob, payloadHash: "fnv1a-00112233", byteLength: 512 });
    const currentResult = createWorldChunkProjectionWorkerResult({ job: currentJob, payloadHash: "fnv1a-aabbccdd", byteLength: 512 });
    expect(matchesWorldChunkProjectionWorkerResult(oldJob, oldResult)).toBe(true);
    expect(matchesWorldChunkProjectionWorkerResult(currentJob, oldResult)).toBe(false);
    expect(matchesWorldChunkProjectionWorkerResult(currentJob, currentResult)).toBe(true);
    expect(matchesWorldChunkProjectionWorkerResult(currentJob, { ...currentResult, manifestHash: "fnv1a-deadbeef" })).toBe(false);
  });

  it("orders and bounds worker jobs deterministically independent of arrival order", () => {
    const first = createWorldChunkProjectionWorkerJob({ manifest: manifestAt(0, 0), generation: 1, priority: 50, enqueueSequence: 4 });
    const second = createWorldChunkProjectionWorkerJob({ manifest: manifestAt(1, 0), generation: 1, priority: 80, enqueueSequence: 5 });
    const third = createWorldChunkProjectionWorkerJob({ manifest: manifestAt(2, 0), generation: 1, priority: 50, enqueueSequence: 2 });
    const expected = [second.jobId, third.jobId];
    expect(orderWorldChunkProjectionWorkerQueue([first, second, third], 2).map(job => job.jobId)).toEqual(expected);
    expect(orderWorldChunkProjectionWorkerQueue([third, first, second], 2).map(job => job.jobId)).toEqual(expected);
    expect(() => orderWorldChunkProjectionWorkerQueue([first], WORLD_CHUNK_PROJECTION_MAX_QUEUE + 1)).toThrow("maxJobs");
  });

  it("deduplicates the same worker identity while preserving the strongest deterministic scheduling metadata", () => {
    const manifest = manifestAt();
    const low = createWorldChunkProjectionWorkerJob({ manifest, generation: 4, priority: 10, enqueueSequence: 8 });
    const high = { ...low, priority: 90, enqueueSequence: 9 };
    const earlierHigh = { ...low, priority: 90, enqueueSequence: 3 };
    const queue = orderWorldChunkProjectionWorkerQueue([low, high, earlierHigh]);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ jobId: low.jobId, priority: 90, enqueueSequence: 3 });
  });

  it("keeps renderability and simulation readiness as explicit separate states", () => {
    expect(canTransitionWorldChunkProjectionState("decoded", "renderable")).toBe(true);
    expect(canTransitionWorldChunkProjectionState("decoded", "simulatable")).toBe(false);
    expect(canTransitionWorldChunkProjectionState("renderable", "simulatable")).toBe(true);
    expect(transitionWorldChunkProjectionState("renderable", "simulatable")).toBe("simulatable");
    expect(() => transitionWorldChunkProjectionState("requested", "renderable")).toThrow("invalid projection state transition");
  });

  it("allows cancellation back to absent before renderability and requires eviction after renderability", () => {
    for (const state of ["requested", "received", "validated", "decoded"] as const) {
      expect(canTransitionWorldChunkProjectionState(state, "absent")).toBe(true);
    }
    expect(canTransitionWorldChunkProjectionState("renderable", "absent")).toBe(false);
    expect(canTransitionWorldChunkProjectionState("renderable", "evictable")).toBe(true);
    expect(canTransitionWorldChunkProjectionState("simulatable", "evictable")).toBe(true);
    expect(canTransitionWorldChunkProjectionState("evictable", "absent")).toBe(true);
  });
});
