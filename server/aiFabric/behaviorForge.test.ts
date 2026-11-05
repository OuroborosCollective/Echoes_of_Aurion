import { describe, expect, it } from "vitest";
import { evaluateBehavior, behaviorTemplate } from "./behaviorForge";
import { buildPlannerContext } from "../../shared/npcUtilityPlannerDebug";

// Synthetic observations. These tests do not claim production NPC execution.
const context = () => buildPlannerContext({ npcId: "isolated-npc", resolutionIndex: 3,
  goal: "gather_resources", needs: { safety: .8, resources: .8, belonging: .8, status: .8, wealth: .8, power: .8 } });

describe("Behavior Forge recommendation boundary", () => {
  it("never promotes a blocked action even when a behavior tree prioritizes it", () => {
    const input = context();
    const candidate = behaviorTemplate("blacksmith", "tree");
    const constrained = { ...input, candidates: input.candidates.map(c => c.action === "produce"
      ? { ...c, constraintStatus: "blocked" as const, constraintCode: "INVENTORY_FULL" } : c) };
    const result = evaluateBehavior(candidate, constrained);
    expect(result.proposal?.action).not.toBe("produce");
    expect(result.mutationAuthority).toBe("none");
    expect(result).not.toHaveProperty("receipt");
    expect(evaluateBehavior(candidate, constrained)).toEqual(result);
  });
});
