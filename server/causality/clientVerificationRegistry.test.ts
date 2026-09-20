import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientVerificationRegistry } from "./clientVerificationRegistry";
import { createWorldChunkProjectionManifestV2, hashWorldChunkProjectionPayload } from "../../shared/worldChunkProjectionV2";
import { createClientVerificationReceipt } from "../../shared/aurionClientVerificationContract";

async function manifest() {
  const hash = (n: string) => `sha256:${n.repeat(64)}`;
  return createWorldChunkProjectionManifestV2({ version: "aurion-ax1-chunk-projection.v2", worldId: "test-world", worldSeedDigest: hash("a"),
    worldRuleSetVersion: "aurion-world-chunk.v1", generatorVersion: "test-generator", contentVersion: "test-content", coordinate: { x: 0, z: 0 },
    layer: "world-assets", baseRevision: 1, sourceHash: hash("b"), authorityReceiptHash: hash("c"), authorityStateHash: hash("d"), worldCausalRoot: hash("e"),
    projectionSchemaVersion: "aurion.chunk-payload.v2", projectionPolicy: "test-policy", payloadHash: await hashWorldChunkProjectionPayload(new Uint8Array()), byteLength: 0 });
}

describe("live observer binding registry (synthetic manifest unit input)", () => {
  afterEach(() => vi.useRealTimers());
  it("binds reports to the authenticated owner and socket session, then clears on close", async () => {
    const registry = new ClientVerificationRegistry(); registry.open(1, "zone_peer_test");
    const m = await manifest(), binding = await registry.expect(1, "zone_peer_test", m, 1);
    const receipt = await createClientVerificationReceipt({ schema: "aurion.client-verification.v1", ...binding,
      serverReceiptHash: m.authorityReceiptHash, projectionHash: m.projectionHash, appliedGeneration: 1, observedAtLogicalFrame: 8 });
    expect(registry.read(1, binding.connectionId, binding.clientSessionId).status).toBe("CLIENT_UNOBSERVABLE");
    await expect(registry.observe(2, receipt)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await registry.observe(1, receipt)).status).toBe("CLIENT_VERIFIED");
    registry.close(binding.connectionId);
    await expect(registry.observe(1, receipt)).rejects.toMatchObject({ code: "FORBIDDEN" });
    registry.open(1, binding.connectionId);
    expect(() => registry.read(1, binding.connectionId, binding.clientSessionId)).toThrow();
    registry.close(binding.connectionId);
  });

  it("retains bounded concurrent generations, tolerates reordered requests and retires old generations", async () => {
    const registry = new ClientVerificationRegistry(); registry.open(1, "zone_peer_test");
    const m = await manifest();
    const binding = await registry.expect(1, "zone_peer_test", m, 2);
    await registry.expect(1, "zone_peer_test", m, 1);
    expect(registry.read(1, binding.connectionId, binding.clientSessionId).generation).toBe(2);
    for (let generation = 3; generation <= 18; generation++) await registry.expect(1, binding.connectionId, m, generation);
    expect(registry.read(1, binding.connectionId, binding.clientSessionId, 1).reason).toBe("NO_EXPECTATION");
    await expect(registry.expect(1, binding.connectionId, m, 1)).rejects.toThrow("RETIRED");
    registry.close(binding.connectionId);
  });

  it("times out from server time and scheduled disposal removes idle records without reads", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000);
    const registry = new ClientVerificationRegistry(); registry.open(1, "zone_peer_test");
    const binding = await registry.expect(1, "zone_peer_test", await manifest(), 1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(registry.read(1, binding.connectionId, binding.clientSessionId).status).toBe("CLIENT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(285_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(registry.read(1, binding.connectionId, binding.clientSessionId).reason).toBe("NO_EXPECTATION");
    registry.close(binding.connectionId);
  });
});
