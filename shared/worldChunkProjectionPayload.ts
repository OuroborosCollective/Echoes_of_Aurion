import {
  hashWorldChunkProjectionPayload,
  type WorldChunkProjectionWorkerJobV2,
  type WorldChunkProjectionWorkerResultV2,
} from "./worldChunkProjectionV2";

export const CHUNK_ASSET_PROJECTION_POLICY = "aurion-ax1-chunk-asset-projection.v1" as const;

export interface ChunkStructurePayload {
  id: string;
  assetKey: "aurion_tripo_starpath_marker" | "aurion_tripo_garden_border" | string;
  positionMm: { x: number; z: number };
}

export interface ChunkRoadPayload {
  id: string;
  fromMm: { x: number; z: number };
  toMm: { x: number; z: number };
}

export interface ChunkAssetPayload {
  schema: string;
  worldId: string;
  epoch: number;
  coordinate: { x: number; z: number };
  chunkSizeMm: number;
  structures: ChunkStructurePayload[];
  roads: ChunkRoadPayload[];
}

export async function decodeChunkAssetWorkerPayload(
  job: WorldChunkProjectionWorkerJobV2,
  bytes: Uint8Array
): Promise<{ result: WorldChunkProjectionWorkerResultV2; decoded: ChunkAssetPayload }> {
  if (bytes.length !== job.manifest.byteLength) {
    throw new Error("PROJECTION_WORKER_PAYLOAD_MISMATCH");
  }

  const computedHash = await hashWorldChunkProjectionPayload(bytes);
  if (computedHash !== job.manifest.payloadHash) {
    throw new Error("PROJECTION_WORKER_PAYLOAD_MISMATCH");
  }

  let decodedJson: ChunkAssetPayload;
  try {
    const text = new TextDecoder().decode(bytes);
    decodedJson = JSON.parse(text) as ChunkAssetPayload;
  } catch (error) {
    throw new Error("PROJECTION_WORKER_PAYLOAD_CORRUPT");
  }

  const result: WorldChunkProjectionWorkerResultV2 = {
    jobId: job.jobId,
    manifestHash: job.manifest.manifestHash,
    generation: job.generation,
    payloadHash: computedHash,
    byteLength: bytes.length,
    status: "DECODED",
  };

  return {
    result,
    decoded: decodedJson,
  };
}
