import { z } from "zod";
import { AURION_WORLD_CHUNK_RULESET, WORLD_CHUNK_COORDINATE_LIMIT } from "./worldChunkProtocol";

export const WORLD_CHUNK_PROJECTION_VERSION_V2 = "aurion-ax1-chunk-projection.v2" as const;
export const WORLD_CHUNK_PROJECTION_PAYLOAD_LIMIT = 16 * 1024 * 1024;
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const legacyHash = z.string().regex(/^(?:fnv1a-[a-f0-9]{8}|sha256:[a-f0-9]{64})$/);
const unsigned = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const coordinate = z.strictObject({
  x: z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT),
  z: z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT),
});

const identitySchema = z.strictObject({
  version: z.literal(WORLD_CHUNK_PROJECTION_VERSION_V2),
  worldId: identifier,
  worldSeedDigest: legacyHash,
  worldRuleSetVersion: z.literal(AURION_WORLD_CHUNK_RULESET),
  generatorVersion: identifier,
  contentVersion: identifier,
  coordinate,
  layer: z.enum(["base-terrain", "world-assets", "actor-visuals", "ambient-effects"]),
  baseRevision: unsigned,
  sourceHash: legacyHash,
  authorityReceiptHash: hash,
  authorityStateHash: hash,
  worldCausalRoot: hash,
  projectionSchemaVersion: z.literal("aurion.chunk-payload.v2"),
  projectionPolicy: identifier,
  payloadHash: hash,
  byteLength: unsigned.max(WORLD_CHUNK_PROJECTION_PAYLOAD_LIMIT),
});
const manifestSchema = identitySchema.extend({ projectionHash: hash, manifestHash: hash });
export type WorldChunkProjectionIdentityV2 = z.infer<typeof identitySchema>;
export type WorldChunkProjectionManifestV2 = Readonly<z.infer<typeof manifestSchema>>;

/** Fixed-schema JSON: recursively sort object keys; arrays retain semantic order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

async function digest(bytes: Uint8Array): Promise<string> {
  // Snapshot before yielding: caller mutation cannot change the committed bytes.
  const result = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return `sha256:${Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function commitment(domain: string, value: unknown): Promise<string> {
  return digest(new TextEncoder().encode(canonical({ domain, value })));
}

export async function hashWorldChunkProjectionPayload(bytes: Uint8Array): Promise<string> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > WORLD_CHUNK_PROJECTION_PAYLOAD_LIMIT) {
    throw new Error("PROJECTION_PAYLOAD_INVALID");
  }
  return digest(bytes);
}

/**
 * Commits supplied references, not their truth. The server must establish the
 * receipt -> canonical state -> chunk relation and world-root membership first.
 * No signature, VERIFIED verdict, gameplay write, or renderer input lives here.
 */
export async function createWorldChunkProjectionManifestV2(input: WorldChunkProjectionIdentityV2): Promise<WorldChunkProjectionManifestV2> {
  const identity = identitySchema.parse(input); // validated, detached snapshot
  const projectionHash = await commitment("aurion.chunk-projection.v2", identity);
  const manifestHash = await commitment("aurion.chunk-manifest.v2", { ...identity, projectionHash });
  return Object.freeze({ ...identity, coordinate: Object.freeze(identity.coordinate), projectionHash, manifestHash });
}

/** Integrity only. A self-consistent manifest is not authenticated authority. */
export async function decodeWorldChunkProjectionManifestV2(input: unknown): Promise<WorldChunkProjectionManifestV2> {
  const parsed = manifestSchema.parse(input);
  const { projectionHash, manifestHash, ...identity } = parsed;
  const expected = await createWorldChunkProjectionManifestV2(identity);
  if (projectionHash !== expected.projectionHash) throw new Error("PROJECTION_HASH_MISMATCH");
  if (manifestHash !== expected.manifestHash) throw new Error("PROJECTION_MANIFEST_HASH_MISMATCH");
  return expected;
}

const jobSchema = z.strictObject({
  jobId: hash, manifest: manifestSchema, generation: unsigned,
});
export type WorldChunkProjectionWorkerJobV2 = Readonly<z.infer<typeof jobSchema>>;

export async function createWorldChunkProjectionWorkerJobV2(input: {
  manifest: WorldChunkProjectionManifestV2; generation: number;
}): Promise<WorldChunkProjectionWorkerJobV2> {
  const generation = unsigned.parse(input.generation);
  const manifest = await decodeWorldChunkProjectionManifestV2(input.manifest);
  const jobId = await commitment("aurion.chunk-worker-job.v2", { manifestHash: manifest.manifestHash, generation });
  return Object.freeze({ jobId, manifest, generation });
}

