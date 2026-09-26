import { describe, expect, it } from "vitest";
import {
  NPC_COORDINATION_LAW_VERSION,
  coordinationCandidateSetHash,
  coordinationLawHash,
  coordinationReservationsHash,
  filterCoordinationCandidates,
  coordinationUtilityFloorCertificate,
  type CoordinationCandidate,
  type CoordinationLaw,
  type CoordinationReservation,
} from "../shared/npcCoordinationLawProtocol";

const law: CoordinationLaw = {
  lawId: "aurion-research-market-v1",
  lawVersion: 1,
  scope: "region",
  allowedActionPairs: [],
  disallowedActionPairs: [["trade", "trade"]],
  tieBreakVersion: 1,
};

function candidate(overrides: Partial<CoordinationCandidate> & Pick<CoordinationCandidate, "actorId" | "candidateId" | "action">): CoordinationCandidate {
  return {
    actorId: overrides.actorId,
    candidateId: overrides.candidateId,
    action: overrides.action,
    scopeKey: overrides.scopeKey ?? "region:emberfall",
    sourceReceiptId: overrides.sourceReceiptId ?? "receipt:42",
    resolutionIndex: overrides.resolutionIndex ?? 42,
    utilityScoreBps: overrides.utilityScoreBps ?? 8_000,
  };
}

function reservation(overrides: Partial<CoordinationReservation> & Pick<CoordinationReservation, "actorId" | "action">): CoordinationReservation {
  return {
    actorId: overrides.actorId,
    action: overrides.action,
    scopeKey: overrides.scopeKey ?? "region:emberfall",
    sourceReceiptId: overrides.sourceReceiptId ?? "receipt:42",
    resolutionIndex: overrides.resolutionIndex ?? 42,
    ...(overrides.candidateId ? { candidateId: overrides.candidateId } : {}),
    ...(overrides.utilityScoreBps !== undefined ? { utilityScoreBps: overrides.utilityScoreBps } : {}),
  };
}

