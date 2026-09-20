import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AURION_WORLD_CHUNK_RULESET } from "../shared/worldChunkProtocol";
import {
  WORLD_CHUNK_PROJECTION_VERSION_V2,
  createWorldChunkProjectionManifestV2, decodeWorldChunkProjectionManifestV2,
  createWorldChunkProjectionWorkerJobV2, createWorldChunkProjectionWorkerResultV2,
  matchesWorldChunkProjectionWorkerResultV2, createWorldChunkConnectionProjectionRootV2,
  hashWorldChunkProjectionPayload, type WorldChunkProjectionIdentityV2,
} from "../shared/worldChunkProjectionProtocol";

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const bytes = new TextEncoder().encode('{"tile":1}');
async function identity(overrides: Partial<WorldChunkProjectionIdentityV2> = {}): Promise<WorldChunkProjectionIdentityV2> {
  return {
    version: WORLD_CHUNK_PROJECTION_VERSION_V2, worldId: "fixture-world",
    worldSeedDigest: "fnv1a-12345678", worldRuleSetVersion: AURION_WORLD_CHUNK_RULESET,
    generatorVersion: "fixture-generator", contentVersion: "fixture-content",
    coordinate: { x: 0, z: 0 }, layer: "base-terrain", baseRevision: 1,
    sourceHash: "fnv1a-87654321", authorityReceiptHash: hash("a"), authorityStateHash: hash("b"),
    worldCausalRoot: hash("c"), projectionSchemaVersion: "aurion.chunk-payload.v2",
    projectionPolicy: "fixture-policy", payloadHash: await hashWorldChunkProjectionPayload(bytes),
    byteLength: bytes.length, ...overrides,
  };
}
const manifest = async (overrides: Partial<WorldChunkProjectionIdentityV2> = {}) => createWorldChunkProjectionManifestV2(await identity(overrides));

describe("Step 28 V2 projection commitments (synthetic, not production authority)", () => {
  it("uses SHA-256 of actual payload bytes and separate projection/manifest domains", async () => {
    const input = await identity();
    expect(input.payloadHash).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    const first = await manifest();
    expect(first).toEqual(await manifest());
    expect(first.projectionHash).not.toBe(first.authorityStateHash);
    expect(first.manifestHash).not.toBe(first.projectionHash);
    expect(await decodeWorldChunkProjectionManifestV2(first)).toEqual(first);
    expect(first).not.toHaveProperty("status");
    expect(first).not.toHaveProperty("worldSeed");
  });

  it.each(["authorityReceiptHash", "authorityStateHash", "worldCausalRoot", "payloadHash"] as const)("commits %s and detects tampering", async field => {
    const first = await manifest();
    await expect(decodeWorldChunkProjectionManifestV2({ ...first, [field]: hash("d") })).rejects.toThrow("PROJECTION_HASH_MISMATCH");
    expect((await manifest({ [field]: hash("d") })).projectionHash).not.toBe(first.projectionHash);
  });

  it("rejects missing evidence, unknown fields, V1, invalid coordinates and malformed hashes", async () => {
    const first = await manifest();
    for (const altered of [
      { ...first, authorityReceiptHash: undefined }, { ...first, worldCausalRoot: "UNPROVABLE" },
      { ...first, version: "aurion-ax1-chunk-projection.v1" }, { ...first, coordinate: { x: NaN, z: 0 } },
      { ...first, authorityStateHash: "fnv1a-12345678" }, { ...first, rawSessionSecret: "forbidden" },
      null, [],
    ]) await expect(decodeWorldChunkProjectionManifestV2(altered)).rejects.toThrow();
    await expect(decodeWorldChunkProjectionManifestV2({ ...first, manifestHash: hash("d") })).rejects.toThrow("PROJECTION_MANIFEST_HASH_MISMATCH");
  });

  it("snapshots before async hashing and freezes nested output", async () => {
    const input = await identity();
    const pending = createWorldChunkProjectionManifestV2(input);
    input.coordinate.x = 80;
    input.authorityReceiptHash = hash("f");
    const output = await pending;
    expect(output.coordinate.x).toBe(0);
    expect(output.authorityReceiptHash).toBe(hash("a"));
    expect(Object.isFrozen(output.coordinate)).toBe(true);
  });

  it("rejects stale worker generations, tampered metadata, and substituted actual bytes", async () => {
    const m = await manifest();
    const oldJob = await createWorldChunkProjectionWorkerJobV2({ manifest: m, generation: 1 });
    const job = await createWorldChunkProjectionWorkerJobV2({ manifest: m, generation: 2 });
    const result = await createWorldChunkProjectionWorkerResultV2({ job, payload: bytes });
    expect(await matchesWorldChunkProjectionWorkerResultV2(job, result, bytes)).toBe(true);
    expect(await matchesWorldChunkProjectionWorkerResultV2(oldJob, result, bytes)).toBe(false);
    expect(await matchesWorldChunkProjectionWorkerResultV2(job, { ...result, projectionHash: hash("d") }, bytes)).toBe(false);
    expect(await matchesWorldChunkProjectionWorkerResultV2(job, result, new Uint8Array(bytes.length))).toBe(false);
    expect(await matchesWorldChunkProjectionWorkerResultV2({ ...job, jobId: hash("d") }, result, bytes)).toBe(false);
    expect(await matchesWorldChunkProjectionWorkerResultV2(job, null, bytes)).toBe(false);
  });

  it("snapshots worker bytes before awaiting manifest validation", async () => {
    const job = await createWorldChunkProjectionWorkerJobV2({ manifest: await manifest(), generation: 1 });
    const mutable = new Uint8Array(bytes);
    const pending = createWorldChunkProjectionWorkerResultV2({ job, payload: mutable });
    mutable.fill(0);
    expect((await pending).payloadHash).toBe(job.manifest.payloadHash);
  });

  it("canonicalizes interest order and commits changed sets and connection identities", async () => {
    const a = await manifest(), b = await manifest({ coordinate: { x: 1, z: 0 } });
    const root = (manifests: typeof a[], connectionId = "fixture-connection") => createWorldChunkConnectionProjectionRootV2({ connectionId, manifests });
    expect(await root([a, b])).toEqual(await root([b, a]));
    expect((await root([a])).projectionRoot).not.toBe((await root([a, b])).projectionRoot);
    expect((await root([a], "another-connection")).projectionRoot).not.toBe((await root([a])).projectionRoot);
    await expect(root([a, a])).rejects.toThrow("PROJECTION_INTEREST_DUPLICATE");
    await expect(root([a, await manifest({ coordinate: { x: 1, z: 0 }, authorityReceiptHash: hash("d") })])).rejects.toThrow("PROJECTION_INTEREST_AUTHORITY_MISMATCH");
    await expect(root([])).rejects.toThrow();
  });

  it("never receives authority objects or renderer callbacks; local failure leaves references unchanged", async () => {
    // Boundary test only, not a claim of real WebGL2/WebGPU runtime coverage.
    const input = await identity();
    const before = structuredClone(input);
    const m = await createWorldChunkProjectionManifestV2(input);
    const job = await createWorldChunkProjectionWorkerJobV2({ manifest: m, generation: 0 });
    await expect(createWorldChunkProjectionWorkerResultV2({ job, payload: new Uint8Array() })).rejects.toThrow("PROJECTION_WORKER_PAYLOAD_MISMATCH");
    expect(input).toEqual(before);
    await expect(createWorldChunkProjectionManifestV2({ ...input, renderer: "webgpu" } as typeof input)).rejects.toThrow();
  });
});
