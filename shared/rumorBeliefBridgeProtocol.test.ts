import { describe, expect, it } from "vitest";
import {
  createExperiencedNpcInformation,
  rememberNpcInformation,
  type NpcInformationSource,
} from "./npcInformationEcologyProtocol";
import { projectRumorClaims, rumorClaimProjectionSchema } from "./rumorProjectionProtocol";
import {
  BELIEF_MAX_DELTA_BPS,
  beliefMappingSchema,
  beliefWeightQ16,
  buildBeliefVector,
  corroborationFactorQ16,
  q16Mul,
  applyBeliefToCandidates,
} from "./rumorBeliefBridgeProtocol";
import type { RumorClaimProjection } from "./rumorProjectionProtocol";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function claimFixture(overrides: Partial<RumorClaimProjection> = {}): RumorClaimProjection {
  return rumorClaimProjectionSchema.parse({
    claimId: "rum_" + "1".repeat(59),
    factId: "neif_" + "2".repeat(59),
    claimKey: "sha256:" + "3".repeat(64),
    subjectId: "route-north",
    predicate: "route_dangerous",
    value: "true",
    status: "communicated",
    sourceKind: "npc_decision_receipt",
    evidenceClass: "DIRECT",
    confidenceQ16: 58_982,
    freshnessQ16: 65_536,
    sourceReceiptIds: ["nei_" + "4".repeat(60)],
    witnessIds: ["npc-witness"],
    transmissionReceiptIds: [],
    contradictedBy: [],
    corroboratedBy: [],
    disclosureClass: "LOCAL",
    visibility: "visible",
    projectionIndex: 12,
    expiresAtIndex: null,
    ...overrides,
  });
}

