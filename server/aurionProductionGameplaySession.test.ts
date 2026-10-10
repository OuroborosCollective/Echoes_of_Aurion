import { describe, expect, it } from "vitest";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "./aurionProductionProbeStore";
import { runProductionGameplaySessionReadback } from "./aurionProductionGameplaySession";
import { AuthoritativeMovementZone } from "./zoneRuntime";

const revision = "a".repeat(40);

describe("effectful production gameplay session readback", () => {
  it("uses the canonical zone join/tick/leave path and returns a post-join snapshot without a browser credential", async () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold", new AurionTickRecorder(20));
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
        health: () => health,
        readNpcGuildOverview: async () => ({ guildCount: 0, guilds: [] }),
        sampleAssurance: async () => ({ schemaVersion: 1, status: "UNVERIFIED" }),
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
    } finally {
      clearInterval(timer);
    }
  });
});
