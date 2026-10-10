import { describe, expect, it } from "vitest";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { requireFunctionalProbeReceipt } from "../scripts/verify-aurion-production-gameplay";
import { assuranceKeys, sealAssuranceSnapshot } from "../shared/aurionAssuranceContract";
import { requireProbePersistenceReadback } from "../shared/aurionProductionProbeEvidence";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "./aurionProductionProbeStore";
import { runProductionGameplaySessionReadback } from "./aurionProductionGameplaySession";
import { AuthoritativeMovementZone } from "./zoneRuntime";

const revision = "a".repeat(40);

describe("effectful production gameplay session readback", () => {
  it("uses the canonical zone join/tick/leave path and returns a post-join snapshot without a browser credential", async () => {
    const recorder = new AurionTickRecorder(200);
    const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
    zone.sourceRevisionOverride = revision;
    const other = zone.join({ userId: 77, socket: { OPEN: 1, readyState: 1, send() {}, close() {} } as any });
    zone.submitMovement(other.connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: -1 } });
    const before = { revision, npcLife: { status: "idle", lastGatewayTick: 0, lastResolutionIndex: 0, decisionHash: null, npcGuilds: null } };
    const after = { revision, npcLife: { status: "confirmed", lastGatewayTick: 600, lastResolutionIndex: 1, decisionHash: "b".repeat(64), npcGuilds: { enabled: true } } };
    let health: { revision: string; npcLife: { status: string; lastGatewayTick: number; lastResolutionIndex: number; decisionHash: string | null; npcGuilds: { enabled: boolean } | null } } = before;
    let ticks = 0;
    const timer = setInterval(() => {
      zone.tick();
      ticks += 1;
      if (ticks >= 4) health = after;
    }, 2);
    try {
      const observed = await runProductionGameplaySessionReadback({
        zone,
        expectedRevision: revision,
        health: () => ({ ...health, status: "ok", service: "echoes-of-aurion", npcLife: { ...health.npcLife, enabled: true } }),
        readNpcGuildOverview: async () => ({ guildCount: 0, guilds: [] }),
        sampleAssurance: async () => sealAssuranceSnapshot({ worldId: "echoes-of-aurion-global", sequence: 1, observedAtMs: 1,
          observations: assuranceKeys.map(key => ({ key, status: "UNVERIFIED", summary: "UNIT_CONTRACT_ONLY", evidenceHash: null, sampleCount: 0 })) }),
        // Unit contract only. The companion MariaDB test proves durable readback.
        readPersistedTicks: async (_zone, from, to) => Array.from({ length: to - from + 1 }, (_, i) => recorder.getEntry(zone.zoneId, from + i)!),
        timings: { handshakeTimeoutMs: 500, cleanupTimeoutMs: 500, npcAdvanceTimeoutMs: 500, pollIntervalMs: 2 },
      });
      expect(observed.worldJoin).toBe("CONFIRMED");
      expect(observed.zoneHandshake).toBe("CONFIRMED");
      expect(observed.welcome.selfEntityId).toBe(`player:${AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID}`);
      expect(observed.welcome).not.toHaveProperty("connectionId");
      expect(observed.snapshot.tick).toBeGreaterThan(observed.welcome.tick);
      expect(observed.snapshot.presences.some(p => p.entityId === observed.welcome.selfEntityId)).toBe(true);
      expect(zone.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)).toBeUndefined();
      expect(observed.probeEffect).toBe("canonical-ephemeral-join-leave");
      expect(() => requireProbePersistenceReadback(observed.persistence, revision, zone.zoneId, observed.welcome.tick, Number(observed.snapshot.tick))).not.toThrow();
      for (const invalid of [undefined, { ...observed.persistence, receipts: [] },
        { ...observed.persistence, joinTick: observed.persistence.joinTick - 1 },
        { ...observed.persistence, receipts: observed.persistence.receipts.slice(1) },
        { ...observed.persistence, membership: [] }]) {
        expect(() => requireProbePersistenceReadback(invalid as any, revision, zone.zoneId, observed.welcome.tick, Number(observed.snapshot.tick))).toThrow();
      }
      expect(() => requireProbePersistenceReadback(observed.persistence, "c".repeat(40), zone.zoneId, observed.welcome.tick, Number(observed.snapshot.tick))).toThrow();
      expect(JSON.stringify(observed.persistence)).not.toContain("connectionId");
      expect(JSON.stringify(observed)).not.toContain("player:77");
      expect(JSON.stringify(observed)).not.toContain('"userId":77');
      expect(JSON.stringify(observed.persistence)).not.toContain('"intents"');
      expect(JSON.stringify(observed.persistence)).not.toContain('"input"');
      expect(requireFunctionalProbeReceipt(observed, revision).status).toBe("PASS");
      expect(() => requireFunctionalProbeReceipt({ ...observed, persistence: undefined }, revision)).toThrow("PROBE_PERSISTED_MEMBERSHIP_INVALID");
    } finally {
      clearInterval(timer);
    }
  });

  it.each(["missing", "old", "timeout"])("rejects %s durable receipts even with a valid session and an assurance object", async mode => {
    const recorder = new AurionTickRecorder(200);
    const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
    zone.sourceRevisionOverride = revision;
    zone.tick();
    const old = recorder.getEntry(zone.zoneId, 1)!;
    const timer = setInterval(() => zone.tick(), 2);
    try {
      await expect(runProductionGameplaySessionReadback({ zone, expectedRevision: revision,
        health: () => ({ revision }), readNpcGuildOverview: async () => ({ guildCount: 0, guilds: [] }),
        sampleAssurance: async () => ({ status: "HEALTHY" }),
        readPersistedTicks: async (_zone, from, to) => from === to ? [recorder.getEntry(zone.zoneId, from)!]
          : mode === "timeout" ? new Promise(() => {}) : mode === "missing" ? [] : [old],
        timings: { handshakeTimeoutMs: 500, cleanupTimeoutMs: 500, pollIntervalMs: 2, persistenceTimeoutMs: 30 },
      })).rejects.toThrow(mode === "timeout" ? "PROBE_PERSISTENCE_TIMEOUT" : "PROBE_PERSISTED_MEMBERSHIP_INVALID");
      expect(zone.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)).toBeUndefined();
    } finally { clearInterval(timer); }
  });

  it("does not finish a failed session before its cleanup tick and durable leave readback", async () => {
    const recorder = new AurionTickRecorder(20);
    const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
    zone.sourceRevisionOverride = revision;
    let durable = false, finished = false;
    const result = runProductionGameplaySessionReadback({ zone, expectedRevision: revision,
      health: () => ({ revision }), readNpcGuildOverview: async () => ({}), sampleAssurance: async () => ({}),
      readPersistedTicks: async (_zone, from) => durable ? [recorder.getEntry(zone.zoneId, from)!] : [],
      timings: { handshakeTimeoutMs: 10, pollIntervalMs: 2 },
    }).then(() => "unexpected success", error => { finished = true; return error.message; });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(finished).toBe(false);
    expect(zone.getPendingIntents().map(i => i.type)).toEqual(["presence_join", "presence_leave"]);
    zone.tick();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(finished).toBe(false);
    durable = true;
    expect(await result).toBe("PROBE_ZONE_HANDSHAKE_TIMEOUT");
    expect(zone.getPendingIntents()).toEqual([]);
    expect(zone.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)).toBeUndefined();
  });

  it("does not change mob behavior relative to an idle zone, while ordinary players still trigger aggro", () => {
    const recorder = new AurionTickRecorder();
    const probe = new AuthoritativeMovementZone("observatory_threshold", recorder);
    const replay = new AuthoritativeMovementZone("observatory_threshold", new AurionTickRecorder());
    replay.isReplay = true;
    const idle = new AuthoritativeMovementZone("observatory_threshold", new AurionTickRecorder());
    const player = new AuthoritativeMovementZone("observatory_threshold", new AurionTickRecorder());
    const socket = () => ({ OPEN: 1, readyState: 1, send() {}, close() {} }) as any;
    const welcome = probe.join({ userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, socket: socket() });
    player.join({ userId: 42, socket: socket() });
    for (let tick = 1; tick <= 20; tick++) {
      probe.tick(); idle.tick(); player.tick();
      expect(probe.getCanonicalZoneState().mobs).toEqual(idle.getCanonicalZoneState().mobs);
      for (const intent of recorder.getEntry(probe.zoneId, tick)!.intents!) replay.enqueueIntent(intent);
      replay.tick();
      expect(replay.getLatestReceipt()?.receiptHash).toBe(probe.getLatestReceipt()?.receiptHash);
      if (tick === 10) probe.leave(welcome.connectionId);
    }
    expect(player.getCanonicalZoneState().mobs.some(mob => mob.targetEntityId === "player:42")).toBe(true);
  });
});
