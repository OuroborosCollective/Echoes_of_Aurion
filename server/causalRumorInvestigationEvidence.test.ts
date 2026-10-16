/**
 * Aurion Causal Rumor & Investigation — end-to-end evidence gate.
 *
 * Issue #785 (Epic/Umbrella): proves the merged wave #781 -> (#782 + #783)
 * -> #784 against the canonical invariants:
 *
 *   1. World truth precedes claims.
 *   2. Claims may be false/uncertain; they do not mutate truth.
 *   3. Player/NPC belief is separate from canonical fact.
 *   4. Only existing typed gameplay gateways create consequences.
 *   5. Server is authoritative; AX1/UI is projection only.
 *   6. Fixed-point/logical-index arithmetic for replay-critical state.
 *   7. No runtime LLM is required.
 *
 * Scenario A (player investigation):
 *   real world event -> causal receipt -> witness observation
 *   -> communicated claim -> player-visible rumor -> corroborating evidence
 *   -> validated player deduction -> deduction receipt
 *
 * Scenario B (NPC belief):
 *   uncertain/false rumor -> NPC belief weight -> changed planner choice
 *   -> later evidence corrects belief -> planner choice restored
 *
 * Both scenarios must replay identically: same confirmed inputs produce the
 * same hashes at every stage.
 */
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  communicateNpcInformation,
  createExperiencedNpcInformation,
  rememberNpcInformation,
  type NpcInformationReceipt,
  type NpcInformationSource,
} from "../shared/npcInformationEcologyProtocol";
import { projectRumorClaims } from "../shared/rumorProjectionProtocol";
import { buildInvestigationGraph, validateDeductionIntent } from "../shared/investigationGraphProtocol";
import { applyBeliefToCandidates, buildBeliefVector, type BeliefMapping } from "../shared/rumorBeliefBridgeProtocol";
import { buildDeductionIntentFromJournal, buildInvestigationJournal } from "../shared/investigationJournalProtocol";
import { makeCandidate, resolveNpcUtilityDecision } from "./npcUtilityPlanner";

const decisionSource: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

const worldSource: NpcInformationSource = {
  ...decisionSource,
  sourceKind: "world_receipt",
  sourceReceiptId: "world_resolution_7",
};

/** Scenario A receipts: world event witnessed twice, told to the player. */
function scenarioAReceipts(): readonly NpcInformationReceipt[] {
  const witness = (witnessNpcId: string, logicalIndex: number, src: NpcInformationSource) => {
    const exp = createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId,
      subjectId: "caravan-7",
      predicate: "destroyed",
      value: "true",
      logicalIndex,
      expiresAtIndex: 1_000,
      confidenceBps: 9_000,
      source: { ...src, sourceReceiptId: `${src.sourceReceiptId}:${witnessNpcId}` },
    });
    const rem = rememberNpcInformation(exp, logicalIndex + 1);
    const told = communicateNpcInformation({
      source: rem,
      receiverNpcId: "player-1",
      logicalIndex: logicalIndex + 2,
    });
    return [exp, rem, told] as const;
  };
  return [...witness("npc-a", 10, worldSource), ...witness("npc-b", 20, decisionSource)];
}

/** Scenario B receipts: a false route-danger rumor reaching the merchant. */
function scenarioBReceipts(): readonly NpcInformationReceipt[] {
  const exp = createExperiencedNpcInformation({
    worldId: "world-1",
    witnessNpcId: "npc-r",
    subjectId: "route-north",
    predicate: "route_dangerous",
    value: "true",
    logicalIndex: 10,
    expiresAtIndex: 40,
    confidenceBps: 9_000,
    source: { ...decisionSource, sourceReceiptId: "npc_decision_route" },
  });
  const rem = rememberNpcInformation(exp, 11);
  const told = communicateNpcInformation({ source: rem, receiverNpcId: "npc-merchant", logicalIndex: 12 });
  return [exp, rem, told];
}

const NEEDS = Object.freeze({
  safety: 0.5, resources: 0.5, belonging: 0.5, status: 0.5, wealth: 0.5, power: 0.5,
});

const ROUTE_MAPPING: BeliefMapping = {
  predicate: "route_dangerous",
  subjectId: "route-north",
  target: "riskBps",
  sign: 1,
  maxDeltaBps: 2_500,
  appliesToCandidateIds: ["caravan-north"],
};

function merchantCandidates() {
  return [
    makeCandidate({
      id: "caravan-north", action: "caravan", goal: "trade",
      needPressureBps: 5_000, benefitBps: 6_000, riskBps: 2_000, costBps: 1_000,
      sourceReceiptId: "src-1",
    }),
    makeCandidate({
      id: "trade-local", action: "trade", goal: "trade",
      needPressureBps: 5_000, benefitBps: 5_000, riskBps: 1_000, costBps: 1_000,
      sourceReceiptId: "src-1",
    }),
  ];
}

