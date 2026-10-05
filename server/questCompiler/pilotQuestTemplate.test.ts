import { describe, expect, it } from "vitest";
import { observatoryMobDefinitions } from "../ax1MobContent";
import { AurionCombatVictoryEvidenceSchema } from "../../shared/aurionQuestContract";
import { QuestRuntimeEngine } from "./runtime";
import { QuestTemplateRegistry } from "./templateRegistry";
import { WorldFactEngine } from "./worldFacts";
import { matchesQuestObjectiveEvent } from "./eventBindingMatcher";
import { PILOT_WOLF_QUEST_TEMPLATE } from "./pilotQuestTemplate";

const objective = PILOT_WOLF_QUEST_TEMPLATE.nodes.find(node => node.id === "defeat_wolves")!.objective!;
const evidence = (overrides: Record<string, unknown> = {}) => ({
  schema: "aurion.combat.victory.v1",
  eventId: "combat-event-1",
  receiptId: "combat-receipt-1",
  logicalRevision: 41,
  playerUserId: 7,
  opponentEntityId: "wolf-entity-1",
  opponentSpecies: "clockwork_stalker",
  outcome: "victory",
  confirmed: true,
  ...overrides,
});

describe("versioned pilot wolf quest", () => {
  it("binds its giver to the stable north-gate guard and requires exactly six wolves", () => {
    expect(PILOT_WOLF_QUEST_TEMPLATE).toMatchObject({ templateId: "starter-wolves-6", version: 1 });
    expect(PILOT_WOLF_QUEST_TEMPLATE.roles[0]?.predicates).toContainEqual({
      subjectField: "id", operator: "eq", expectedValue: "starter_village_north_gate_guard",
    });
    expect(objective).toMatchObject({ key: "wolf_victories", targetValue: 6 });
    const targets = observatoryMobDefinitions.filter(mob => mob.archetype === objective.eventBinding?.matchValue);
    expect(targets.map(mob => mob.entityId)).toEqual(["mob_1", "mob_10", "mob_12", "mob_14", "mob_16", "mob_8"]);
  });

  it("accepts only confirmed, player-bound wolf victories with complete evidence identity", () => {
    expect(matchesQuestObjectiveEvent(objective, evidence(), 7)).toBe(true);
    expect(matchesQuestObjectiveEvent(objective, evidence({ opponentSpecies: "boar" }), 7)).toBe(false);
    expect(matchesQuestObjectiveEvent(objective, evidence(), 8)).toBe(false);
    expect(matchesQuestObjectiveEvent(objective, evidence({ outcome: "defeat" }), 7)).toBe(false);
    expect(matchesQuestObjectiveEvent(objective, evidence({ confirmed: false }), 7)).toBe(false);
    for (const field of ["eventId", "receiptId", "logicalRevision", "opponentEntityId", "opponentSpecies"] as const) {
      const candidate = evidence();
      delete candidate[field];
      expect(matchesQuestObjectiveEvent(objective, candidate, 7)).toBe(false);
    }
    expect(AurionCombatVictoryEvidenceSchema.safeParse(evidence()).success).toBe(true);
  });

  it("completes only on the sixth canonical increment and cannot exceed the target", () => {
    const facts = new WorldFactEngine();
    const trigger = facts.recordEvent({ id: "pilot-trigger", type: "PILOT", source: "aurion.test", data: {} }).event;
    const registry = new QuestTemplateRegistry();
    registry.registerTemplate(PILOT_WOLF_QUEST_TEMPLATE);
    const runtime = new QuestRuntimeEngine(facts, registry, { now: () => 1_800_000_000_000 });
    const compiled = runtime.compileAndOfferQuest({ worldId: "world", playerUserId: 7, triggerEventId: trigger.id });
    let instance = runtime.acceptQuest(compiled.instance, compiled.plan).updatedInstance;
    for (let count = 1; count <= 5; count += 1) {
      const result = runtime.progressObjective(instance, compiled.plan, "wolf_victories", 1, { eventSequence: count + 1, idempotencyKey: `wolf:${count}` });
      expect(result.completedNode).toBe(false);
      expect(result.updatedInstance.objectiveProgress.wolf_victories).toBe(count);
      instance = result.updatedInstance;
    }
    const sixth = runtime.progressObjective(instance, compiled.plan, "wolf_victories", 1, { eventSequence: 7, idempotencyKey: "wolf:6" });
    expect(sixth.completedNode).toBe(true);
    expect(sixth.updatedInstance.currentNodeId).toBe("end");
    expect(sixth.updatedInstance.objectiveProgress.wolf_victories).toBe(6);
    expect(() => runtime.progressObjective(sixth.updatedInstance, compiled.plan, "wolf_victories", 1)).toThrow("QUEST_OBJECTIVE_KEY_MISMATCH");
    expect(sixth.updatedInstance.objectiveProgress.wolf_victories).toBe(6);
  });
});
