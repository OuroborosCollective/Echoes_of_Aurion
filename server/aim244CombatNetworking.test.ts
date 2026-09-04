import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AURION_AX1_COMBAT_TICK_RATE,
  BuffDebuffSystem,
  EntityStateMachine,
  LagCompensationHistory,
  NavGrid,
  PredictionReconciler,
  ThreatMatrix,
  advanceBallistic,
  testCapsuleAgainstSegment,
} from "./ax1CombatAuthority";
import { damageForMcpAction } from "./gameplayProtocol";

const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-244 server-authoritative -ax1 combat/networking", () => {
  it("uses real segment/capsule geometry instead of a distance-only hit", () => {
    const capsule = { base: { x: 0, y: 0.5, z: 0 }, top: { x: 0, y: 1.5, z: 0 }, radius: 0.5 };
    expect(testCapsuleAgainstSegment(capsule, { p0: { x: -2, y: 1, z: 0 }, p1: { x: 2, y: 1, z: 0 } }).hit).toBe(true);
    expect(testCapsuleAgainstSegment(capsule, { p0: { x: -2, y: 1, z: 2 }, p1: { x: 2, y: 1, z: 2 } }).hit).toBe(false);
  });

  it("rewinds hitboxes by logical server ticks, never client timestamps", () => {
    const history = new LagCompensationHistory();
    history.record("mob:1", { tick: 10, position: { x: 0, y: 0, z: 0 }, capsule: { base: { x: 0, y: 0.5, z: 0 }, top: { x: 0, y: 1.5, z: 0 }, radius: 0.5 }, facingAngle: 0 });
    history.record("mob:1", { tick: 12, position: { x: 2, y: 0, z: 0 }, capsule: { base: { x: 2, y: 0.5, z: 0 }, top: { x: 2, y: 1.5, z: 0 }, radius: 0.5 }, facingAngle: 0 });
    expect(history.rewind("mob:1", 11)?.position.x).toBe(1);
    const hit = history.validateSegmentHit({ targetId: "mob:1", targetTick: 11, attackerPosition: { x: -2, y: 1, z: 0 }, maxRange: 8, attackSegment: { p0: { x: -2, y: 1, z: 0 }, p1: { x: 3, y: 1, z: 0 } } });
    expect(hit.hit).toBe(true);
    expect(AURION_AX1_COMBAT_TICK_RATE).toBe(10);
  });

  it("reconciles prediction against server acknowledgements and replays only unacked inputs", () => {
    const reconciler = new PredictionReconciler(0.1);
    reconciler.push({ sequence: 1, position: { x: 1, z: 0 } });
    reconciler.push({ sequence: 2, position: { x: 2, z: 0 } });
    reconciler.push({ sequence: 3, position: { x: 3, z: 0 } });
    const result = reconciler.reconcile(2, { x: 1.5, z: 0 }, { x: 2, z: 0 });
    expect(result.corrected).toBe(true);
    expect(result.replay.map(sample => sample.sequence)).toEqual([3]);
  });

  it("keeps threat, FSM and pathfinding deterministic", () => {
    const threat = new ThreatMatrix();
    threat.add("mob", "player:b", 10);
    threat.add("mob", "player:a", 10);
    expect(threat.target("mob")).toBe("player:a");
    const fsm = new EntityStateMachine();
    expect(fsm.transition("chase")).toBe("chase");
    expect(fsm.transition("attack")).toBe("attack");
    const grid = new NavGrid(5, 5);
    grid.setBlocked({ x: 1, z: 0 });
    expect(grid.findPath({ x: 0, z: 0 }, { x: 2, z: 0 })).toEqual([
      { x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 0 },
    ]);
  });

  it("ticks buffs and ballistics from fixed server deltas", () => {
    const buffs = new BuffDebuffSystem();
    buffs.apply({ id: "ward", stat: "defense", magnitudeBps: 2500, expiresAtTick: 5 }, 1);
    expect(buffs.multiplier("defense", 2)).toBe(1.25);
    expect(buffs.multiplier("defense", 5)).toBe(1);
    const next = advanceBallistic({ position: { x: 0, y: 1, z: 0 }, velocity: { x: 10, y: 10, z: 0 } }, 0.1);
    expect(next.position.x).toBe(1);
    expect(next.position.y).toBeCloseTo(1.9019, 4);
  });

  it("routes the live encounter damage budget through the server combat adapter and keeps zone identity server-bound", () => {
    expect(damageForMcpAction("attack")).toBe(17);
    expect(damageForMcpAction("skill_9")).toBe(43);
    const gameplay = read("server/gameplayProtocol.ts");
    const zone = read("client/src/lib/zoneMovement.ts");
    const routers = read("server/routers.ts");
    expect(gameplay).toContain('import { ax1DamageForAction } from "./ax1CombatAuthority"');
    expect(zone).toContain("never predicts positions or sends player coordinates");
    expect(routers).toContain("ctx.user.id");
    expect(routers).toContain("issueZoneConnectionTicket");
    expect(routers).not.toContain("query.playerId");
  });
});
