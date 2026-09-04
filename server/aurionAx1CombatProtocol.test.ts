import { describe, expect, it } from "vitest";
import {
  AURION_AX1_COMBAT_TICK_RATE,
  advanceFixedProjectile,
  authoritativeDamageForCommand,
  canonicalizeCombatIntent,
  deterministicGridPath,
  interestSet,
  reconcileAuthoritativeMovement,
  stableThreatOrder,
  testTrajectoryAgainstCapsule,
  validateRewoundCapsuleHit,
} from "./aurionAx1CombatProtocol";

describe("AIM-244 authoritative -ax1 combat and networking", () => {
  it("keeps the normative 10 Hz server tick", () => {
    expect(AURION_AX1_COMBAT_TICK_RATE).toBe(10);
  });

  it("server-stamps actor, tick and hash and rejects client authority fields", () => {
    const intent = canonicalizeCombatIntent({
      actorUserId: 42,
      logicalTick: 100,
      previousSequence: 7,
      request: { sessionId: "encounter_session_42", sequence: 8, command: "skill_5", aim: { x: 1.12345678, y: 2, z: -0 } },
    });
    expect(intent).toMatchObject({ actorUserId: 42, logicalTick: 100, sequence: 8, command: "skill_5", aim: { x: 1.123457, y: 2, z: 0 } });
    expect(intent.intentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => canonicalizeCombatIntent({
      actorUserId: 42,
      logicalTick: 101,
      previousSequence: 8,
      request: { sessionId: "encounter_session_42", sequence: 9, command: "attack", damage: 9_999 } as never,
    })).toThrow(/client authority field rejected: damage/);
    expect(() => canonicalizeCombatIntent({
      actorUserId: 42,
      logicalTick: 101,
      previousSequence: 8,
      request: { sessionId: "encounter_session_42", sequence: 11, command: "attack" },
    })).toThrow(/monotonic/);
  });

  it("keeps command damage server-owned", () => {
    expect(authoritativeDamageForCommand("attack")).toBe(17);
    expect(authoritativeDamageForCommand("skill_9")).toBe(43);
  });

  it("tests a real trajectory against a capsule rather than a range placeholder", () => {
    const capsule = { base: { x: 4, y: 0.5, z: 0 }, top: { x: 4, y: 1.5, z: 0 }, radius: 0.55 };
    expect(testTrajectoryAgainstCapsule({ p0: { x: 0, y: 1, z: 0 }, p1: { x: 8, y: 1, z: 0 } }, capsule).hit).toBe(true);
    expect(testTrajectoryAgainstCapsule({ p0: { x: 0, y: 1, z: 2 }, p1: { x: 8, y: 1, z: 2 } }, capsule).hit).toBe(false);
  });

  it("rewinds a target by logical tick and validates capsule intersection", () => {
    const history = [
      { logicalTick: 10, position: { x: 4, y: 0, z: 0 }, radius: 0.5, height: 2 },
      { logicalTick: 20, position: { x: 6, y: 0, z: 0 }, radius: 0.5, height: 2 },
    ];
    const hit = validateRewoundCapsuleHit({
      trajectory: { p0: { x: 0, y: 1, z: 0 }, p1: { x: 5.2, y: 1, z: 0 } },
      targetHistory: history,
      targetTick: 15,
      maxRange: 8,
    });
    expect(hit).toMatchObject({ valid: true, reason: "hit" });
    const miss = validateRewoundCapsuleHit({
      trajectory: { p0: { x: 0, y: 1, z: 2 }, p1: { x: 5.2, y: 1, z: 2 } },
      targetHistory: history,
      targetTick: 15,
      maxRange: 8,
    });
    expect(miss).toMatchObject({ valid: false, reason: "miss" });
  });

  it("advances integer ballistics identically for identical fixed-tick state", () => {
    const initial = { tick: 4, position: { xMm: 0, yMm: 2_000, zMm: 0 }, velocityPerTick: { xMm: 500, yMm: 100, zMm: -50 } };
    const first = advanceFixedProjectile(initial, { gravityMmPerTick2: -98, dragBps: 100 });
    const second = advanceFixedProjectile(initial, { gravityMmPerTick2: -98, dragBps: 100 });
    expect(first).toEqual(second);
    expect(first.tick).toBe(5);
  });

  it("measures reconciliation deviation and replays only pending monotonic inputs", () => {
    const result = reconcileAuthoritativeMovement({
      predicted: { xMm: 9_000, yMm: 0, zMm: 0 },
      authoritative: { xMm: 1_000, yMm: 0, zMm: 1_000 },
      acknowledgedSequence: 4,
      pending: [{ sequence: 3, x: 1, z: 0 }, { sequence: 5, x: 1, z: 0 }, { sequence: 6, x: 0, z: -1 }],
      stepMm: 100,
      correctionThresholdMm: 80,
    });
    expect(result.corrected).toBe(true);
    expect(result.position).toEqual({ xMm: 1_100, yMm: 0, zMm: 900 });
    expect(result.replayedSequences).toEqual([5, 6]);
  });

  it("orders threat, pathfinding and AOI deterministically", () => {
    expect(stableThreatOrder([
      { entityId: "mob-b", threatMilli: 500 },
      { entityId: "mob-a", threatMilli: 500 },
      { entityId: "mob-c", threatMilli: 900 },
    ]).map(entry => entry.entityId)).toEqual(["mob-c", "mob-a", "mob-b"]);

    const path = deterministicGridPath({ x: 0, z: 0 }, { x: 2, z: 0 }, new Set(["1:0"]));
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path.at(-1)).toEqual({ x: 2, z: 0 });
    expect(path.some(point => point.x === 1 && point.z === 0)).toBe(false);

    expect(interestSet(
      { xMm: 0, yMm: 0, zMm: 0 },
      [
        { entityId: "remote-b", position: { xMm: 100, yMm: 0, zMm: 100 } },
        { entityId: "remote-a", position: { xMm: 0, yMm: 0, zMm: 0 } },
        { entityId: "remote-far", position: { xMm: 10_000, yMm: 0, zMm: 0 } },
      ],
      500,
    )).toEqual(["remote-a", "remote-b"]);
  });
});
