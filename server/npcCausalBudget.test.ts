import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { planNpcCausalBudget } from "./npcCausalBudget";

const revision = "b".repeat(40);
const stateHash = canonicalSha256({ npc: "npc-1", state: "confirmed" });

const base = {
  npcId: "npc-1",
  importance: 0,
  hasCriticalDependency: false,
  hasLocalDependency: false,
  hasRegionalDependency: false,
  requiredGuarantee: "NONE" as const,
  simulationInterest: false,
  networkInterest: false,
  presentationInterest: false,
  lastResolutionIndex: 2,
  currentResolutionIndex: 5,
  sourceRevision: revision,
  maxCatchupSteps: 8,
  stateHash,
};

describe("AIM-596 NPC causal budget runtime planner", () => {
  it("creates deterministic dormant catch-up from confirmed inputs", () => {
    const input = { ...base, boundedCausalInputHashes: ["sha256:" + "d".repeat(64), "sha256:" + "a".repeat(64)] };
    const first = planNpcCausalBudget(input);
    const second = planNpcCausalBudget({ ...input, boundedCausalInputHashes: [...input.boundedCausalInputHashes].reverse() });
    expect(first).toEqual(second);
    expect(first.decision.tier).toBe("DORMANT");
    expect(first.catchup?.steps).toBe(3);
    expect(first.runtimeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("does not catch up a non-dormant NPC", () => {
    const plan = planNpcCausalBudget({
      ...base,
      hasRegionalDependency: true,
      currentResolutionIndex: 5,
      boundedCausalInputHashes: [],
    });
    expect(plan.decision.tier).toBe("STRATEGIC");
    expect(plan.catchup).toBeNull();
  });
});
