import { describe, expect, it } from "vitest";
import { AURION_WORLD_CHUNK_RULESET } from "../../shared/worldChunkProtocol";
import { createWorldChunkProjectionManifestV2, createWorldChunkProjectionWorkerJobV2, hashWorldChunkProjectionPayload } from "../../shared/worldChunkProjectionV2";
import { AURION_CLIENT_VERIFICATION_SCHEMA, createClientVerificationReceipt, decodeClientVerificationReceipt } from "../../shared/aurionClientVerificationContract";
import { AurionClientVerificationService } from "./clientVerificationService";

const hash = (c: string) => `sha256:${c.repeat(64)}`;
const binding = { connectionId: "test-connection", clientSessionId: "test-session" };
async function setup() {
  let now = 1000;
  const service = new AurionClientVerificationService(binding, { now: () => now });
  const manifest = await createWorldChunkProjectionManifestV2({
    version: "aurion-ax1-chunk-projection.v2", worldId: "test-world", worldSeedDigest: "fnv1a-12345678",
    worldRuleSetVersion: AURION_WORLD_CHUNK_RULESET, generatorVersion: "test-generator", contentVersion: "test-content",
    coordinate: { x: 0, z: 0 }, layer: "base-terrain", baseRevision: 1, sourceHash: "fnv1a-87654321",
    authorityReceiptHash: hash("a"), authorityStateHash: hash("b"), worldCausalRoot: hash("c"),
    projectionSchemaVersion: "aurion.chunk-payload.v2", projectionPolicy: "test-policy",
    payloadHash: await hashWorldChunkProjectionPayload(new Uint8Array()), byteLength: 0,
  });
  const job = await createWorldChunkProjectionWorkerJobV2({ manifest, generation: 7 });
  const input = {
    schema: AURION_CLIENT_VERIFICATION_SCHEMA, ...binding, serverReceiptHash: manifest.authorityReceiptHash,
    projectionHash: manifest.projectionHash, appliedGeneration: 7, observedAtLogicalFrame: 42,
  };
  return { service, job, input, time: (value: number) => { now = value; } };
}

describe("draft client verification observer (no live apply evidence)", () => {
  it("does not mistake delivery for apply or client observation for authority", async () => {
    const { service, job, input } = await setup();
    expect(service.read().status).toBe("CLIENT_UNOBSERVABLE");
    expect((await service.expectApply(job)).status).toBe("CLIENT_UNOBSERVABLE");
    const receipt = await createClientVerificationReceipt(input);
    expect(await service.observe(receipt)).toMatchObject({ status: "CLIENT_VERIFIED", trust: "untrusted-client-observation", mutationAuthority: "none" });
    expect(await service.observe(receipt)).toEqual(service.read());
  });

  it("records a valid contradictory report without rolling back authority", async () => {
    const { service, job, input } = await setup();
    await service.expectApply(job);
    const before = structuredClone(job);
    expect((await service.observe(await createClientVerificationReceipt({ ...input, projectionHash: hash("f") }))).status).toBe("CLIENT_CONTRADICTED");
    expect(job).toEqual(before);
    expect((await service.observe(await createClientVerificationReceipt(input))).status).toBe("CLIENT_CONTRADICTED");
  });

  it("ignores client clock for deadlines and does not resurrect late or expired reports", async () => {
    const { service, job, input, time } = await setup();
    await service.expectApply(job, 100);
    time(1100);
    expect(service.read().status).toBe("CLIENT_TIMEOUT");
    time(1000);
    expect((await service.observe(await createClientVerificationReceipt({ ...input, observedAtLogicalFrame: 0 }))).status).toBe("CLIENT_TIMEOUT");
    time(301000);
    expect(service.read()).toMatchObject({ status: "CLIENT_UNOBSERVABLE", reason: "NO_EXPECTATION", clientVerificationHash: null });
    await expect(service.expectApply(job)).rejects.toThrow("GENERATION_NOT_ADVANCING");
  });

  it("retries cannot extend timeout and stale/future generations cannot confirm current apply", async () => {
    const { service, job, input, time } = await setup();
    await service.expectApply(job, 100);
    time(1099);
    await service.expectApply(job, 10000);
    for (const appliedGeneration of [6, 8]) {
      expect((await service.observe(await createClientVerificationReceipt({ ...input, appliedGeneration }))).status).toBe("CLIENT_UNOBSERVABLE");
    }
    time(1100);
    expect(service.read().status).toBe("CLIENT_TIMEOUT");
  });

  it("rejects foreign sessions, tampered reports and unapproved fields without changing state", async () => {
    const { service, job, input } = await setup();
    await service.expectApply(job);
    await expect(service.observe(await createClientVerificationReceipt({ ...input, clientSessionId: "foreign" }))).rejects.toThrow("BINDING_MISMATCH");
    const receipt = await createClientVerificationReceipt(input);
    await expect(service.observe({ ...receipt, projectionHash: hash("f") })).rejects.toThrow("HASH_MISMATCH");
    await expect(service.observe({ ...receipt, deviceFingerprint: "forbidden" })).rejects.toThrow();
    expect(service.read().status).toBe("CLIENT_UNOBSERVABLE");
    expect(await decodeClientVerificationReceipt(receipt)).toEqual(receipt);
  });

  it("supersedes the old generation and clears observation on disconnect", async () => {
    const { service, job, input } = await setup();
    await service.expectApply(job);
    await service.expectApply(await createWorldChunkProjectionWorkerJobV2({ manifest: job.manifest, generation: 8 }));
    expect((await service.observe(await createClientVerificationReceipt(input))).status).toBe("CLIENT_UNOBSERVABLE");
    service.close();
    expect(service.read().reason).toBe("NO_EXPECTATION");
    await expect(service.expectApply(job)).rejects.toThrow("CLOSED");
    await expect(service.observe(await createClientVerificationReceipt(input))).rejects.toThrow("CLOSED");
  });
});
