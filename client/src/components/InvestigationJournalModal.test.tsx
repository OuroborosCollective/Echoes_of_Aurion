import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
import { InvestigationJournalModal } from "./InvestigationJournalModal";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceReceiptHash: "sha256:" + "a".repeat(64),
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function journalFixture(
  guidance: "whisper" | "plot" | "conspiracy" = "whisper"
) {
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
      source: {
        ...source,
        sourceReceiptId: `${source.sourceReceiptId}:${witnessNpcId}`,
      },
    });
    const rem = rememberNpcInformation(exp, logicalIndex + 1);
    const told = communicateNpcInformation({
      source: rem,
      receiverNpcId: "player-1",
      logicalIndex: logicalIndex + 2,
    });
    return [exp, rem, told] as const;
  };
  const left = chain("true", "npc-a", 10);
  const right = chain("false", "npc-b", 20);
  const reconciliation = reconcileNpcInformationReports({
    left: left[2],
    right: right[2],
    logicalIndex: 30,
  });
  const receipts = [
    ...left,
    ...right,
    reconciliation.left,
    reconciliation.right,
  ];
  const projection = projectRumorClaims({
    viewerId: "player-1",
    worldId: "world-1",
    atIndex: 40,
    receipts,
  });
  const graph = buildInvestigationGraph({ projection });
  return buildInvestigationJournal({ projection, graph, guidance });
}

// Synthetic protocol fixtures exercise presentation only, not live Aurion data.
function manyClaimsFixture() {
  const receipts = Array.from({ length: 9 }, (_, i) => {
    const exp = createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId: `npc-${i}`,
      subjectId: "caravan-7",
      predicate: "destroyed",
      value: `value-${i}`,
      logicalIndex: 10 + i * 3,
      expiresAtIndex: 1000,
      confidenceBps: 9000,
      source: { ...source, sourceReceiptId: `receipt-${i}` },
    });
    const rem = rememberNpcInformation(exp, 11 + i * 3);
    const told = communicateNpcInformation({
      source: rem,
      receiverNpcId: "player-1",
      logicalIndex: 12 + i * 3,
    });
    return [exp, rem, told];
  }).flat();
  const projection = projectRumorClaims({
    viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts,
  });
  return buildInvestigationJournal({
    projection, graph: buildInvestigationGraph({ projection }), guidance: "whisper",
  });
}

