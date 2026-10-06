import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  communicateNpcInformation,
  createExperiencedNpcInformation,
  rememberNpcInformation,
  reconcileNpcInformationReports,
  type NpcInformationSource,
} from "@shared/npcInformationEcologyProtocol";
import { projectRumorClaims } from "@shared/rumorProjectionProtocol";
import { buildInvestigationGraph } from "@shared/investigationGraphProtocol";
import { buildInvestigationJournal } from "@shared/investigationJournalProtocol";
import { Ax1InvestigationJournalModal } from "./Ax1InvestigationJournalModal";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function journalFixture(guidance: "whisper" | "plot" | "conspiracy" = "whisper") {
  const chain = (value: string, witnessNpcId: string, logicalIndex: number) => {
    const exp = createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId,
      subjectId: "caravan-7",
      predicate: "destroyed",
      value,
      logicalIndex,
      expiresAtIndex: 1_000,
      confidenceBps: 9_000,
      source: { ...source, sourceReceiptId: `${source.sourceReceiptId}:${witnessNpcId}` },
    });
    const rem = rememberNpcInformation(exp, logicalIndex + 1);
    const told = communicateNpcInformation({ source: rem, receiverNpcId: "player-1", logicalIndex: logicalIndex + 2 });
    return [exp, rem, told] as const;
  };
  const left = chain("true", "npc-a", 10);
  const right = chain("false", "npc-b", 20);
  const reconciliation = reconcileNpcInformationReports({ left: left[2], right: right[2], logicalIndex: 30 });
  const receipts = [...left, ...right, reconciliation.left, reconciliation.right];
  const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
  const graph = buildInvestigationGraph({ projection });
  return buildInvestigationJournal({ projection, graph, guidance });
}

describe("AX1 investigation journal projection (issue #784)", () => {
  it("renders only server-confirmed claims with bands and discovered contradictions", () => {
    render(<Ax1InvestigationJournalModal
      isOpen
      onClose={vi.fn()}
      journal={journalFixture()}
      pending={false}
      onSubmitDeduction={vi.fn()}
    />);
    expect(screen.getByRole("dialog", { name: "Investigationsjournal & Gerüchtetafel" })).toBeTruthy();
    expect(screen.getByText("Widerspruch entdeckt")).toBeTruthy();
    expect(screen.getByLabelText("Behauptung true auswählen")).toBeTruthy();
    expect(screen.getByLabelText("Behauptung false auswählen")).toBeTruthy();
    // Deductions require a server-validatable selection of at least two claims.
    expect((screen.getByRole("button", { name: "Anfechten" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("assembles deduction intents from disclosed claims only", () => {
    const journal = journalFixture();
    const onSubmit = vi.fn();
    render(<Ax1InvestigationJournalModal
      isOpen
      onClose={vi.fn()}
      journal={journal}
      pending={false}
      onSubmitDeduction={onSubmit}
    />);
    fireEvent.click(screen.getByLabelText("Behauptung true auswählen"));
    fireEvent.click(screen.getByLabelText("Behauptung false auswählen"));
    fireEvent.click(screen.getByRole("button", { name: "Anfechten" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const intent = onSubmit.mock.calls[0][0];
    expect(intent.actorId).toBe("player-1");
    expect(intent.deductionType).toBe("challenge");
    expect(intent.sourceProjectionHash).toBe(journal.sourceProjectionHash);
    expect(intent.selectedClaimIds.length).toBe(2);
  });

  it("hides provenance hints under conspiracy guidance without changing claims", () => {
    render(<Ax1InvestigationJournalModal
      isOpen
      onClose={vi.fn()}
      journal={journalFixture("conspiracy")}
      pending={false}
      onSubmitDeduction={vi.fn()}
    />);
    expect(screen.queryByText(/Hörensagen/)).toBeNull();
    expect(screen.getByLabelText("Behauptung true auswählen")).toBeTruthy();
  });

  it("renders the confirmed empty state instead of inventing clues", () => {
    const journal = journalFixture();
    render(<Ax1InvestigationJournalModal
      isOpen
      onClose={vi.fn()}
      journal={{ ...journal, investigations: [] }}
      pending={false}
      onSubmitDeduction={vi.fn()}
    />);
    expect(screen.getByText("Keine bestätigten Gerüchte im aktuellen Wissensstand.")).toBeTruthy();
  });
});