async function decodeJob(input: unknown): Promise<WorldChunkProjectionWorkerJobV2> {
  const job = jobSchema.parse(input);
  const expected = await createWorldChunkProjectionWorkerJobV2(job);
  if (job.jobId !== expected.jobId) throw new Error("PROJECTION_JOB_HASH_MISMATCH");
  return expected;
}

const resultSchema = z.strictObject({
  version: z.literal(WORLD_CHUNK_PROJECTION_VERSION_V2),
  jobId: hash, manifestHash: hash, projectionHash: hash,
  generation: unsigned, payloadHash: hash,
  byteLength: unsigned.max(WORLD_CHUNK_PROJECTION_PAYLOAD_LIMIT),
});
export type WorldChunkProjectionWorkerResultV2 = Readonly<z.infer<typeof resultSchema>>;

export async function createWorldChunkProjectionWorkerResultV2(input: {
  job: WorldChunkProjectionWorkerJobV2; payload: Uint8Array;
}): Promise<WorldChunkProjectionWorkerResultV2> {
  // Snapshot both inputs synchronously, before the first await.
  const rawJob = jobSchema.parse(input.job);
  if (!(input.payload instanceof Uint8Array) || input.payload.byteLength > WORLD_CHUNK_PROJECTION_PAYLOAD_LIMIT) throw new Error("PROJECTION_PAYLOAD_INVALID");
  const payload = new Uint8Array(input.payload);
  const job = await decodeJob(rawJob);
  const payloadHash = await hashWorldChunkProjectionPayload(payload);
  if (payloadHash !== job.manifest.payloadHash || payload.byteLength !== job.manifest.byteLength) {
    throw new Error("PROJECTION_WORKER_PAYLOAD_MISMATCH");
  }
  return Object.freeze({
    version: WORLD_CHUNK_PROJECTION_VERSION_V2, jobId: job.jobId,
    manifestHash: job.manifest.manifestHash, projectionHash: job.manifest.projectionHash,
    generation: job.generation, payloadHash, byteLength: payload.byteLength,
  });
}

/** Check the actual worker bytes, not only an untrusted worker-supplied hash. */
export async function matchesWorldChunkProjectionWorkerResultV2(
  job: WorldChunkProjectionWorkerJobV2, candidate: unknown, payload: Uint8Array,
): Promise<boolean> {
  try {
    const observed = resultSchema.parse(candidate);
    const expected = await createWorldChunkProjectionWorkerResultV2({ job, payload });
    return canonical(observed) === canonical(expected);
  } catch { return false; }
}

/** Optional allowed-view commitment; it never claims the client displayed it. */
export async function createWorldChunkConnectionProjectionRootV2(input: {
  connectionId: string; manifests: readonly WorldChunkProjectionManifestV2[];
}): Promise<Readonly<{ connectionId: string; interestSetHash: string; projectionRoot: string }>> {
  const connectionId = identifier.parse(input.connectionId);
  const snapshots = z.array(manifestSchema).min(1).max(64).parse(input.manifests);
  const manifests = await Promise.all(snapshots.map(decodeWorldChunkProjectionManifestV2));
  const first = manifests[0]!;
  const seen = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.worldId !== first.worldId || manifest.worldCausalRoot !== first.worldCausalRoot ||
        manifest.projectionPolicy !== first.projectionPolicy) throw new Error("PROJECTION_INTEREST_AUTHORITY_MISMATCH");
    const key = `${manifest.coordinate.x}:${manifest.coordinate.z}:${manifest.layer}`;
    if (seen.has(key)) throw new Error("PROJECTION_INTEREST_DUPLICATE");
    seen.add(key);
  }
  manifests.sort((a, b) => a.coordinate.x - b.coordinate.x || a.coordinate.z - b.coordinate.z || (a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0));
  const interestSetHash = await commitment("aurion.chunk-interest-set.v2", manifests.map(m => ({ coordinate: m.coordinate, layer: m.layer })));
  const projectionRoot = await commitment("aurion.connection-projection-root.v2", {
    connectionId, interestSetHash, projections: manifests.map(m => m.projectionHash),
  });
  return Object.freeze({ connectionId, interestSetHash, projectionRoot });
}
