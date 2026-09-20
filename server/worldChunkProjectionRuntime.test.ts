import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildConfirmedChunkMeshes, ConfirmedChunkProjection, prepareConfirmedChunkProjection } from "../client/src/xaurion/integration/ConfirmedChunkProjection";
import { CHUNK_ASSET_PROJECTION_POLICY, decodeChunkAssetWorkerPayload, type ChunkAssetPayload } from "../shared/worldChunkProjectionPayload";
import { createWorldChunkProjectionManifestV2, hashWorldChunkProjectionPayload, WORLD_CHUNK_PROJECTION_VERSION_V2 } from "../shared/worldChunkProjectionV2";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const hash = (n: string) => `sha256:${n.repeat(64)}`;
const payload: ChunkAssetPayload = {
  schema: "aurion.chunk-payload.v2", worldId: GLOBAL_WORLD_ID, epoch: 2,
  coordinate: { x: -1, z: 1 }, chunkSizeMm: 64_000,
  structures: [{ id: "fixture:structure", assetKey: "aurion_tripo_starpath_marker", positionMm: { x: 34_000, z: 32_000 } }],
  roads: [{ id: "fixture:road", fromMm: { x: 20_000, z: 20_000 }, toMm: { x: 22_000, z: 22_000 } }],
};
async function packet(value: unknown = payload) {
  const payloadJson = JSON.stringify(value), bytes = new TextEncoder().encode(payloadJson);
  const manifest = await createWorldChunkProjectionManifestV2({
    version: WORLD_CHUNK_PROJECTION_VERSION_V2, worldId: GLOBAL_WORLD_ID,
    worldSeedDigest: hash("a"), worldRuleSetVersion: "aurion-world-chunk.v1", generatorVersion: "fixture",
    contentVersion: CHUNK_ASSET_PROJECTION_POLICY, coordinate: payload.coordinate, layer: "world-assets", baseRevision: 1,
    sourceHash: hash("b"), authorityReceiptHash: hash("c"), authorityStateHash: hash("d"), worldCausalRoot: hash("e"),
    projectionSchemaVersion: "aurion.chunk-payload.v2", projectionPolicy: CHUNK_ASSET_PROJECTION_POLICY,
    payloadHash: await hashWorldChunkProjectionPayload(bytes), byteLength: bytes.length,
  });
  return { status: "VERIFIED", epoch: 2, sourceRevision: "f".repeat(40), membership: "COMMITTED_CHUNK_RECEIPT", manifest, payloadJson, mutationAuthority: "none" };
}

describe("active projection adapter boundaries (synthetic unit input, not authority evidence)", () => {
  it("rejects identity mismatch, raw enrichment and actual-byte substitution", async () => {
    const source = await packet();
    await expect(prepareConfirmedChunkProjection(source, 3, payload.coordinate, 1)).rejects.toThrow();
    await expect(prepareConfirmedChunkProjection(source, 2, { x: 0, z: 0 }, 1)).rejects.toThrow();
    await expect(prepareConfirmedChunkProjection({ ...source, rawReceipt: {} }, 2, payload.coordinate, 1)).rejects.toThrow();
    await expect(prepareConfirmedChunkProjection({ ...source, payloadJson: source.payloadJson + " " }, 2, payload.coordinate, 1)).rejects.toThrow();
    await expect(prepareConfirmedChunkProjection(await packet({ ...payload, actorUserId: 1 }), 2, payload.coordinate, 1)).rejects.toThrow();
    await expect(prepareConfirmedChunkProjection(await packet({ ...payload, epoch: 3 }), 2, payload.coordinate, 1)).rejects.toThrow("PROJECTION_EPOCH_MISMATCH");
    const prepared = await prepareConfirmedChunkProjection(source, 2, payload.coordinate, 1);
    expect((await decodeChunkAssetWorkerPayload(prepared.job, prepared.bytes)).decoded).toEqual(payload);
    prepared.bytes[0] ^= 1;
    await expect(decodeChunkAssetWorkerPayload(prepared.job, prepared.bytes)).rejects.toThrow();
  });

  it("builds identical geometry from detached payloads without changing source state", () => {
    const source = JSON.stringify(payload);
    const first = buildConfirmedChunkMeshes(payload, () => 10);
    const second = buildConfirmedChunkMeshes(JSON.parse(source), () => 10);
    const geometry = (group: typeof first) => group.children.map((node: any) => ({ name: node.name, position: node.position.toArray(), rotation: node.rotation.toArray(), parameters: node.geometry.parameters }));
    expect(geometry(first)).toEqual(geometry(second));
    expect(first.children[0]!.position.toArray()).toEqual([-62, 10.75, 64]);
    expect(first.children).toHaveLength(2);
    expect(JSON.stringify(payload)).toBe(source);
  });

  it("fails closed on unsupported assets and renderer construction errors without source mutation", () => {
    const source = JSON.stringify(payload);
    expect(() => buildConfirmedChunkMeshes(payload, () => { throw Error("TERRAIN_UNAVAILABLE"); })).toThrow("TERRAIN_UNAVAILABLE");
    expect(() => buildConfirmedChunkMeshes({ ...payload, structures: [{ ...payload.structures[0]!, assetKey: "unknown" }] }, () => 0)).toThrow("PROJECTION_STRUCTURE_POLICY_UNSUPPORTED");
    expect(JSON.stringify(payload)).toBe(source);
  });

  it("rejects anonymous projection reads before database reconstruction", async () => {
    const caller = appRouter.createCaller({ req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"], user: null });
    await expect(caller.gameplay.worldChunkProjectionV2({ epoch: 2, chunkX: 0, chunkZ: 0 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retries transient chunk failures while the player remains in the same chunk", async () => {
    const fetch = vi.fn(async () => { throw Error("TRANSIENT_PROJECTION_READ_FAILURE"); });
    const projection = new ConfirmedChunkProjection(new THREE.Scene(), 2, () => 0, fetch, vi.fn());
    projection.update({ x: 0, z: 0 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(9));
    projection.update({ x: 0, z: 0 });
    expect(fetch).toHaveBeenCalledTimes(9);
    projection.update({ x: 0, z: 0 }, 0.5);
    await vi.waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(9));
    projection.dispose();
  });
});
