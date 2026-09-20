import { canonicalJson } from "../../shared/aurionCanonicalHash";
import { CHUNK_ASSET_PROJECTION_POLICY, chunkAssetPayloadSchema } from "../../shared/worldChunkProjectionPayload";
import { createWorldChunkProjectionManifestV2, hashWorldChunkProjectionPayload, WORLD_CHUNK_PROJECTION_VERSION_V2 } from "../../shared/worldChunkProjectionV2";
import { WORLD_CHUNK_SIZE_MM, type WorldChunkCoordinate } from "../../shared/worldChunkProtocol";
import { worldCausalRootService } from "./worldCausalRootService";

/** Only persisted, independently reconstructed epoch state may enter this producer. */
export async function readConfirmedChunkAssetProjection(worldId: string, epoch: number, coordinate: WorldChunkCoordinate) {
  const readback = await worldCausalRootService.readChunk(worldId, epoch, coordinate);
  if (readback.status !== "VERIFIED") return readback;
  const { state, receipt } = readback;
  const payload = chunkAssetPayloadSchema.parse({
    schema: "aurion.chunk-payload.v2", worldId, epoch, coordinate, chunkSizeMm: WORLD_CHUNK_SIZE_MM,
    structures: state.materialized.structures, roads: state.materialized.roads,
  });
  const payloadJson = canonicalJson(payload);
  const bytes = new TextEncoder().encode(payloadJson);
  const manifest = await createWorldChunkProjectionManifestV2({
    version: WORLD_CHUNK_PROJECTION_VERSION_V2, worldId, worldSeedDigest: state.universe.worldSeedHash,
    worldRuleSetVersion: state.universe.rulesetVersion, generatorVersion: state.universe.generatorVersion,
    contentVersion: CHUNK_ASSET_PROJECTION_POLICY, coordinate, layer: "world-assets", baseRevision: state.universe.baseRevision,
    sourceHash: state.baseStateHash, authorityReceiptHash: receipt.receiptHash,
    authorityStateHash: state.authorityStateHash, worldCausalRoot: readback.worldRootHash,
    projectionSchemaVersion: "aurion.chunk-payload.v2", projectionPolicy: CHUNK_ASSET_PROJECTION_POLICY,
    payloadHash: await hashWorldChunkProjectionPayload(bytes), byteLength: bytes.byteLength,
  });
  return Object.freeze({ status: "VERIFIED" as const, epoch, sourceRevision: receipt.sourceRevision,
    membership: readback.membership, manifest, payloadJson, mutationAuthority: "none" as const });
}