describe("NPC coordination law protocol — determinism", () => {
  it("uses the versioned law contract and stable hashes", () => {
    expect(NPC_COORDINATION_LAW_VERSION).toBe("aurion-npc-coordination-law.v1");
    expect(coordinationLawHash(law)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(coordinationReservationsHash([])).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is invariant to candidate order", () => {
    const values = [
      candidate({ actorId: "npc:b", candidateId: "trade", action: "trade", utilityScoreBps: 8_500 }),
      candidate({ actorId: "npc:a", candidateId: "patrol", action: "patrol", utilityScoreBps: 9_000 }),
      candidate({ actorId: "npc:a", candidateId: "trade", action: "trade", utilityScoreBps: 7_500 }),
    ];
    const reversed = [...values].reverse();
    const first = filterCoordinationCandidates(values, law);
    const second = filterCoordinationCandidates(reversed, law);
    expect(second).toEqual(first);
    expect(coordinationCandidateSetHash(reversed)).toBe(coordinationCandidateSetHash(values));
  });

  it("blocks only the candidate conflicting with an existing reservation", () => {
    const values = [
      candidate({ actorId: "npc:a", candidateId: "trade", action: "trade", utilityScoreBps: 9_000 }),
      candidate({ actorId: "npc:b", candidateId: "trade", action: "trade", utilityScoreBps: 8_000 }),
      candidate({ actorId: "npc:b", candidateId: "patrol", action: "patrol", utilityScoreBps: 7_000 }),
    ];
    const result = filterCoordinationCandidates(values, law, [
      reservation({ actorId: "npc:a", action: "trade", candidateId: "trade", utilityScoreBps: 9_000 }),
    ]);
    expect(result.status).toBe("filtered");
    expect(result.blocked.map(item => item.actorId + ":" + item.candidateId)).toEqual(["npc:b:trade"]);
    expect(result.accepted.map(item => item.actorId + ":" + item.candidateId)).toEqual([
      "npc:a:trade",
      "npc:b:patrol",
    ]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].pair).toEqual(["trade", "trade"]);
  });

  it("never applies a pair rule across different scopes or the same actor", () => {
    const values = [
      candidate({ actorId: "npc:b", candidateId: "trade", action: "trade", scopeKey: "region:cinder", utilityScoreBps: 8_000 }),
      candidate({ actorId: "npc:a", candidateId: "trade", action: "trade", utilityScoreBps: 8_000 }),
    ];
    const result = filterCoordinationCandidates(values, law, [
      reservation({ actorId: "npc:a", action: "trade", scopeKey: "region:emberfall" }),
      reservation({ actorId: "npc:b", action: "trade", scopeKey: "region:emberfall" }),
    ]);
    expect(result.status).toBe("unchanged");
    expect(result.blocked).toHaveLength(0);
  });

  it("reports coordination_blocked instead of inventing a fallback", () => {
    const values = [
      candidate({ actorId: "npc:b", candidateId: "trade", action: "trade", utilityScoreBps: 8_000 }),
    ];
    const result = filterCoordinationCandidates(values, law, [
      reservation({ actorId: "npc:a", action: "trade" }),
    ]);
    expect(result.status).toBe("coordination_blocked");
    expect(result.accepted).toHaveLength(0);
    expect(result.blocked).toHaveLength(1);
  });

  it("same reservation produces the same blocked evidence on retry", () => {
    const values = [
      candidate({ actorId: "npc:b", candidateId: "trade", action: "trade", utilityScoreBps: 8_000 }),
    ];
    const reservations = [reservation({ actorId: "npc:a", action: "trade" })];
    const first = filterCoordinationCandidates(values, law, reservations);
    const retry = filterCoordinationCandidates(values, law, reservations);
    expect(retry).toEqual(first);
    expect(retry.filteredSetHash).toBe(first.filteredSetHash);
    expect(retry.reservationsHash).toBe(first.reservationsHash);
  });

  it("supports an explicit allowlist and rejects contradictory law definitions", () => {
    const allowOnlyTrade: CoordinationLaw = {
      ...law,
      lawId: "allow-trade-v1",
      allowedActionPairs: [["trade", "patrol"]],
      disallowedActionPairs: [],
    };
    expect(filterCoordinationCandidates(
      [candidate({ actorId: "npc:a", candidateId: "trade", action: "trade" })],
      allowOnlyTrade,
    ).status).toBe("unchanged");

    const contradictory: CoordinationLaw = {
      ...law,
      allowedActionPairs: [["trade", "patrol"]],
      disallowedActionPairs: [["trade", "patrol"]],
    };
    expect(() => coordinationLawHash(contradictory)).toThrow("NPC_COORDINATION_LAW_PAIR_CONFLICT");
  });

  it("computes an integer alpha utility-floor certificate without floating point", () => {
    const unconstrained = [
      candidate({ actorId: "npc:a", candidateId: "trade", action: "trade", utilityScoreBps: 10_000 }),
      candidate({ actorId: "npc:a", candidateId: "patrol", action: "patrol", utilityScoreBps: 6_000 }),
      candidate({ actorId: "npc:b", candidateId: "trade", action: "trade", utilityScoreBps: 9_000 }),
    ];
    const constrained = [
      unconstrained[0],
      candidate({ actorId: "npc:a", candidateId: "patrol", action: "patrol", utilityScoreBps: 6_000 }),
      candidate({ actorId: "npc:b", candidateId: "patrol", action: "patrol", utilityScoreBps: 8_500 }),
    ];
    expect(coordinationUtilityFloorCertificate(unconstrained, constrained, 8_000)).toEqual({
      alphaBps: 8_000,
      passed: true,
      violations: [],
    });

    const broken = coordinationUtilityFloorCertificate(unconstrained, [constrained[1]], 8_000);
    expect(broken.passed).toBe(false);
    expect(broken.violations[0]).toMatchObject({ actorId: "npc:b", unconstrainedBestBps: 9_000, constrainedBestBps: null });
  });
});
