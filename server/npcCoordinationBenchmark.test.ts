import { describe, expect, it } from "vitest";
import {
  filterCoordinationCandidates,
  coordinationUtilityFloorCertificate,
  type CoordinationCandidate,
  type CoordinationLaw,
  type CoordinationReservation,
} from "../shared/npcCoordinationLawProtocol";
import {
  resolveNpcUtilityWithCoordination,
  coordinationReadbackMetadata,
} from "./npcCoordinationLaw";
import { makeCandidate, type NpcUtilityPlannerContext } from "./npcUtilityPlanner";

const law: CoordinationLaw = {
  lawId: "aurion-npc-coordination-benchmark.v1",
  lawVersion: 1,
  scope: "region",
  allowedActionPairs: [],
  disallowedActionPairs: [["trade", "trade"]],
  tieBreakVersion: 1,
};

function utilityContext(sourceReceiptId: string): NpcUtilityPlannerContext {
  return {
    sourceReceiptId,
    resolutionIndex: 12,
    needs: { safety: 0.8, resources: 0.4, belonging: 0.5, status: 0.4, wealth: 0.3, power: 0.3 },
    hungerBps: 2_000,
    fatigueBps: 1_500,
    candidates: [
      makeCandidate({
        id: "trade",
        action: "trade",
        goal: "trade",
        needPressureBps: 8_000,
        benefitBps: 8_000,
        riskBps: 1_000,
        costBps: 1_000,
        sourceReceiptId,
      }),
      makeCandidate({
        id: "patrol",
        action: "patrol",
        goal: "seek_safety",
        needPressureBps: 5_000,
        benefitBps: 5_000,
        riskBps: 500,
        costBps: 500,
        sourceReceiptId,
      }),
    ],
    currentGoal: "trade",
    goalPersistenceBonusBps: 1_000,
  };
}

function coordinationCandidate(actorId: string, candidateId: string, action: CoordinationCandidate["action"], scopeKey = "region:emberfall", score = 8_000): CoordinationCandidate {
  return {
    actorId,
    candidateId,
    action,
    scopeKey,
    sourceReceiptId: `receipt:${actorId}`,
    resolutionIndex: 12,
    utilityScoreBps: score,
  };
}

function reservation(actorId: string, action: CoordinationReservation["action"], scopeKey = "region:emberfall"): CoordinationReservation {
  return {
    actorId,
    action,
    scopeKey,
    sourceReceiptId: `receipt:${actorId}`,
    resolutionIndex: 12,
  };
}

describe("NPC coordination law — deterministic benchmarks", () => {
  it("shared-resource contention blocks the second conflicting action without changing the law itself", () => {
    const candidates = [
      coordinationCandidate("npc-a", "trade", "trade", "market:emberfall", 10_000),
      coordinationCandidate("npc-b", "trade", "trade", "market:emberfall", 9_000),
      coordinationCandidate("npc-b", "patrol", "patrol", "market:emberfall", 7_000),
    ];
    const result = filterCoordinationCandidates(candidates, { ...law, lawId: "shared-resource-v1" }, [
      reservation("npc-a", "trade", "market:emberfall"),
    ]);
    expect(result.blocked.map(item => item.candidateId)).toEqual(["trade"]);
    expect(result.accepted.map(item => item.candidateId).sort()).toEqual(["patrol", "trade"].sort());
    expect(result.conflicts[0].candidate.actorId).toBe("npc-b");
  });

  it("route interference blocks a competing caravan on the same declared route scope", () => {
    const routeLaw: CoordinationLaw = {
      ...law,
      lawId: "route-interference-v1",
      scope: "region",
      disallowedActionPairs: [["caravan", "caravan"], ["trade", "trade"]],
    };
    const candidates = [
      coordinationCandidate("npc-a", "caravan", "caravan", "route:emberfall:cinder", 9_500),
      coordinationCandidate("npc-b", "caravan", "caravan", "route:emberfall:cinder", 8_500),
      coordinationCandidate("npc-b", "patrol", "patrol", "route:emberfall:cinder", 7_500),
    ];
    const result = filterCoordinationCandidates(candidates, routeLaw, [
      reservation("npc-a", "caravan", "route:emberfall:cinder"),
    ]);
    expect(result.status).toBe("filtered");
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]).toMatchObject({ actorId: "npc-b", action: "caravan" });
  });

  it("keeps the existing planner responsible for winner selection after coordination filtering", () => {
    const entry = {
      actorId: "npc-b",
      scopeKey: "region:emberfall",
      context: utilityContext("receipt:npc-b"),
    };
    const result = resolveNpcUtilityWithCoordination(
      entry,
      law,
      [reservation("npc-a", "trade")],
    );
    expect(result.coordination.status).toBe("filtered");
    expect(result.decision.winnerId).toBe("patrol");
    expect(result.decision.winnerAction).toBe("patrol");
    expect(result.decision.candidateCount).toBe(2);
    expect(result.decision.blockedCount).toBe(1);
    expect(result.scored.find(c => c.id === "trade")?.constraintCode).toBe("COORDINATION_BLOCKED");
  });

  it("replaying the same coordinated context is byte/hash stable", () => {
    const entry = {
      actorId: "npc-b",
      scopeKey: "region:emberfall",
      context: utilityContext("receipt:npc-b"),
    };
    const reservations = [reservation("npc-a", "trade")];
    const first = resolveNpcUtilityWithCoordination(entry, law, reservations);
    const second = resolveNpcUtilityWithCoordination(entry, law, reservations);
    expect(second).toEqual(first);
    expect(coordinationReadbackMetadata(second)).toEqual(coordinationReadbackMetadata(first));
  });

  it("passes the alpha utility floor when coordination leaves an admissible alternative", () => {
    const unconstrained = [
      coordinationCandidate("npc-a", "trade", "trade", "market:emberfall", 10_000),
      coordinationCandidate("npc-a", "patrol", "patrol", "market:emberfall", 8_500),
    ];
    const constrained = [
      coordinationCandidate("npc-a", "patrol", "patrol", "market:emberfall", 8_500),
    ];
    const certificate = coordinationUtilityFloorCertificate(unconstrained, constrained, 8_000);
    expect(certificate.passed).toBe(true);
  });
});
