import { describe, expect, it } from "vitest";
import {
  createExperiencedNpcInformation,
  rememberNpcInformation,
  type NpcInformationSource,
} from "../shared/npcInformationEcologyProtocol";
import { projectRumorClaims } from "../shared/rumorProjectionProtocol";
import {
  applyBeliefToCandidates,
  buildBeliefVector,
  type BeliefMapping,
} from "../shared/rumorBeliefBridgeProtocol";
import {
  makeCandidate,
  resolveNpcUtilityDecision,
  type NpcUtilityCandidate,
} from "./npcUtilityPlanner";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_route",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

const NEEDS = Object.freeze({
  safety: 0.5,
  resources: 0.5,
  belonging: 0.5,
  status: 0.5,
  wealth: 0.5,
  power: 0.5,
});

function merchantCandidates(): readonly NpcUtilityCandidate[] {
  return [
    makeCandidate({
      id: "caravan-north",
      action: "caravan",
      goal: "trade",
      needPressureBps: 5_000,
      benefitBps: 6_000,
      riskBps: 2_000,
      costBps: 1_000,
      sourceReceiptId: "src-1",
    }),
    makeCandidate({
      id: "trade-local",
      action: "trade",
      goal: "trade",
      needPressureBps: 5_000,
      benefitBps: 5_000,
      riskBps: 1_000,
      costBps: 1_000,
      sourceReceiptId: "src-1",
    }),
  ];
}

const ROUTE_MAPPING: BeliefMapping = {
  predicate: "route_dangerous",
  subjectId: "route-north",
  target: "riskBps",
  sign: 1,
  maxDeltaBps: 2_500,
  appliesToCandidateIds: ["caravan-north"],
};

function decide(candidates: readonly NpcUtilityCandidate[]) {
  return resolveNpcUtilityDecision({
    sourceReceiptId: "src-1",
    resolutionIndex: 1,
    needs: NEEDS,
    hungerBps: 0,
    fatigueBps: 0,
    candidates,
  });
}

function rumorReceipts() {
  const exp = createExperiencedNpcInformation({
    worldId: "world-1",
    witnessNpcId: "npc-merchant",
    subjectId: "route-north",
    predicate: "route_dangerous",
    value: "true",
    logicalIndex: 10,
    expiresAtIndex: 40,
    confidenceBps: 9_000,
    source,
  });
  const rem = rememberNpcInformation(exp, 11);
  return [exp, rem] as const;
}

function merchantBeliefs(atIndex: number) {
  const projection = projectRumorClaims({
    viewerId: "npc-merchant",
    worldId: "world-1",
    atIndex,
    receipts: rumorReceipts(),
  });
  return buildBeliefVector({
    actorId: "npc-merchant",
    worldId: "world-1",
    atIndex,
    claims: projection.claims,
    sourceTrustBpsByWitness: { "npc-merchant": 8_000 },
  });
}

describe("AIM-783 rumor-to-behavior bridge through the existing utility planner", () => {
  it("without any rumor the merchant takes the northern caravan route", () => {
    const decision = decide(merchantCandidates());
    expect(decision.winnerId).toBe("caravan-north");
    expect(decision.winnerAction).toBe("caravan");
  });

  it("a believed false rumor changes the planner choice, not the world", () => {
    const beliefs = merchantBeliefs(20);
    expect(beliefs.entries.length).toBe(1);
    expect(beliefs.entries[0].beliefQ16).toBeGreaterThan(0);

    const { candidates, receipt } = applyBeliefToCandidates({
      candidates: merchantCandidates(),
      beliefs,
      mappings: [ROUTE_MAPPING],
    });
    const caravan = candidates.find(c => c.id === "caravan-north")!;
    expect(caravan.riskBps).toBeGreaterThan(2_000);
    // Canonical identity fields are untouched by belief.
    expect(caravan.action).toBe("caravan");
    expect(caravan.goal).toBe("trade");
    expect(caravan.sourceReceiptId).toBe("src-1");

    const decision = decide(candidates);
    expect(decision.winnerId).toBe("trade-local");
    expect(decision.winnerAction).toBe("trade");
    expect(receipt.candidateSetHashBefore).not.toBe(receipt.candidateSetHashAfter);
    expect(receipt.adjustmentHash).toMatch(/^sha256:/);
  });

  it("confirmed later evidence (logical expiry) overturns the belief-driven choice", () => {
    const beliefs = merchantBeliefs(45);
    expect(beliefs.entries.length).toBe(0);
    const { candidates, receipt } = applyBeliefToCandidates({
      candidates: merchantCandidates(),
      beliefs,
      mappings: [ROUTE_MAPPING],
    });
    const decision = decide(candidates);
    expect(decision.winnerId).toBe("caravan-north");
    expect(receipt.candidateSetHashBefore).toBe(receipt.candidateSetHashAfter);
  });

  it("is replay-identical: same confirmed inputs yield the same decision hash", () => {
    const run = () => {
      const { candidates } = applyBeliefToCandidates({
        candidates: merchantCandidates(),
        beliefs: merchantBeliefs(20),
        mappings: [ROUTE_MAPPING],
      });
      return decide(candidates);
    };
    const first = run();
    const second = run();
    expect(second.decisionHash).toBe(first.decisionHash);
    expect(second.winnerId).toBe(first.winnerId);
  });

  it("keeps belief adjustments inside the planner constraint pipeline", () => {
    // A hunger interrupt still blocks every non-consume candidate, even when
    // belief would otherwise favor a risky caravan.
    const beliefs = merchantBeliefs(20);
    const { candidates } = applyBeliefToCandidates({
      candidates: merchantCandidates(),
      beliefs,
      mappings: [ROUTE_MAPPING],
    });
    const decision = resolveNpcUtilityDecision({
      sourceReceiptId: "src-1",
      resolutionIndex: 1,
      needs: NEEDS,
      hungerBps: 8_000,
      fatigueBps: 0,
      candidates: [...candidates, makeCandidate({
        id: "consume-1",
        action: "consume",
        goal: "gather_resources",
        needPressureBps: 9_000,
        benefitBps: 4_000,
        riskBps: 0,
        costBps: 500,
        sourceReceiptId: "src-1",
      })],
    });
    expect(decision.winnerId).toBe("consume-1");
    expect(decision.blockedCount).toBe(2);
  });
});
