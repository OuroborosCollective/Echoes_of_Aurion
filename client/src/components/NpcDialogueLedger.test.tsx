import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { NpcDialogueLedger } from "./NpcDialogueLedger";
import { appendLedger, recordNpcDialogue, resetLedger, readLedger } from "@/lib/ledger";

describe("NpcDialogueLedger component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dialogue history and persists NPC dialogue entries", () => {
    recordNpcDialogue("Eldrin", "Die Leylinien singen von uralten Zeiten.");
    recordNpcDialogue("Lyra", "Sei auf der Hut in den Ruinen von Arelor.");

    render(<NpcDialogueLedger />);

    expect(screen.getByText("EXPEDITION & DIALOGUE LEDGER")).toBeTruthy();
    expect(screen.getByText("Eldrin")).toBeTruthy();
    expect(screen.getByText("Die Leylinien singen von uralten Zeiten.")).toBeTruthy();
    expect(screen.getByText("Lyra")).toBeTruthy();
    expect(screen.getByText("Sei auf der Hut in den Ruinen von Arelor.")).toBeTruthy();
  });

  it("filters dialogue entries when filter buttons are toggled", () => {
    recordNpcDialogue("Valen", "Der Schmiedeofen brennt Tag und Nacht.");
    appendLedger({ kind: "combat", title: "Combat Event", detail: "Damage dealt: 450" });

    render(<NpcDialogueLedger />);

    expect(screen.getByText("Valen")).toBeTruthy();
    expect(screen.getByText("Combat Event")).toBeTruthy();

    const dialogueFilterBtn = screen.getByRole("button", { name: /DIALOGE/ });
    fireEvent.click(dialogueFilterBtn);

    expect(screen.getByText("Valen")).toBeTruthy();
    expect(screen.queryByText("Combat Event")).toBeNull();
  });

  it("allows resetting the ledger", () => {
    recordNpcDialogue("Thorne", "Halt! Wer betritt die Festung?");
    render(<NpcDialogueLedger />);

    expect(screen.getByText("Thorne")).toBeTruthy();

    const resetButton = screen.getByRole("button", { name: "Ledger leeren" });
    fireEvent.click(resetButton);

    expect(readLedger()).toHaveLength(0);
    expect(screen.getByText("Keine Einträge für den ausgewählten Filter.")).toBeTruthy();
  });
});
