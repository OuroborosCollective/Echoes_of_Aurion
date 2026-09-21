import { z } from "zod";
import { sha256Bytes } from "./aurionCanonicalHash";

export const WORLD_CHUNK_PROJECTION_V2_VERSION = "aurion-ax1-chunk-projection.v2" as const;

export async function hashWorldChunkProjectionPayload(bytes: Uint8Array): Promise<string> {
  const hex = sha256Bytes(bytes);
  return `sha256:${hex}`;
}

export interface WorldChunkProjectionManifestV2 {
  version: typeof WORLD_CHUNK_PROJECTION_V2_VERSION | string;
  worldId: string;
  worldSeedDigest: string;
  worldRuleSetVersion: string;
  generatorVersion: string;
  contentVersion: string;
  coordinate: { x: number; z: number };
  layer: string;
  baseRevision: number;
  sourceHash: string;
  authorityReceiptHash: string;
  authorityStateHash: string;
  worldCausalRoot: string;
  projectionSchemaVersion: string;
  projectionPolicy: string;
  payloadHash: string;
  byteLength: number;
  manifestHash: string;
}

export async function createWorldChunkProjectionManifestV2(
  input: Omit<WorldChunkProjectionManifestV2, "manifestHash">
): Promise<WorldChunkProjectionManifestV2> {
  const { ...identity } = input;
  const serialized = JSON.stringify(identity, Object.keys(identity).sort());
  const hex = sha256Bytes(new TextEncoder().encode(serialized));
  const manifestHash = `sha256:${hex}`;
  return Object.freeze({
    ...identity,
    coordinate: Object.freeze({ ...identity.coordinate }),
    manifestHash,
  });
}

export const worldChunkProjectionManifestV2Schema = z.object({
  version: z.string(),
  worldId: z.string(),
  worldSeedDigest: z.string(),
  worldRuleSetVersion: z.string(),
  generatorVersion: z.string(),
  contentVersion: z.string(),
  coordinate: z.object({ x: z.number().int(), z: z.number().int() }),
  layer: z.string(),
  baseRevision: z.number().int(),
  sourceHash: z.string(),
  authorityReceiptHash: z.string(),
  authorityStateHash: z.string(),
  worldCausalRoot: z.string(),
  projectionSchemaVersion: z.string(),
  projectionPolicy: z.string(),
  payloadHash: z.string(),
  byteLength: z.number().int(),
  manifestHash: z.string(),
});

export async function decodeWorldChunkProjectionManifestV2(
  input: unknown
): Promise<WorldChunkProjectionManifestV2> {
  return worldChunkProjectionManifestV2Schema.parse(input) as WorldChunkProjectionManifestV2;
}

export interface WorldChunkProjectionWorkerJobV2 {
  jobId: string;
  manifest: WorldChunkProjectionManifestV2;
  generation: number;
}

export async function createWorldChunkProjectionWorkerJobV2(input: {
  manifest: WorldChunkProjectionManifestV2;
  generation: number;
}): Promise<WorldChunkProjectionWorkerJobV2> {
  const hex = sha256Bytes(
    new TextEncoder().encode(
      JSON.stringify({ manifestHash: input.manifest.manifestHash, generation: input.generation })
    )
  );
  return Object.freeze({
    jobId: `job:${hex.slice(0, 32)}`,
    manifest: input.manifest,
    generation: input.generation,
  });
}

export interface WorldChunkProjectionWorkerResultV2 {
  jobId: string;
  manifestHash: string;
  generation: number;
  payloadHash: string;
  byteLength: number;
  status: string;
}

export function matchesWorldChunkProjectionWorkerResultV2(
  expected: WorldChunkProjectionWorkerJobV2,
  candidate: WorldChunkProjectionWorkerResultV2
): boolean {
  return (
    candidate.jobId === expected.jobId &&
    candidate.manifestHash === expected.manifest.manifestHash &&
    candidate.generation === expected.generation
  );
}