describe("Aurion investigation journal projection (issue #784)", () => {
  it("renders only server-confirmed claims with bands and discovered contradictions", () => {
    render(
      <InvestigationJournalModal
        isOpen
        onClose={vi.fn()}
        journal={journalFixture()}
        pending={false} guidance="plot" onGuidanceChange={vi.fn()}
        onSubmitDeduction={vi.fn()}
      />
    );
    expect(
      screen.getByRole("dialog", {
        name: "Investigationsjournal & Gerüchtetafel",
      })
    ).toBeTruthy();
    expect(screen.getByText("Widerspruch entdeckt")).toBeTruthy();
    expect(screen.getByLabelText("Behauptung true auswählen")).toBeTruthy();
    expect(screen.getByLabelText("Behauptung false auswählen")).toBeTruthy();
    // Deductions require a server-validatable selection of at least two claims.
    expect(
      (screen.getByRole("button", { name: "Anfechten" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("sends a revision-bound selection request over disclosed claims only", () => {
    const journal = journalFixture();
    const onSubmit = vi.fn();
    render(
      <InvestigationJournalModal
        isOpen
        onClose={vi.fn()}
        journal={journal}
        pending={false} guidance="plot" onGuidanceChange={vi.fn()}
        onSubmitDeduction={onSubmit}
      />
    );
    fireEvent.click(screen.getByLabelText("Behauptung true auswählen"));
    fireEvent.click(screen.getByLabelText("Behauptung false auswählen"));
    fireEvent.click(screen.getByRole("button", { name: "Anfechten" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const request = onSubmit.mock.calls[0][0];
    expect(request.deductionType).toBe("challenge");
    expect(request.sourceProjectionHash).toBe(journal.sourceProjectionHash);
    expect(request.selectedClaimIds).toHaveLength(2);
    expect(request).not.toHaveProperty("actorId");
  });

  it("hides provenance hints under conspiracy guidance without changing claims", () => {
    render(
      <InvestigationJournalModal
        isOpen
        onClose={vi.fn()}
        journal={journalFixture("conspiracy")}
        pending={false} guidance="plot" onGuidanceChange={vi.fn()}
        onSubmitDeduction={vi.fn()}
      />
    );
    expect(screen.queryByText(/Hörensagen/)).toBeNull();
    expect(screen.getByLabelText("Behauptung true auswählen")).toBeTruthy();
  });

  it("renders the confirmed empty state instead of inventing clues", () => {
    const journal = journalFixture();
    render(
      <InvestigationJournalModal
        isOpen
        onClose={vi.fn()}
        journal={{ ...journal, investigations: [] }}
        pending={false} guidance="plot" onGuidanceChange={vi.fn()}
        onSubmitDeduction={vi.fn()}
      />
    );
    expect(
      screen.getByText("Keine bestätigten Gerüchte im aktuellen Wissensstand.")
    ).toBeTruthy();
  });

  it("caps selection at the protocol limit and permits replacing a choice", () => {
    render(<InvestigationJournalModal isOpen onClose={vi.fn()} journal={manyClaimsFixture()} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={vi.fn()} />);
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByLabelText(`Behauptung value-${i} auswählen`));
    const ninth = screen.getByLabelText("Behauptung value-8 auswählen") as HTMLInputElement;
    expect(ninth.disabled).toBe(true);
    expect(screen.getByText("8 ausgewählt")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Behauptung value-0 auswählen"));
    expect(ninth.disabled).toBe(false);
    fireEvent.click(ninth);
    expect(ninth.checked).toBe(true);
    expect(screen.getByText("8 ausgewählt")).toBeTruthy();
  });

  it("clears selection immediately when a new journal revision removes claims", () => {
    const journal = journalFixture();
    const submit = vi.fn();
    const { rerender } = render(<InvestigationJournalModal isOpen onClose={vi.fn()} journal={journal} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={submit} />);
    fireEvent.click(screen.getByLabelText("Behauptung true auswählen"));
    fireEvent.click(screen.getByLabelText("Behauptung false auswählen"));
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 41, receipts: [] });
    const empty = buildInvestigationJournal({ projection, graph: buildInvestigationGraph({ projection }), guidance: "whisper" });
    rerender(<InvestigationJournalModal isOpen onClose={vi.fn()} journal={empty} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={submit} />);
    expect(screen.getByText("0 ausgewählt")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Anfechten" }) as HTMLButtonElement).disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    rerender(<InvestigationJournalModal isOpen onClose={vi.fn()} journal={journal} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={submit} />);
    expect(screen.getByText("0 ausgewählt")).toBeTruthy();
    expect((screen.getByLabelText("Behauptung true auswählen") as HTMLInputElement).checked).toBe(false);
  });

  it("offers no blind chain action without disclosed prerequisite relations", () => {
    render(<InvestigationJournalModal isOpen onClose={vi.fn()} journal={journalFixture()} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Verketten" })).toBeNull();
  });

  it("uses a modal dialog and closes on Escape", () => {
    const onClose = vi.fn();
    render(<InvestigationJournalModal isOpen onClose={onClose} journal={journalFixture()} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Investigationsjournal & Gerüchtetafel" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the opening control after Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Journal öffnen</button>
        <InvestigationJournalModal isOpen={open} onClose={() => setOpen(false)} journal={journalFixture()} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={vi.fn()} />
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Journal öffnen" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("wraps actions for narrow screens", () => {
    render(<InvestigationJournalModal isOpen onClose={vi.fn()} journal={journalFixture()} pending={false} guidance="plot" onGuidanceChange={vi.fn()} onSubmitDeduction={vi.fn()} />);
    expect(screen.getByText("0 ausgewählt").parentElement?.style.flexWrap).toBe("wrap");
  });
});