describe("AIM-783 deterministic rumor-to-behavior bridge", () => {
  it("computes belief weights with bounded integer Q16 arithmetic", () => {
    expect(q16Mul(65_536, 65_536)).toBe(65_536);
    expect(q16Mul(65_536, 32_768)).toBe(32_768);
    expect(q16Mul(32_768, 32_768)).toBe(16_384);
    expect(() => q16Mul(65_537, 1)).toThrow("BELIEF_Q16_OPERAND_INVALID");

    // DIRECT + full trust + full freshness still carries the neutral 0.5 relation prior.
    expect(beliefWeightQ16({ claim: claimFixture(), sourceTrustBps: 10_000 })).toBe(32_768);
    // COMMUNICATED evidence discounts deterministically on top of the same prior.
    expect(beliefWeightQ16({
      claim: claimFixture({ evidenceClass: "COMMUNICATED" }),
      sourceTrustBps: 10_000,
    })).toBe(24_576);
  });

  it("discounts belief through the versioned corroboration factor", () => {
    expect(corroborationFactorQ16(0, 0)).toBe(32_768);
    expect(corroborationFactorQ16(4, 0)).toBe(65_536);
    expect(corroborationFactorQ16(0, 2)).toBe(8_192);
    const contradicted = claimFixture({ contradictedBy: ["rum_a", "rum_b"] });
    const neutral = beliefWeightQ16({ claim: claimFixture(), sourceTrustBps: 10_000 });
    const challenged = beliefWeightQ16({ claim: contradicted, sourceTrustBps: 10_000 });
    expect(challenged).toBeLessThan(neutral);
    expect(challenged).toBe(q16Mul(q16Mul(65_536, 65_536), 8_192));
  });

  it("produces the same belief vector for the same claim set in shuffled order", () => {
    const a = claimFixture();
    const b = claimFixture({
      claimId: "rum_" + "5".repeat(59),
      factId: "neif_" + "6".repeat(59),
      predicate: "supply_short",
      value: "true",
    });
    const first = buildBeliefVector({ actorId: "npc-m", worldId: "world-1", atIndex: 20, claims: [a, b] });
    const second = buildBeliefVector({ actorId: "npc-m", worldId: "world-1", atIndex: 20, claims: [b, a] });
    expect(second.beliefVectorHash).toBe(first.beliefVectorHash);
    expect(second.entries).toEqual(first.entries);
  });

  it("uses the maximum explicit witness trust and the default otherwise", () => {
    const claim = claimFixture({ witnessIds: ["npc-a", "npc-b"] });
    const vector = buildBeliefVector({
      actorId: "npc-m",
      worldId: "world-1",
      atIndex: 20,
      claims: [claim],
      sourceTrustBpsByWitness: { "npc-a": 2_000, "npc-b": 9_000 },
    });
    expect(vector.entries[0].beliefQ16).toBe(beliefWeightQ16({ claim, sourceTrustBps: 9_000 }));
    const partial = buildBeliefVector({
      actorId: "npc-m",
      worldId: "world-1",
      atIndex: 20,
      claims: [claimFixture({ witnessIds: [], visibility: "partial" })],
    });
    expect(partial.entries[0].beliefQ16).toBe(
      beliefWeightQ16({ claim: claimFixture({ witnessIds: [], visibility: "partial" }), sourceTrustBps: 5_000 }),
    );
  });

  it("bounds every mapping to BELIEF_MAX_DELTA_BPS", () => {
    expect(() => beliefMappingSchema.parse({
      predicate: "route_dangerous",
      subjectId: null,
      target: "riskBps",
      sign: 1,
      maxDeltaBps: BELIEF_MAX_DELTA_BPS + 1,
      appliesToCandidateIds: null,
    })).toThrow();
  });

  it("applies each mapping once per candidate even with multiple matching claims", () => {
    const strong = claimFixture();
    const weak = claimFixture({
      claimId: "rum_" + "5".repeat(59),
      factId: "neif_" + "6".repeat(59),
      evidenceClass: "INFERRED",
    });
    const beliefs = buildBeliefVector({
      actorId: "npc-m",
      worldId: "world-1",
      atIndex: 20,
      claims: [strong, weak],
      sourceTrustBpsByWitness: { "npc-witness": 10_000 },
    });
    const candidate = {
      id: "caravan-north",
      action: "caravan" as const,
      goal: "trade" as const,
      needPressureBps: 5_000,
      benefitBps: 6_000,
      riskBps: 2_000,
      costBps: 1_000,
      sourceReceiptId: "src-1",
      constraintStatus: "eligible" as const,
      constraintCode: null,
    };
    const mapping = {
      predicate: "route_dangerous",
      subjectId: "route-north",
      target: "riskBps" as const,
      sign: 1 as const,
      maxDeltaBps: 2_500,
      appliesToCandidateIds: ["caravan-north"],
    };
    const { candidates, receipt } = applyBeliefToCandidates({
      candidates: [candidate],
      beliefs,
      mappings: [mapping],
    });
    // Neutral relation prior keeps the strongest DIRECT/full-trust belief at 0.5,
    // so the bounded mapping applies half of maxDeltaBps exactly once.
    expect(candidates[0].riskBps).toBe(2_000 + 1_250);
    expect(receipt.candidateSetHashBefore).not.toBe(receipt.candidateSetHashAfter);
    // Input candidate object is never mutated.
    expect(candidate.riskBps).toBe(2_000);
  });

  it("derives belief from confirmed projection claims, not from raw memory", () => {
    const exp = createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId: "npc-merchant",
      subjectId: "route-north",
      predicate: "route_dangerous",
      value: "true",
      logicalIndex: 10,
      expiresAtIndex: 40,
      confidenceBps: 9_000,
      source: { ...source, sourceReceiptId: "npc_decision_route" },
    });
    const rem = rememberNpcInformation(exp, 11);
    const projection = projectRumorClaims({
      viewerId: "npc-merchant",
      worldId: "world-1",
      atIndex: 20,
      receipts: [exp, rem],
    });
    const vector = buildBeliefVector({
      actorId: "npc-merchant",
      worldId: "world-1",
      atIndex: 20,
      claims: projection.claims,
      sourceTrustBpsByWitness: { "npc-merchant": 8_000 },
    });
    expect(vector.entries.length).toBe(1);
    // The latest confirmed receipt is the remembered receipt at index 11, so
    // freshnessQ16 at 20 of [11, 40) is floor(65536 * 20 / 29) = 45197.
    const expected = q16Mul(q16Mul(q16Mul(65_536, 52_428), 45_197), 32_768);
    expect(vector.entries[0].beliefQ16).toBe(expected);
    // Logical expiry removes the influence entirely.
    const expired = projectRumorClaims({
      viewerId: "npc-merchant",
      worldId: "world-1",
      atIndex: 45,
      receipts: [exp, rem],
    });
    expect(expired.claims.length).toBe(0);
  });

  it("never lets a claim touch canonical fields: only planner BPS factors change", () => {
    const beliefs = buildBeliefVector({
      actorId: "npc-m",
      worldId: "world-1",
      atIndex: 20,
      claims: [claimFixture()],
      sourceTrustBpsByWitness: { "npc-witness": 10_000 },
    });
    const candidate = {
      id: "patrol-1",
      action: "patrol" as const,
      goal: "seek_safety" as const,
      needPressureBps: 5_000,
      benefitBps: 5_000,
      riskBps: 1_000,
      costBps: 1_000,
      sourceReceiptId: "src-1",
      constraintStatus: "eligible" as const,
      constraintCode: null,
    };
    const { candidates } = applyBeliefToCandidates({
      candidates: [candidate],
      beliefs,
      mappings: [{
        predicate: "route_dangerous",
        subjectId: null,
        target: "riskBps",
        sign: 1,
        maxDeltaBps: 2_500,
        appliesToCandidateIds: null,
      }],
    });
    const adjusted = candidates[0];
    expect(adjusted.id).toBe(candidate.id);
    expect(adjusted.action).toBe(candidate.action);
    expect(adjusted.goal).toBe(candidate.goal);
    expect(adjusted.sourceReceiptId).toBe(candidate.sourceReceiptId);
    expect(adjusted.constraintStatus).toBe("eligible");
    expect(adjusted.riskBps).toBeGreaterThan(candidate.riskBps);
  });
});
