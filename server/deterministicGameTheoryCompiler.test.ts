import { describe, expect, it } from "vitest";
import {
  compileNpcGameTheoryDecision,
  compileNpcGameTheoryWithCoordination,
} from "./deterministicGameTheoryCompiler";
import {
  AURION_GAME_THEORY_PROTOCOL_VERSION,
  gameTheoryModelHash,
  type DeterministicGameTheoryModel,
  type GameTheoryCompileInput,
} from "../shared/deterministicGameTheoryProtocol";
import { makeCandidate, type NpcUtilityCandidate } from "./npcUtilityPlanner";

const SOURCE_RECEIPT = "npc_receipt_591";
const SOURCE_REVISION = "95e555a1873728fc2e4fb1458e60a8ca776115d9";

const model: DeterministicGameTheoryModel = {
  modelId: "merchant-coordination-v1",
  modelVersion: 1,
  gameType: "general_sum",
  rulesetVersion: "ruleset-591-v1",
  actors: [
    { actorId: "npc_merchant", role: "npc" },
    { actorId: "npc_guard", role: "npc" },
  ],
  actions: [
    { actionId: "trade", goal: "trade" },
    { actionId: "produce", goal: "gather_resources" },
    { actionId: "patrol", goal: "seek_safety" },
    { actionId: "socialize", goal: "socialize" },
  ],
  payoffs: [
    { actorId: "npc_merchant", actionId: "trade", payoffBps: 4200 },
    { actorId: "npc_merchant", actionId: "produce", payoffBps: 1000 },
    { actorId: "npc_merchant", actionId: "patrol", payoffBps: -1200 },
    { actorId: "npc_merchant", actionId: "socialize", payoffBps: 500 },
    { actorId: "npc_guard", actionId: "patrol", payoffBps: 4500 },
    { actorId: "npc_guard", actionId: "trade", payoffBps: -500 },
  ],
};

const baseCandidates: readonly NpcUtilityCandidate[] = [
  makeCandidate({
    id: "produce-1",
    action: "produce",
    goal: "gather_resources",
    needPressureBps: 6200,
    benefitBps: 3500,
    riskBps: 700,
    costBps: 400,
    sourceReceiptId: SOURCE_RECEIPT,
  }),
  makeCandidate({
    id: "trade-1",
    action: "trade",
    goal: "trade",
    needPressureBps: 6000,
    benefitBps: 3900,
    riskBps: 800,
    costBps: 450,
    sourceReceiptId: SOURCE_RECEIPT,
  }),
  makeCandidate({
    id: "patrol-1",
    action: "patrol",
    goal: "seek_safety",
    needPressureBps: 5000,
    benefitBps: 3500,
    riskBps: 400,
    costBps: 350,
    sourceReceiptId: SOURCE_RECEIPT,
  }),
];

const input = (candidates: readonly NpcUtilityCandidate[] = baseCandidates): GameTheoryCompileInput => ({
  actorId: "npc_merchant",
  sourceReceiptId: SOURCE_RECEIPT,
  sourceRevision: SOURCE_REVISION,
  resolutionIndex: 1842,
  observationHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  seed: "merchant-seed-591",
  model,
  plannerContext: {
    needs: {
      safety: 0.82,
      resources: 0.41,
      belonging: 0.55,
      status: 0.35,
      wealth: 0.62,
      power: 0.21,
    },
    hungerBps: 2400,
    fatigueBps: 1800,
  },
  candidates,
});

describe("deterministic game-theory compiler — #591", () => {
  it("emits a versioned policy output with canonical source binding", () => {
    const result = compileNpcGameTheoryDecision(input());
    expect(result.protocol).toBe(AURION_GAME_THEORY_PROTOCOL_VERSION);
    expect(result.sourceReceiptId).toBe(SOURCE_RECEIPT);
    expect(result.sourceRevision).toBe(SOURCE_REVISION);
    expect(result.resolutionIndex).toBe(1842);
    expect(result.modelHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.observationHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.seedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.policyOutputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is invariant to candidate input order", () => {
    const forward = compileNpcGameTheoryDecision(input(baseCandidates));
    const reversed = compileNpcGameTheoryDecision(input([...baseCandidates].reverse()));
    const shuffled = compileNpcGameTheoryDecision(input([baseCandidates[1]!, baseCandidates[2]!, baseCandidates[0]!]));

    expect(reversed.modelHash).toBe(forward.modelHash);
    expect(reversed.observationHash).toBe(forward.observationHash);
    expect(reversed.candidateSetHash).toBe(forward.candidateSetHash);
    expect(reversed.chosenCandidateId).toBe(forward.chosenCandidateId);
    expect(reversed.chosenAction).toBe(forward.chosenAction);
    expect(reversed.policyOutputHash).toBe(forward.policyOutputHash);
    expect(shuffled.policyOutputHash).toBe(forward.policyOutputHash);
  });

  it("lets the strategic payoff change the existing utility winner without replacing the planner", () => {
    const noTheory: GameTheoryCompileInput = {
      ...input(),
      model: {
        ...model,
        payoffs: model.payoffs.map(payoff => ({ ...payoff, payoffBps: 0 })),
      },
    };
    const baseline = compileNpcGameTheoryDecision(noTheory);
    const strategic = compileNpcGameTheoryDecision(input());

    expect(baseline.chosenAction).not.toBeNull();
    expect(strategic.chosenAction).toBe("trade");
    expect(strategic.chosenCandidateId).toBe("trade-1");
  });

  it("reuses the existing coordination-law layer", () => {
    const result = compileNpcGameTheoryWithCoordination(input());
    expect(result.decision.modelHash).toBe(gameTheoryModelHash(model));
    expect(result.decision.chosenAction).toBe("trade");
    expect(result.coordinated.lawHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.coordinated.decision.decisionHash).toBe(result.decision.utilityDecisionHash);
    expect(result.coordinated.coordination.filteredSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails closed on candidate source drift", () => {
    const stale = makeCandidate({
      ...baseCandidates[0]!,
      sourceReceiptId: "npc_receipt_other",
    });
    expect(() => compileNpcGameTheoryDecision(input([stale, ...baseCandidates.slice(1)])))
      .toThrow("AURION_GAME_THEORY_CANDIDATE_SOURCE_MISMATCH");
  });

  it("fails closed when a candidate action is absent from the model", () => {
    const invalid = makeCandidate({
      ...baseCandidates[0]!,
      action: "caravan",
      goal: "expand_influence",
    });
    expect(() => compileNpcGameTheoryDecision(input([invalid, ...baseCandidates.slice(1)])))
      .toThrow("AURION_GAME_THEORY_CANDIDATE_ACTION_NOT_IN_MODEL");
  });

  it("binds revision changes to observation and policy evidence", () => {
    const first = compileNpcGameTheoryDecision(input());
    const second = compileNpcGameTheoryDecision({
      ...input(),
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(second.observationHash).not.toBe(first.observationHash);
    expect(second.policyOutputHash).not.toBe(first.policyOutputHash);
  });
});
