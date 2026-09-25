import { describe, expect, it } from "vitest";
import {
  assessNpcInformationTrust,
  communicateNpcInformation,
  createExperiencedNpcInformation,
  expireNpcInformation,
  isVerifiedConsumableNpcInformation,
  rememberNpcInformation,
  reconcileNpcInformationReports,
  summarizeNpcInformationProvenance,
  transitionNpcInformation,
} from "./npcInformationEcologyProtocol";

const source = {
  evidenceClass: "verified" as const,
  sourceKind: "npc_decision_receipt" as const,
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function experienced(value: string, witnessNpcId = "npc-a", logicalIndex = 10) {
  return createExperiencedNpcInformation({
    worldId: "world-1",
    witnessNpcId,
    subjectId: "caravan-7",
    predicate: "destroyed",
    value,
    logicalIndex,
    expiresAtIndex: 100,
    source: { ...source, sourceReceiptId: `${source.sourceReceiptId}:${witnessNpcId}` },
    confidenceBps: 9000,
  });
}

describe("AIM-487 deterministic NPC information ecology", () => {
  it("derives the same fact identity for identical verified evidence", () => {
    expect(experienced("true")).toEqual(experienced("true"));
  });

  it("requires the remembered stage before communication", () => {
    expect(() => communicateNpcInformation({
      source: experienced("true"),
      receiverNpcId: "npc-b",
      logicalIndex: 11,
    })).toThrow("MUST_BE_REMEMBERED");
  });

  it("creates deterministic communication identity and preserves origin evidence", () => {
    const remembered = rememberNpcInformation(experienced("true"), 11);
    const a = communicateNpcInformation({ source: remembered, receiverNpcId: "npc-b", logicalIndex: 12 });
    const b = communicateNpcInformation({ source: remembered, receiverNpcId: "npc-b", logicalIndex: 12 });
    expect(a).toEqual(b);
    expect(a.previousReceiptId).toBe(remembered.id);
    expect(a.sourceReceiptId).toBe(`${source.sourceReceiptId}:npc-a`);
    expect(a.ownerNpcId).toBe("npc-b");
    expect(a.communicatedByNpcId).toBe("npc-a");
    expect(a.communicationReceiptId).toBeTruthy();
  });

  it("preserves contradictory reports rather than collapsing them", () => {
    const left = communicateNpcInformation({ source: rememberNpcInformation(experienced("true", "npc-a"), 11), receiverNpcId: "npc-c", logicalIndex: 12 });
    const right = communicateNpcInformation({ source: rememberNpcInformation(experienced("false", "npc-b"), 11), receiverNpcId: "npc-c", logicalIndex: 13 });
    const result = reconcileNpcInformationReports({ left, right, logicalIndex: 20 });
    expect(result.relation).toBe("contradicted");
    expect(result.left.value).toBe("true");
    expect(result.right.value).toBe("false");
    expect(result.left.factId).not.toBe(result.right.factId);
    expect(result.left.relatedFactId).toBe(result.right.factId);
  });

  it("corroborates equal claim values without changing confidence implicitly", () => {
    const left = communicateNpcInformation({ source: rememberNpcInformation(experienced("true", "npc-a"), 11), receiverNpcId: "npc-c", logicalIndex: 12 });
    const right = communicateNpcInformation({ source: rememberNpcInformation(experienced("true", "npc-b"), 11), receiverNpcId: "npc-c", logicalIndex: 13 });
    const result = reconcileNpcInformationReports({ left, right, logicalIndex: 20 });
    expect(result.relation).toBe("corroborated");
    expect(result.left.confidenceBps).toBe(left.confidenceBps);
  });

  it("uses explicit fixed-point trust thresholds", () => {
    expect(assessNpcInformationTrust({ confidenceBps: 8000, corroborationCount: 2, contradictionCount: 0 }).status).toBe("trusted");
    expect(assessNpcInformationTrust({ confidenceBps: 7999, corroborationCount: 2, contradictionCount: 0 }).status).toBe("uncertain");
    expect(assessNpcInformationTrust({ confidenceBps: 9000, corroborationCount: 2, contradictionCount: 1 }).status).toBe("uncertain");
  });

  it("expires only at the declared logical index", () => {
    const remembered = rememberNpcInformation(experienced("true"), 11);
    expect(() => expireNpcInformation(remembered, 99)).toThrow("NOT_EXPIRED");
    expect(() => transitionNpcInformation(remembered, { status: "expired", logicalIndex: 99, confidenceBps: remembered.confidenceBps })).toThrow("NOT_EXPIRED");
    expect(() => communicateNpcInformation({ source: remembered, receiverNpcId: "npc-b", logicalIndex: 100 })).toThrow("EXPIRED");
    expect(expireNpcInformation(remembered, 100).status).toBe("expired");
  });

  it("rejects cross-world reconciliation", () => {
    const left = communicateNpcInformation({ source: rememberNpcInformation(experienced("true"), 11), receiverNpcId: "npc-c", logicalIndex: 12 });
    const right = {
      ...experienced("false", "npc-b", 13),
      worldId: "world-2",
      sourceReceiptId: "npc_decision_202",
      factId: "neif_other",
    };
    expect(() => reconcileNpcInformationReports({ left, right, logicalIndex: 20 })).toThrow("SCOPE_MISMATCH");
  });

  it("rejects analysis-only CAG as a source kind", () => {
    expect(() => createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId: "npc-a",
      subjectId: "ruin-1",
      predicate: "discovered",
      value: "true",
      logicalIndex: 1,
      source: { ...source, sourceKind: "cag_analysis" as never },
    })).toThrow();
  });

  it("keeps provenance available for compact readmodels", () => {
    const experiencedFact = experienced("true");
    const remembered = rememberNpcInformation(experiencedFact, 11);
    const communicated = communicateNpcInformation({ source: remembered, receiverNpcId: "npc-b", logicalIndex: 12 });
    const summary = summarizeNpcInformationProvenance([experiencedFact, remembered, communicated]);
    expect(summary.originSourceReceiptId).toBe(`${source.sourceReceiptId}:npc-a`);
    expect(summary.lineageReceiptIds).toEqual([experiencedFact.id, remembered.id, communicated.id]);
  });

  it("only treats corroborated/trusted non-expired facts as consumable", () => {
    const remembered = rememberNpcInformation(experienced("true"), 11);
    expect(isVerifiedConsumableNpcInformation(remembered, 11)).toBe(false);
    expect(() => transitionNpcInformation(remembered, { status: "trusted", logicalIndex: 12, confidenceBps: 9000 })).toThrow("TRUST_EVIDENCE_REQUIRED");
    const corroborated = transitionNpcInformation(remembered, { status: "communicated", logicalIndex: 12, confidenceBps: 9000 });
    const confirmed = transitionNpcInformation(corroborated, { status: "corroborated", logicalIndex: 13, confidenceBps: 9000 });
    const trusted = transitionNpcInformation(confirmed, { status: "trusted", logicalIndex: 14, confidenceBps: 9000 });
    expect(isVerifiedConsumableNpcInformation(trusted, 14)).toBe(true);
    expect(isVerifiedConsumableNpcInformation(trusted, 100)).toBe(false);
  });
});
