import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  NPC_CAUSAL_BUDGET_PROTOCOL,
  planNpcCausalCatchup,
  resolveNpcCausalBudget,
} from "../shared/npcCausalBudgetProtocol";

const REVISION = "a".repeat(40);
const stateHash = canonicalSha256({ npc: "npc-1", state: 7 });

describe("AIM-596 deterministic NPC causal budgeting", () => {
  it("selects tiers only from canonical dependency/interest/guarantee facts", () => {
    expect(resolveNpcCausalBudget({
      npcId: "npc-1", importance: 0, hasCriticalDependency: true, hasLocalDependency: false,
      hasRegionalDependency: false, requiredGuarantee: "NONE", simulationInterest: false,
      networkInterest: false, presentationInterest: false, lastResolutionIndex: 10,
      currentResolutionIndex: 10, sourceRevision: REVISION, maxCatchupSteps: 32,
    }).tier).toBe("FULL");
    expect(resolveNpcCausalBudget({
      npcId: "npc-2", importance: 0, hasCriticalDependency: false, hasLocalDependency: true,
      hasRegionalDependency: false, requiredGuarantee: "NONE", simulationInterest: false,
      networkInterest: false, presentationInterest: false, lastResolutionIndex: 10,
      currentResolutionIndex: 10, sourceRevision: REVISION, maxCatchupSteps: 32,
    }).tier).toBe("REDUCED");
    expect(resolveNpcCausalBudget({
      npcId: "npc-3", importance: 1, hasCriticalDependency: false, hasLocalDependency: false,
      hasRegionalDependency: false, requiredGuarantee: "NONE", simulationInterest: false,
      networkInterest: false, presentationInterest: false, lastResolutionIndex: 10,
      currentResolutionIndex: 10, sourceRevision: REVISION, maxCatchupSteps: 32,
    }).tier).toBe("STRATEGIC");
    expect(resolveNpcCausalBudget({
      npcId: "npc-4", importance: 0, hasCriticalDependency: false, hasLocalDependency: false,
      hasRegionalDependency: false, requiredGuarantee: "NONE", simulationInterest: false,
      networkInterest: false, presentationInterest: false, lastResolutionIndex: 10,
      currentResolutionIndex: 10, sourceRevision: REVISION, maxCatchupSteps: 32,
    }).tier).toBe("DORMANT");
  });

  it("is order-independent and hash-stable", () => {
    const a = resolveNpcCausalBudget({
      npcId: "npc-9", importance: 2, hasCriticalDependency: false, hasLocalDependency: true,
      hasRegionalDependency: false, requiredGuarantee: "LOCAL_SOCIAL_ECONOMY", simulationInterest: false,
      networkInterest: true, presentationInterest: false, lastResolutionIndex: 4,
      currentResolutionIndex: 12, sourceRevision: REVISION, maxCatchupSteps: 16,
    });
    const b = resolveNpcCausalBudget({
      npcId: "npc-9", importance: 2, hasCriticalDependency: false, hasLocalDependency: true,
      hasRegionalDependency: false, requiredGuarantee: "LOCAL_SOCIAL_ECONOMY", simulationInterest: false,
      networkInterest: true, presentationInterest: false, lastResolutionIndex: 4,
      currentResolutionIndex: 12, sourceRevision: REVISION, maxCatchupSteps: 16,
    });
    expect(a).toEqual(b);
    expect(a.protocol).toBe(NPC_CAUSAL_BUDGET_PROTOCOL);
  });

  it("bounds dormant catch-up and produces the same hash from reordered inputs", () => {
    const input = ["sha256:" + "c".repeat(64), "sha256:" + "a".repeat(64), "sha256:" + "b".repeat(64)];
    const a = planNpcCausalCatchup({
      npcId: "npc-10", tier: "DORMANT", stateHash, lastResolutionIndex: 5, currentResolutionIndex: 8,
      sourceRevision: REVISION, boundedCausalInputHashes: input, maxSteps: 8,
    });
    const b = planNpcCausalCatchup({
      npcId: "npc-10", tier: "DORMANT", stateHash, lastResolutionIndex: 5, currentResolutionIndex: 8,
      sourceRevision: REVISION, boundedCausalInputHashes: [...input].reverse(), maxSteps: 8,
    });
    expect(a.steps).toBe(3);
    expect(a).toEqual(b);
  });

  it("fails closed for catch-up overflow or resolution regression", () => {
    expect(() => resolveNpcCausalBudget({
      npcId: "npc-11", importance: 0, hasCriticalDependency: false, hasLocalDependency: false,
      hasRegionalDependency: false, requiredGuarantee: "NONE", simulationInterest: false,
      networkInterest: false, presentationInterest: false, lastResolutionIndex: 20,
      currentResolutionIndex: 10, sourceRevision: REVISION, maxCatchupSteps: 32,
    })).toThrow("NPC_CAUSAL_BUDGET_RESOLUTION_INDEX_REGRESSION");
    expect(() => planNpcCausalCatchup({
      npcId: "npc-12", tier: "DORMANT", stateHash, lastResolutionIndex: 0, currentResolutionIndex: 100,
      sourceRevision: REVISION, boundedCausalInputHashes: [], maxSteps: 16,
    })).toThrow("NPC_CAUSAL_BUDGET_CATCHUP_EXCEEDED");
  });
});
