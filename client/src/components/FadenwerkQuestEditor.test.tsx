import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { QuestTemplateVersion } from "@shared/aurionQuestContract";
import FadenwerkQuestEditor from "./FadenwerkQuestEditor";

vi.mock("@/lib/trpc", () => ({
  trpc: { aurionQuest: {
    proposeDraft: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    publishPlan: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
  } },
}));
afterEach(cleanup);

const serverTemplate: QuestTemplateVersion = {
  templateId: "tpl_existing", version: 1, title: "Bestehende Quest",
  description: "Echte Aurion-Vorlage", prerequisiteFacts: [], roles: [],
  nodes: [
    { id: "start", type: "start", title: "Start", requirements: [], actionsOnEnter: [], actionsOnExit: [] },
    { id: "end", type: "end", title: "Ende", requirements: [], actionsOnEnter: [], actionsOnExit: [] },
  ],
  edges: [{ id: "edge1", fromNodeId: "start", toNodeId: "end", priority: 0 }],
  outcomes: [], maxCompositionDepth: 10, active: true, quarantined: false,
};
const graph = () => ({
  start: { id: "start", title: "Start", choices: [{ id: "go", label: "Weiter", nextNode: "end" }] },
  end: { id: "end", title: "Ende", choices: [] },
});

describe("Fadenwerk Quest Studio presentation boundary", () => {
  it("drops a copied draft when source JSON changes instead of keeping stale approval controls", () => {
    render(<FadenwerkQuestEditor templates={[serverTemplate]} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Aurion-Vorlage kopieren/i }), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /Aurion-Draft \+ Plan anfragen/i })).toBeDefined();
    fireEvent.change(screen.getByRole("textbox", { name: /Fadenwerk JSON/i }), { target: { value: "{invalid" } });
    expect(screen.queryByRole("button", { name: /Aurion-Draft \+ Plan anfragen/i })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("SyntaxError");
  });

  it("switches questlines explicitly and blocks an unmapped sibling without blocking the clean one", () => {
    const unsafe = graph() as Record<string, any>;
    unsafe.start.text = "Ungebundener Questtext";
    const data = { version: 1, questlines: [
      { id: "unsafe", title: "Nicht zugeordnet", entryNode: "start", graph: unsafe },
      { id: "safe", title: "Geprüfter Graph", entryNode: "start", graph: graph() },
    ] };
    render(<FadenwerkQuestEditor templates={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Fadenwerk JSON/i }), { target: { value: JSON.stringify(data) } });
    const convert = screen.getByRole("button", { name: /Nur zulässige Struktur übernehmen/i }) as HTMLButtonElement;
    expect(convert.disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: /Strang für Strukturimport/i }), { target: { value: "1" } });
    expect(convert.disabled).toBe(false);
    fireEvent.click(convert);
    expect(screen.getByRole("heading", { name: /Geprüfter Graph/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Aurion-Draft \+ Plan anfragen/i })).toBeDefined();
  });
});
