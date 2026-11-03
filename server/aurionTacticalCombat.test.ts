import { describe, it, expect, vi } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { replayZoneTick } from "./causality/replayZoneTick";
import { observatoryMobDefinitions } from "./ax1MobContent";
import { combatRule, insideCombatLine } from "../shared/aurionCombatRules";
import { resolveCombatDelta } from "./wasdCombatDeltaProtocol";
import type { Ax1BladeSkillId } from "../shared/ax1BladeSkillProtocol";

function fixture(ruleset = "aurion.zone.rules.v4") {
  const recorder = new AurionTickRecorder();
  const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
  const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
  zone.join({
    userId: 1,
    socket: socket as unknown as WebSocket,
    combatProfile: {
      combatLevel: 7,
      maxHealth: 540,
      weaponBonus: 15,
      weaponTrack: "blade",
      weaponEquipped: true,
    },
  });
  const state = zone.getCanonicalZoneState();
  state.ruleset = ruleset;
  if (ruleset !== "aurion.zone.rules.v4") delete state.combatTactics;
  for (const [i, mob] of state.mobs.entries()) {
    mob.x = 100000 + i * 100;
    mob.z = 100000;
  }
  const player = state.players[0];
  state.mobs[0].x = player.x + 1000;
  state.mobs[0].z = player.z;
  state.mobs[0].idleUntilTick = 10000;
  zone.restoreFromCanonicalState(state);
  return {
    zone,
    recorder,
    target: state.mobs[0].entityId,
    connectionId: "restored_conn_1",
  };
}
function skill(
  f: ReturnType<typeof fixture>,
  skillId: Ax1BladeSkillId,
  seq = 1
) {
  return f.zone.submitSkill(f.connectionId, {
    type: "skill",
    clientSeq: seq,
    skillId,
    targetEntityId: f.target,
  });
}
function checkReplay(f: ReturnType<typeof fixture>) {
  const receipt = f.zone.getLatestReceipt()!;
  const entry = f.recorder.getEntry("observatory_threshold", receipt.tick)!;
  expect(
    replayZoneTick({
      preState: entry.preState!,
      intents: entry.intents!,
      expectedReceipt: receipt,
    }).verdict
  ).toBe("MATCH");
}
describe("Aurion tactical combat v4", () => {
  it.each([
    "k_strike",
    "k_charge",
    "k_shield",
    "k_whirlwind",
    "k_overdrive",
  ] as const)("executes %s at its canonical cost and replays", id => {
    const f = fixture();
    expect(skill(f, id)).toBe("accepted");
    f.zone.tick();
    const state = f.zone.getCanonicalZoneState();
    expect(state.players[0].stamina).toBe(100 - combatRule(id).cost + 1);
    expect(state.players[0].skillCooldowns[id]).toBe(
      1 + combatRule(id).cooldown
    );
    if (id === "k_charge")
      expect(state.combatTactics!.effects[f.target].slowUntil).toBe(31);
    if (id === "k_shield")
      expect(state.combatTactics!.effects["player:1"].shieldUntil).toBe(31);
    if (id === "k_overdrive")
      expect(state.combatTactics!.effects["player:1"].overdriveUntil).toBe(51);
    checkReplay(f);
  });
  it("rejects insufficient stamina without consuming cooldown or mutating target", () => {
    const f = fixture(),
      state = f.zone.getCanonicalZoneState();
    state.players[0].stamina = 7;
    f.zone.restoreFromCanonicalState(state);
    expect(
      f.zone.submitAttack(f.connectionId, {
        type: "attack",
        clientSeq: 1,
        targetEntityId: f.target,
      })
    ).toBe("no_stamina");
    expect(skill(f, "k_shield")).toBe("no_stamina");
    expect(f.zone.getCanonicalZoneState()).toEqual(state);
  });
  it("preserves old rules, including unavailable skills, when replaying v3", () => {
    const f = fixture("aurion.zone.rules.v3");
    expect(skill(f, "k_shield")).toBe("invalid_skill");
    f.zone.tick();
    checkReplay(f);
    expect(f.zone.getCanonicalZoneState().combatTactics).toBeUndefined();
  });
  it("charges whirlwind once across multiple mobs", () => {
    const f = fixture(),
      state = f.zone.getCanonicalZoneState();
    state.mobs[1].x = state.mobs[0].x;
    state.mobs[1].z = state.mobs[0].z;
    f.zone.restoreFromCanonicalState(state);
    expect(skill(f, "k_whirlwind")).toBe("accepted");
    f.zone.tick();
    expect(f.zone.getCanonicalZoneState().players[0].stamina).toBe(71);
    checkReplay(f);
  });
  it("persists windup geometry, allows dodging, and replays the impact", () => {
    const f = fixture(),
      state = f.zone.getCanonicalZoneState(),
      boss = state.mobs.find(m => m.archetype === "titan_boss")!;
    const home = observatoryMobDefinitions.find(
      m => m.entityId === boss.entityId
    )!.homePosition;
    boss.x = home.x;
    boss.z = home.z;
    state.players[0].x = home.x - 1000;
    state.players[0].z = home.z;
    boss.state = "combat";
    boss.targetEntityId = "player:1";
    state.mobs[0].x = 100000;
    f.zone.restoreFromCanonicalState(state);
    f.zone.tick();
    expect(f.zone.getCanonicalZoneState().combatTactics!.windups).toHaveLength(
      1
    );
    checkReplay(f);
    const pending = f.zone.getCanonicalZoneState();
    pending.players[0].z += 10000;
    f.zone.restoreFromCanonicalState(pending);
    const hp = pending.players[0].health;
    for (let i = 0; i < 10; i++) f.zone.tick();
    expect(f.zone.getCanonicalZoneState().players[0].health).toBe(hp);
    checkReplay(f);
  });
  it("enforces the basic attack cadence at the authoritative boundary", () => {
    const f = fixture();
    expect(
      f.zone.submitAttack(f.connectionId, {
        type: "attack",
        clientSeq: 1,
        targetEntityId: f.target,
      })
    ).toBe("accepted");
    f.zone.tick();
    expect(
      f.zone.submitAttack(f.connectionId, {
        type: "attack",
        clientSeq: 2,
        targetEntityId: f.target,
      })
    ).toBe("cooldown");
    for (let i = 0; i < 8; i++) f.zone.tick();
    expect(
      f.zone.submitAttack(f.connectionId, {
        type: "attack",
        clientSeq: 3,
        targetEntityId: f.target,
      })
    ).toBe("accepted");
  });
  it("reduces real incoming damage while the shield is active", () => {
    function damage(shield: boolean) {
      const f = fixture(),
        state = f.zone.getCanonicalZoneState();
      const mob = state.mobs[0],
        home = observatoryMobDefinitions.find(
          m => m.entityId === mob.entityId
        )!.homePosition;
      mob.x = home.x;
      mob.z = home.z;
      mob.state = "combat";
      mob.targetEntityId = "player:1";
      state.players[0].x = home.x;
      state.players[0].z = home.z;
      state.combatTactics!.effects["player:1"] = {
        shieldUntil: shield ? 100 : 0,
      };
      f.zone.restoreFromCanonicalState(state);
      for (let i = 0; i < 40; i++) f.zone.tick();
      checkReplay(f);
      return (
        state.players[0].health -
        f.zone.getCanonicalZoneState().players[0].health
      );
    }
    const regular = damage(false),
      blocked = damage(true);
    expect(regular).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(regular);
  });
  it("interrupts a pending attack with a charge", () => {
    const f = fixture(),
      state = f.zone.getCanonicalZoneState();
    state.combatTactics!.windups = [
      {
        mobId: f.target,
        targetId: "player:1",
        startTick: 0,
        impactTick: 10,
        sequence: 1,
        origin: { x: state.mobs[0].x, z: state.mobs[0].z },
        target: { x: state.players[0].x, z: state.players[0].z },
        width: 1000,
      },
    ];
    f.zone.restoreFromCanonicalState(state);
    expect(skill(f, "k_charge")).toBe("accepted");
    f.zone.tick();
    expect(f.zone.getCanonicalZoneState().combatTactics!.windups).toHaveLength(
      0
    );
    checkReplay(f);
  });
  it("rejects skills for a confirmed unequipped blade track", () => {
    const f = fixture(),
      state = f.zone.getCanonicalZoneState();
    state.players[0].weaponEquipped = false;
    f.zone.restoreFromCanonicalState(state);
    expect(skill(f, "k_shield")).toBe("invalid_skill");
    expect(skill(f, "k_strike")).toBe("invalid_skill");
  });
  it("snapshots active effects by value and expires them on canonical ticks", () => {
    const f = fixture();
    expect(skill(f, "k_shield")).toBe("accepted");
    f.zone.tick();
    const snapshot = f.zone.getCanonicalZoneState();
    snapshot.combatTactics!.effects["player:1"].shieldUntil = 9999;
    expect(
      f.zone.getCanonicalZoneState().combatTactics!.effects["player:1"]
        .shieldUntil
    ).toBe(31);
    for (let i = 0; i < 31; i++) f.zone.tick();
    expect(
      f.zone.getCanonicalZoneState().combatTactics!.effects["player:1"]
        ?.shieldUntil
    ).toBeUndefined();
    checkReplay(f);
  });
  it("uses fixed announced geometry rather than tracking a moving target", () => {
    const w = {
      mobId: "mob_1",
      targetId: "player:1",
      startTick: 1,
      impactTick: 7,
      sequence: 1,
      origin: { x: 0, z: 0 },
      target: { x: 5000, z: 0 },
      width: 1000,
    };
    expect(insideCombatLine({ x: 3000, z: 0 }, w)).toBe(true);
    expect(insideCombatLine({ x: 3000, z: 1000 }, w)).toBe(false);
  });
  it("retains the historical formula and applies explicit v4 tuning", () => {
    const a = { id: "player:1", stamina: 7, skills: { combat: { level: 7 } } },
      d = { id: "mob_1", health: 100, skills: { combat: { level: 7 } } };
    const context = {
      tick: 1,
      sequence: 1,
      weaponBonus: 15,
      entropy: { hitU32: 0, critU32: 0xffffffff, damageU32: 0 },
    };
    expect(resolveCombatDelta("melee", a, d, context).result.success).toBe(
      true
    );
    expect(
      resolveCombatDelta("melee", a, d, {
        ...context,
        tuning: { cost: 8, power: 100, hitChance: 0.9 },
      }).result.reason
    ).toBe("no_stamina");
  });
});
