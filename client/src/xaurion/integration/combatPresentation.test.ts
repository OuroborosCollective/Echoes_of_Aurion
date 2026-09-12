import { describe, expect, it } from "vitest";
import {
  ZONE_COMBAT_CONTRACT_VERSION,
  type ConfirmedZoneCombatEvent,
} from "@shared/zoneCombatContract";
import {
  projectConfirmedCombatPresentation,
  reduceConfirmedCombatMetrics,
} from "./combatPresentation";

const sourceRevision = "a".repeat(40);

function combatEvent(values: Partial<ConfirmedZoneCombatEvent> & Pick<ConfirmedZoneCombatEvent, "tick" | "sequence" | "attackerEntityId" | "defenderEntityId" | "damage">): ConfirmedZoneCombatEvent {
  return Object.freeze({
    type: "combat",
    contractVersion: ZONE_COMBAT_CONTRACT_VERSION,
    tick: values.tick,
    sequence: values.sequence,
    action: "melee",
    skillId: null,
    skillSourceRevision: null,
    attackerEntityId: values.attackerEntityId,
    defenderEntityId: values.defenderEntityId,
    hit: values.hit ?? values.damage > 0,
    damage: values.damage,
    crit: values.crit ?? false,
    killed: values.killed ?? false,
    defenderHealth: values.defenderHealth ?? 100,
    attackerStamina: values.attackerStamina ?? 90,
    gameplaySourceRevision: values.gameplaySourceRevision ?? sourceRevision,
  });
}

describe("confirmed combat presentation", () => {
  it("projects only combat involving the authenticated player entity", () => {
    const outgoing = projectConfirmedCombatPresentation(combatEvent({
      tick: 10,
      sequence: 1,
      attackerEntityId: "player:7",
      defenderEntityId: "mob_1",
      damage: 100,
      crit: true,
    }), "player:7");
    const incoming = projectConfirmedCombatPresentation(combatEvent({
      tick: 15,
      sequence: 2,
      attackerEntityId: "mob_2",
      defenderEntityId: "player:7",
      damage: 30,
    }), "player:7");
    const unrelated = projectConfirmedCombatPresentation(combatEvent({
      tick: 16,
      sequence: 3,
      attackerEntityId: "player:8",
      defenderEntityId: "mob_3",
      damage: 40,
    }), "player:7");

    expect(outgoing).toMatchObject({ tick: 10, sequence: 1, direction: "outgoing", damage: 100, crit: true });
    expect(incoming).toMatchObject({ tick: 15, sequence: 2, direction: "incoming", damage: 30 });
    expect(unrelated).toBeNull();
  });

  it("derives DPS and combat log exclusively from canonical confirmed ticks", () => {
    const projected = [
      projectConfirmedCombatPresentation(combatEvent({ tick: 10, sequence: 1, attackerEntityId: "player:7", defenderEntityId: "mob_1", damage: 100, crit: true }), "player:7"),
      projectConfirmedCombatPresentation(combatEvent({ tick: 15, sequence: 2, attackerEntityId: "mob_2", defenderEntityId: "player:7", damage: 30 }), "player:7"),
      projectConfirmedCombatPresentation(combatEvent({ tick: 20, sequence: 3, attackerEntityId: "player:7", defenderEntityId: "mob_1", damage: 50 }), "player:7"),
      projectConfirmedCombatPresentation(combatEvent({ tick: 20, sequence: 3, attackerEntityId: "player:7", defenderEntityId: "mob_1", damage: 50 }), "player:7"),
    ].filter((value): value is NonNullable<typeof value> => value !== null);

    const metrics = reduceConfirmedCombatMetrics(projected);

    expect(metrics).toMatchObject({
      totalDamage: 150,
      totalDamageTaken: 30,
      currentDps: 136,
      peakDps: 1000,
      currentDtps: 27,
      critRate: 50,
      combatDurationSec: 1.1,
      eventCount: 3,
      firstTick: 10,
      lastTick: 20,
    });
    expect(metrics.logs.map(entry => [entry.tick, entry.value, entry.direction])).toEqual([
      [20, 50, "outgoing"],
      [15, 30, "incoming"],
      [10, 100, "outgoing"],
    ]);
  });
});
