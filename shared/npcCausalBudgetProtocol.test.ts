import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  NPC_CAUSAL_BUDGET_PROTOCOL,
  planNpcCausalCatchup,
  resolveNpcCausalBudget,
} from "../shared/npcCausalBudgetProtocol";

const REVISION = "a".repeat(40);
const STATE_HASH = canonicalSha256({ npc: "npc-1", state: 7 });

const baseInput = {
  npcId: "npc-1",
  importance: 0,
  hasCriticalDependency: false,
  hasLocalDependency: false,
  hasRegionalDependency: false,
  requiredGuarantee: "NONE" as const,
  simulationInterest: false,
  networkInterest: false,
  presentationInterest: false,
  lastResolutionIndex: -1,
  currentResolutionIndex: 0,
  sourceRevision: REVISION,
  maxCatchupSteps: 32,
};

describe("AIM-596 deterministic NPC causal budgeting", () => {
  it("selects tiers from canonical facts and ignores presentation-only interest", () => {
    expect(resolveNpcCausalBudget({ ...baseInput, hasCriticalDependency: true }).tier).toBe("FULL");
    expect(resolveNpcCausalBudget({ ...baseInput, hasLocalDependency: true }).tier).toBe("REDUCED");
    expect(resolveNpcCausalBudget({ ...baseInput, hasRegionalDependency: true }).tier).toBe("STRATEGIC");
    expect(resolveNpcCausalBudget({ ...baseInput, presentationInterest: true }).tier).toBe("DORMANT");
  });

  it("keeps the decision hash stable for identical canonical inputs", () => {
    const first = resolveNpcCausalBudget({
      ...baseInput,
      importance: 2,
      requiredGuarantee: "LOCAL_SOCIAL_ECONOMY",
      lastResolutionIndex: 4,
      currentResolutionIndex: 12,
    });
    const second = resolveNpcCausalBudget({
      ...baseInput,
      importance: 2,
      requiredGuarantee: "LOCAL_SOCIAL_ECONOMY",
      lastResolutionIndex: 4,
      currentResolutionIndex: 12,
    });
    expect(first).toEqual(second);
    expect(first.decisionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.protocol).toBe(NPC_CAUSAL_BUDGET_PROTOCOL);
  });

  it("preserves causal evidence cardinality and stable ordering", () => {
    const inputs = [
      { resolutionIndex: 8, sourceHash: "sha256:" + "c".repeat(64) },
      { resolutionIndex: 6, sourceHash: "sha256:" + "a".repeat(64) },
      { resolutionIndex: 8, sourceHash: "sha256:" + "b".repeat(64) },
      { resolutionIndex: 8, sourceHash: "sha256:" + "b".repeat(64) },
    ];
    const first = planNpcCausalCatchup({
      npcId: "npc-10",
      tier: "DORMANT",
      stateHash: STATE_HASH,
      reducedModelVersion: "npc-reduced-v1",
      lastResolutionIndex: 5,
      currentResolutionIndex: 8,
      sourceRevision: REVISION,
      boundedCausalInputs: inputs,
      maxSteps: 8,
    });
    const second = planNpcCausalCatchup({
      npcId: "npc-10",
      tier: "DORMANT",
      stateHash: STATE_HASH,
      reducedModelVersion: "npc-reduced-v1",
      lastResolutionIndex: 5,
      currentResolutionIndex: 8,
      sourceRevision: REVISION,
      boundedCausalInputs: [...inputs].reverse(),
      maxSteps: 8,
    });
    expect(first.steps).toBe(3);
    expect(first.orderedCausalInputs).toEqual([
      inputs[1],
      inputs[2],
      inputs[3],
      inputs[0],
    ]);
    expect(first).toEqual(second);
  });

  it("rejects stale or future causal evidence and excessive catch-up", () => {
    expect(() =>
      planNpcCausalCatchup({
        npcId: "npc-11",
        tier: "DORMANT",
        stateHash: STATE_HASH,
        reducedModelVersion: "npc-reduced-v1",
        lastResolutionIndex: 10,
        currentResolutionIndex: 10,
        sourceRevision: REVISION,
        boundedCausalInputs: [{ resolutionIndex: 10, sourceHash: "sha256:" + "a".repeat(64) }],
        maxSteps: 16,
      }),
    ).toThrow("NPC_CAUSAL_BUDGET_INPUT_BEFORE_START");

    expect(() =>
      planNpcCausalCatchup({
        npcId: "npc-12",
        tier: "DORMANT",
        stateHash: STATE_HASH,
        reducedModelVersion: "npc-reduced-v1",
        lastResolutionIndex: 0,
        currentResolutionIndex: 2,
        sourceRevision: REVISION,
        boundedCausalInputs: [{ resolutionIndex: 3, sourceHash: "sha256:" + "b".repeat(64) }],
        maxSteps: 16,
      }),
    ).toThrow("NPC_CAUSAL_BUDGET_INPUT_AFTER_TARGET");

    expect(() =>
      resolveNpcCausalBudget({
        ...baseInput,
        lastResolutionIndex: 0,
        currentResolutionIndex: 100,
        maxCatchupSteps: 16,
      }),
    ).toThrow("NPC_CAUSAL_BUDGET_CATCHUP_EXCEEDED");
  });

  it("fails closed on unsafe logical index ranges", () => {
    expect(() =>
      resolveNpcCausalBudget({
        ...baseInput,
        lastResolutionIndex: -1,
        currentResolutionIndex: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow("NPC_CAUSAL_BUDGET_STEP_RANGE_UNSAFE");
  });
});
