import { z } from "zod";
import { WORLD_CHUNK_COORDINATE_LIMIT, WORLD_CHUNK_SIZE_MM } from "./worldChunkProtocol";
import { createWorldChunkProjectionWorkerResultV2, type WorldChunkProjectionWorkerJobV2 } from "./worldChunkProjectionV2";

export const CHUNK_ASSET_PROJECTION_POLICY = "aurion.confirmed-chunk-assets.v1" as const;
const id = z.string().min(1).max(128);
const position = z.strictObject({ x: z.number().int().min(0).max(WORLD_CHUNK_SIZE_MM - 1), z: z.number().int().min(0).max(WORLD_CHUNK_SIZE_MM - 1) });
export const chunkAssetPayloadSchema = z.strictObject({
  schema: z.literal("aurion.chunk-payload.v2"), worldId: id, epoch: z.number().int().min(1),
  coordinate: z.strictObject({ x: z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT), z: z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT) }),
  chunkSizeMm: z.literal(WORLD_CHUNK_SIZE_MM),
  structures: z.array(z.strictObject({ id, assetKey: id, positionMm: position })).max(64),
  roads: z.array(z.strictObject({ id, fromMm: position, toMm: position })).max(64),
});
export type ChunkAssetPayload = z.infer<typeof chunkAssetPayloadSchema>;

/** Worker and main thread both validate actual bytes; decoded objects are never trusted alone. */
export async function decodeChunkAssetWorkerPayload(job: WorldChunkProjectionWorkerJobV2, bytes: Uint8Array) {
  const payload = new Uint8Array(bytes);
  const result = await createWorldChunkProjectionWorkerResultV2({ job, payload });
  const decoded = chunkAssetPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)));
  if (decoded.worldId !== job.manifest.worldId || decoded.coordinate.x !== job.manifest.coordinate.x || decoded.coordinate.z !== job.manifest.coordinate.z ||
      job.manifest.layer !== "world-assets" || job.manifest.projectionPolicy !== CHUNK_ASSET_PROJECTION_POLICY) throw new Error("PROJECTION_PAYLOAD_IDENTITY_MISMATCH");
  return { result, decoded };
}
