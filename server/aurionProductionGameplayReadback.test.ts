import { describe, expect, it } from "vitest";
import { requireGameplayHealth, requireNpcAdvance, requireZoneWelcome, requireFunctionalProbeReceipt } from "../scripts/verify-aurion-production-gameplay";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";
import { assuranceKeys, sealAssuranceSnapshot } from "../shared/aurionAssuranceContract";
import { verifySnapshot } from "../scripts/aurion-production-assurance.mjs";

describe("production gameplay readback rejects superficial health", () => {
  const revision = "a".repeat(40);
  const health = { status: "ok", service: "echoes-of-aurion", revision, npcLife: { enabled: true, status: "confirmed", failureCode: null } };
  it("rejects healthy HTTP/container identity with the wrong release or degraded NPCs", () => {
    expect(() => requireGameplayHealth({ ...health, revision: "b".repeat(40) }, revision)).toThrow("GAMEPLAY_REVISION_MISMATCH");
    expect(() => requireGameplayHealth({ ...health, npcLife: { enabled: true, status: "degraded" } }, revision)).toThrow("NPC_LIFE_DEGRADED");
  });
  it("never upgrades a read-only observation into successful functional production proof", () => {
    expect(() => requireFunctionalProbeReceipt({ healthBefore: health, health, worldJoin: "UNVERIFIED", zoneHandshake: "UNVERIFIED" }, revision)).toThrow("READ_ONLY_PROBE_WORLD_JOIN_UNVERIFIED");
  });
  it("requires an authoritative welcome containing the joining player", () => {
    const welcome = { type: "welcome", zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION, tick: 1, snapshotSeq: 1, selfEntityId: "player:1", presences: [] };
    expect(() => requireZoneWelcome(welcome)).toThrow("WORLD_JOIN_NOT_CONFIRMED");
    expect(() => requireZoneWelcome({ ...welcome, presences: [{ entityId: "player:1", userId: 1, position: { x: 0, z: 0 }, lastAcceptedClientSeq: 0 }] })).not.toThrow();
  });
  it("requires both fixed-tick and confirmed NPC resolution advancement", () => {
    const before = { npcLife: { lastGatewayTick: 600, lastResolutionIndex: 1 } };
    const after = { npcLife: { status: "confirmed", lastGatewayTick: 1200, lastResolutionIndex: 2, decisionHash: "a".repeat(64), npcGuilds: { enabled: true } } };
    expect(requireNpcAdvance(before, after)).toBe(true);
    expect(requireNpcAdvance(before, { npcLife: { ...after.npcLife, lastResolutionIndex: 1 } })).toBe(false);
  });
  it("verifies the sealed assurance readback without upgrading missing evidence", () => {
    const snapshot = sealAssuranceSnapshot({ worldId: "echoes-of-aurion-global", sequence: 1, observedAtMs: 1,
      observations: assuranceKeys.map(key => ({ key, status: "UNVERIFIED", summary: "EVIDENCE_MISSING", evidenceHash: null, sampleCount: 0 })),
    });
    expect(verifySnapshot(snapshot)).toBe(true);
    expect(verifySnapshot({ ...snapshot, status: "HEALTHY" })).toBe(false);
    expect(snapshot.status).toBe("UNVERIFIED");
  });
});
