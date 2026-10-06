import { describe, expect, it } from "vitest";
import {
  communicateNpcInformation,
  createExperiencedNpcInformation,
  rememberNpcInformation,
  reconcileNpcInformationReports,
  type NpcInformationSource,
} from "./npcInformationEcologyProtocol";
import { projectRumorClaims } from "./rumorProjectionProtocol";
import { buildInvestigationGraph } from "./investigationGraphProtocol";
import {
  buildDeductionIntentFromJournal,
  buildInvestigationJournal,
  confidenceBand,
  guidancePresentation,
  verifyInvestigationJournal,
} from "./investigationJournalProtocol";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function claimChain(value: string, witnessNpcId: string, logicalIndex: number, confidenceBps = 9_000) {
  const exp = createExperiencedNpcInformation({
    worldId: "world-1",
    witnessNpcId,
    subjectId: "caravan-7",
    predicate: "destroyed",
    value,
    logicalIndex,
    expiresAtIndex: 1_000,
    confidenceBps,
    source: { ...source, sourceReceiptId: `${source.sourceReceiptId}:${witnessNpcId}` },
  });
  const rem = rememberNpcInformation(exp, logicalIndex + 1);
  const told = communicateNpcInformation({
    source: rem,
    receiverNpcId: "player-1",
    logicalIndex: logicalIndex + 2,
  });
  return [exp, rem, told] as const;
}

function journalFixture(guidance: "whisper" | "plot" | "conspiracy" = "whisper") {
  const left = claimChain("true", "npc-a", 10);
  const right = claimChain("false", "npc-b", 20);
  const reconciliation = reconcileNpcInformationReports({
    left: left[2],
    right: right[2],
    logicalIndex: 30,
  });
  const receipts = [...left, ...right, reconciliation.left, reconciliation.right];
  const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
  const graph = buildInvestigationGraph({ projection });
  return buildInvestigationJournal({ projection, graph, guidance });
}

describe("AIM-784 investigation journal & rumor board readmodel", () => {
  it("groups claims by investigation and marks discovered contradictions", () => {
    const journal = journalFixture();
    expect(journal.investigations.length).toBe(1);
    const investigation = journal.investigations[0];
    expect(investigation.hasContradiction).toBe(true);
    expect(investigation.entries.length).toBe(2);
    expect(investigation.entries.map(entry => entry.value).sort()).toEqual(["false", "true"]);
    expect(journal.sourceProjectionHash).toMatch(/^sha256:/);
    expect(journal.journalHash).toMatch(/^sha256:/);
  });

  it("derives confidence bands deterministically from Q16 confidence", () => {
    expect(confidenceBand(0)).toBe("low");
    expect(confidenceBand(24_575)).toBe("low");
    expect(confidenceBand(24_576)).toBe("medium");
    expect(confidenceBand(49_152)).toBe("high");
    expect(confidenceBand(65_536)).toBe("high");
    const journal = journalFixture();
    for (const entry of journal.investigations[0].entries) {
      expect(entry.confidenceBand).toBe("high"); // 9000 bps -> 58982 Q16
    }
  });

  it("keeps guidance levels as pure presentation policy over identical claims", () => {
    const whisper = journalFixture("whisper");
    const plot = journalFixture("plot");
    const conspiracy = journalFixture("conspiracy");
    expect(guidancePresentation("whisper")).toEqual({ showProvenance: true, showRelations: true });
    expect(guidancePresentation("plot")).toEqual({ showProvenance: false, showRelations: true });
    expect(guidancePresentation("conspiracy")).toEqual({ showProvenance: false, showRelations: false });
    // Guidance never alters canonical claim availability.
    expect(whisper.investigations).toEqual(plot.investigations);
    expect(plot.investigations).toEqual(conspiracy.investigations);
    expect(whisper.journalHash).not.toBe(conspiracy.journalHash);
  });

  it("contains no hidden or private claims", () => {
    const privateExp = createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId: "npc-z",
      subjectId: "vault-3",
      predicate: "looted",
      value: "true",
      logicalIndex: 5,
      source: { ...source, sourceReceiptId: "npc_decision_private" },
    });
    const left = claimChain("true", "npc-a", 10);
    const right = claimChain("false", "npc-b", 20);
    const receipts = [...left, ...right, privateExp];
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
    const graph = buildInvestigationGraph({ projection });
    const journal = buildInvestigationJournal({ projection, graph, guidance: "whisper" });
    const allValues = journal.investigations.flatMap(i => i.entries.map(e => `${i.subjectId}:${i.predicate}:${e.value}`));
    expect(allValues.some(v => v.includes("vault-3"))).toBe(false);
  });

  it("rebuilds identically after reload: same confirmed readmodel, same journal hash", () => {
    expect(journalFixture().journalHash).toBe(journalFixture().journalHash);
  });

  it("builds deduction intents only from disclosed claims, bound to the revision", () => {
    const journal = journalFixture();
    const claimIds = journal.investigations[0].entries.map(entry => entry.claimId);
    const intent = buildDeductionIntentFromJournal({
      journal,
      selectedClaimIds: claimIds,
      deductionType: "challenge",
    });
    expect(intent.actorId).toBe("player-1");
    expect(intent.sourceProjectionHash).toBe(journal.sourceProjectionHash);
    expect(intent.selectedClaimIds.length).toBe(2);
    expect(() => buildDeductionIntentFromJournal({
      journal,
      selectedClaimIds: ["rum_" + "9".repeat(59)],
      deductionType: "affirm",
    })).toThrow("JOURNAL_UNKNOWN_CLAIM");
  });

  it("verifies journal hashes fail-closed", () => {
    const journal = journalFixture();
    expect(verifyInvestigationJournal(journal).journalHash).toBe(journal.journalHash);
    expect(() => verifyInvestigationJournal({ ...journal, worldId: "world-2" })).toThrow("HASH_MISMATCH");
  });
});