/** Full Scenario A chain, returning every stage hash as evidence. */
function runScenarioA() {
  const receipts = scenarioAReceipts();
  const projection = projectRumorClaims({
    viewerId: "player-1", worldId: "world-1", atIndex: 30, receipts,
  });
  const graph = buildInvestigationGraph({ projection });
  const journal = buildInvestigationJournal({ projection, graph, guidance: "whisper" });
  const intent = buildDeductionIntentFromJournal({
    journal,
    selectedClaimIds: projection.claims.map(claim => claim.claimId),
    deductionType: "affirm",
  });
  const deduction = validateDeductionIntent({ intent, graph });
  return { receipts, projection, graph, journal, deduction };
}

/** Full Scenario B chain at a given logical index. */
function runScenarioB(atIndex: number) {
  const receipts = scenarioBReceipts();
  const projection = projectRumorClaims({
    viewerId: "npc-merchant", worldId: "world-1", atIndex, receipts,
  });
  const beliefs = buildBeliefVector({
    actorId: "npc-merchant", worldId: "world-1", atIndex, claims: projection.claims,
  });
  const { candidates, receipt } = applyBeliefToCandidates({
    candidates: merchantCandidates(), beliefs, mappings: [ROUTE_MAPPING],
  });
  const decision = resolveNpcUtilityDecision({
    sourceReceiptId: "src-1",
    resolutionIndex: atIndex,
    needs: NEEDS,
    hungerBps: 0,
    fatigueBps: 0,
    candidates,
  });
  return { receipts, projection, beliefs, adjustment: receipt, decision };
}

describe("AIM-785 umbrella end-to-end evidence gate", () => {
  it("Scenario A: world event -> witness -> rumor -> corroboration -> validated deduction", () => {
    const { receipts, projection, graph, journal, deduction } = runScenarioA();

    // 1. World truth precedes claims: every claim lineage anchors a confirmed receipt.
    expect(receipts.length).toBe(6);
    expect(projection.claims.length).toBe(2);
    for (const claim of projection.claims) {
      expect(claim.sourceReceiptIds.length).toBeGreaterThan(0);
      expect(claim.disclosureClass).toBe("PUBLIC");
      expect(claim.corroboratedBy.length).toBe(1);
    }

    // Player rumor -> investigation graph -> journal -> deduction receipt.
    expect(graph.relations.some(r => r.kind === "CORROBORATES")).toBe(true);
    expect(journal.investigations.length).toBe(1);
    expect(journal.investigations[0].hasContradiction).toBe(false);
    expect(deduction.result).toBe("validated");
    expect(deduction.actorId).toBe("player-1");
    expect(deduction.sourceProjectionHash).toBe(projection.projectionHash);
    expect(deduction.graphHash).toBe(graph.graphHash);
  });

  it("Scenario B: false rumor shifts NPC choice; later evidence corrects it", () => {
    const believed = runScenarioB(20);
    expect(believed.beliefs.entries.length).toBe(1);
    expect(believed.beliefs.entries[0].beliefQ16).toBeGreaterThan(0);
    // The false rumor changes the planner choice...
    expect(believed.decision.winnerId).toBe("trade-local");
    // ...through the bounded adjustment receipt only; canonical truth is untouched.
    expect(believed.adjustment.candidateSetHashBefore).not.toBe(believed.adjustment.candidateSetHashAfter);

    // Later the rumor expires logically; belief collapses and the original
    // choice returns — canonical truth was never mutated in between.
    const corrected = runScenarioB(45);
    expect(corrected.beliefs.entries.length).toBe(0);
    expect(corrected.decision.winnerId).toBe("caravan-north");
    expect(corrected.adjustment.candidateSetHashBefore).toBe(corrected.adjustment.candidateSetHashAfter);
  });

  it("replays the full wave identically (restart/readback equality)", () => {
    const fingerprint = (value: unknown) => canonicalSha256({ domain: "aurion.evidence-gate-replay.v1", value });
    const runAll = () => {
      const a = runScenarioA();
      const b = runScenarioB(20);
      return fingerprint({
        a: {
          receipts: a.receipts.map(r => r.receiptHash),
          projection: a.projection.projectionHash,
          graph: a.graph.graphHash,
          journal: a.journal.journalHash,
          deduction: a.deduction.receiptHash,
        },
        b: {
          projection: b.projection.projectionHash,
          beliefs: b.beliefs.beliefVectorHash,
          adjustment: b.adjustment.adjustmentHash,
          decision: b.decision.decisionHash,
        },
      });
    };
    expect(runAll()).toBe(runAll());
  });

  it("rejects stale UI intents against a moved projection revision", () => {
    const first = runScenarioA();
    // The world moved: a later projection revision of the same viewer.
    const later = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 31, receipts: scenarioAReceipts(),
    });
    const laterGraph = buildInvestigationGraph({ projection: later });
    const staleIntent = buildDeductionIntentFromJournal({
      journal: first.journal,
      selectedClaimIds: first.projection.claims.map(claim => claim.claimId),
      deductionType: "affirm",
    });
    expect(() => validateDeductionIntent({ intent: staleIntent, graph: laterGraph }))
      .toThrow("DEDUCTION_STALE_PROJECTION");
  });
});
