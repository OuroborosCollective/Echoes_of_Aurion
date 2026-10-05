import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { resolveCombatDelta } from "./wasdCombatDeltaProtocol";
import type { ZoneId } from "./zoneProtocol";

function fixture(name: string) {
  const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
  const zone = new AuthoritativeMovementZone(`combat_continuity_${name}` as ZoneId);
  const { connectionId } = zone.join({ userId: 73, socket: socket as unknown as WebSocket,
    combatProfile: { combatLevel: 1, maxHealth: 100_000, weaponBonus: 0, weaponEquipped: false, weaponTrack: "staff" } });
  const events = () => socket.send.mock.calls.map(([payload]) => JSON.parse(payload)).filter(event => event.type === "combat");
  return { zone, connectionId, events };
}

describe("continuous authoritative zone combat", () => {
  it("starts a confirmed unarmed hit at one while preserving the existing combat-level term and armed profile", () => {
    const defender = { id: "mob", health: 100, skills: { combat: { level: 1 } } };
    const context = { tick: 1, sequence: 1, entropy: { hitU32: 0, critU32: 0xffffffff, damageU32: 3 } };
    const attacker = (level: number) => ({ id: "player:73", stamina: 100, skills: { combat: { level } } });
    for (const critU32 of [0, 0xffffffff]) for (const damageU32 of [0, 1, 2, 3]) {
      expect(resolveCombatDelta("melee", attacker(1), defender, { ...context, entropy: { hitU32: 0, critU32, damageU32 }, unarmed: true }).result.damage).toBe(1);
    }
    expect(resolveCombatDelta("melee", attacker(8), defender, { ...context, unarmed: true }).result.damage).toBe(8);
    expect(resolveCombatDelta("melee", attacker(1), defender, { ...context, weaponBonus: 15, unarmed: false })).toEqual(
      resolveCombatDelta("melee", attacker(1), defender, { ...context, weaponBonus: 15 }));
  });
  it("does not discard an accepted basic attack when a newer movement arrives in the same tick", () => {
    const { zone, connectionId, events } = fixture("sequence");
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    for (let i = 0; i < 5; i++) zone.tick();
    expect(zone.submitAttack(connectionId, { type: "attack", clientSeq: 2, targetEntityId: "mob_12" })).toBe("accepted");
    zone.submitMovement(connectionId, { type: "move", clientSeq: 3, input: { x: 0, z: 0 } });
    zone.tick();
    expect(events().filter(event => event.attackerEntityId === "player:73")).toHaveLength(1);
    expect(zone.submitAttack(connectionId, { type: "attack", clientSeq: 2, targetEntityId: "mob_12" })).toBe("stale");
    expect(zone.getCanonicalZoneState().players[0]!.weaponEquipped).toBe(false);
    const restored = new AuthoritativeMovementZone(zone.getCanonicalZoneState().zoneId as ZoneId);
    restored.restoreFromCanonicalState(zone.getCanonicalZoneState());
    expect(restored.getCanonicalZoneState().players).toEqual(zone.getCanonicalZoneState().players);
  });

  it("preserves the historical v2 action ordering during restored replay", () => {
    const { zone, connectionId } = fixture("historical");
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    for (let i = 0; i < 5; i++) zone.tick();
    const state = zone.getCanonicalZoneState();
    const historical = { ...state, ruleset: "aurion.zone.rules.v2", players: state.players.map(({ weaponEquipped: _legacyAbsent, ...player }) => player) };
    const restored = new AuthoritativeMovementZone(state.zoneId as ZoneId);
    restored.restoreFromCanonicalState(historical);
    const restoredConnection = restored.connectionIdForUser(73)!;
    const before = restored.mobSnapshot().find(mob => mob.entityId === "mob_12")!.health;
    expect(restored.submitAttack(restoredConnection, { type: "attack", clientSeq: 2, targetEntityId: "mob_12" })).toBe("accepted");
    restored.submitMovement(restoredConnection, { type: "move", clientSeq: 3, input: { x: 0, z: 0 } });
    restored.tick();
    expect(restored.mobSnapshot().find(mob => mob.entityId === "mob_12")!.health).toBe(before);
    expect(restored.getLatestReceipt()!.rulesetVersion).toBe("aurion.zone.rules.v2");
    expect(restored.getCanonicalZoneState().players[0]).not.toHaveProperty("weaponEquipped");
  });

  it("keeps autonomous enemies damaging a living player after their initial stamina is spent", () => {
    const { zone, events } = fixture("stamina");
    for (let i = 0; i < 300; i++) zone.tick();
    const before = zone.combatSnapshot().find(actor => actor.entityId === "player:73")!.health;
    for (let i = 0; i < 100; i++) zone.tick();
    expect(zone.combatSnapshot().find(actor => actor.entityId === "player:73")!.health).toBeLessThan(before);
    expect(events().some(event => event.tick > 300 && event.attackerEntityId === "mob_12" && event.damage > 0)).toBe(true);
  });
});
