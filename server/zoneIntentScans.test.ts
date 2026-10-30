import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import type { AurionZoneIntent } from "../shared/aurionZoneIntentContract";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import type { ZoneId } from "./zoneProtocol";

// Socket is a test double; authority/queue/receipt execution below is real local code.
function fixture() {
  const socket = { readyState: 1, OPEN: 1, send() {}, close() {} } as unknown as WebSocket;
  const zone = new AuthoritativeMovementZone("intent_scan_fixture" as ZoneId, new AurionTickRecorder(256));
  const first = zone.join({ userId: 41, socket, combatProfile: { combatLevel: 7, maxHealth: 540, weaponBonus: 15, weaponTrack: "blade" } }).connectionId;
  const second = zone.join({ userId: 42, socket }).connectionId;
  return { zone, socket, first, second };
}
function queue(zone: AuthoritativeMovementZone): AurionZoneIntent[] {
  return Reflect.get(zone, "pendingIntents");
}

describe("zone intent scans preserve the original admission contract", () => {
  it("preserves next sequence across mixed players, queued moves and committed ticks", () => {
    const { zone, first, second } = fixture();
    for (let tick = 0; tick < 100; tick += 1) {
      const sequence = zone.nextClientSequenceForUser(41);
      expect(zone.submitMovement(first, { type: "move", clientSeq: sequence, input: { x: tick % 2 ? 1 : 0, z: 0 } })).toBe("accepted");
      expect(zone.submitMovement(second, { type: "move", clientSeq: 1000 + tick, input: { x: 0, z: 0 } })).toBe("accepted");
      const ownSequences = queue(zone).filter(intent => intent.entityId === "player:41").map(intent => intent.clientSeq);
      expect(zone.nextClientSequenceForUser(41)).toBe(Math.max(sequence, ...ownSequences) + 1);
      zone.tick();
      expect(zone.nextClientSequenceForUser(41)).toBe(sequence + 1);
      expect(zone.getLatestReceipt()?.tick).toBe(tick + 1);
    }
    expect(() => zone.nextClientSequenceForUser(999)).toThrow("ZONE_USER_NOT_CONNECTED");
  });

  it("retains other actors' queued order exactly when replacing a connection", () => {
    const { zone, socket, first, second } = fixture();
    zone.submitMovement(first, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    zone.submitMovement(second, { type: "move", clientSeq: 1, input: { x: 0, z: 1 } });
    const retained = queue(zone).filter(intent => intent.entityId !== "player:41");
    const replacement = zone.join({ userId: 41, socket, combatProfile: { combatLevel: 7, maxHealth: 540, weaponBonus: 15, weaponTrack: "blade" } });
    expect(queue(zone).filter(intent => intent.entityId !== "player:41")).toEqual(retained);
    expect(queue(zone).filter(intent => intent.entityId === "player:41")).toHaveLength(1);
    expect(queue(zone).at(-1)?.type).toBe("presence_join");
    expect(zone.submitMovement(first, { type: "move", clientSeq: 2, input: { x: 1, z: 0 } })).toBe("missing");
    expect(zone.nextClientSequenceForUser(41)).toBe(1);
    expect(replacement.connectionId).not.toBe(first);
  });

  it("matches the original combat predicate for actual admitted move/skill queues", () => {
    const { zone, first } = fixture();
    const hasCombat = (id: string): boolean => Reflect.get(zone, "hasQueuedPlayerCombat").call(zone, id);
    for (let tick = 0; tick < 6; tick += 1) {
      zone.submitMovement(first, { type: "move", clientSeq: tick + 1, input: { x: 0, z: -1 } });
      zone.tick();
    }
    expect(zone.submitSkill(first, { type: "skill", clientSeq: 7, skillId: "k_strike", targetEntityId: "mob_12" })).toBe("accepted");
    expect(hasCombat("player:41")).toBe(true);
    for (const id of ["player:41", "player:42", "player:999"]) {
      expect(hasCombat(id)).toBe(queue(zone).some(intent => intent.entityId === id && (intent.type === "attack" || intent.type === "skill")));
    }
  });
});
