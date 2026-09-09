import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AurionAuthorityHud } from "./AurionAuthorityHud";

const fixtures = vi.hoisted(() => ({ player: { data: undefined as unknown, isError: false, isStale: false, refetch: vi.fn() }, standing: { data: undefined as unknown, isError: false, isStale: false, refetch: vi.fn() }, other: { data: undefined, refetch: vi.fn() }, ui: { data: undefined as unknown, isError: false, isStale: false, refetch: vi.fn() }, mutate: vi.fn(), onMove: vi.fn(), onAction: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ gameplay: { relationshipStanding: { invalidate: fixtures.standing.refetch } } }),
  groups: { read: { useQuery: () => fixtures.other }, command: { useMutation: () => ({ mutateAsync: fixtures.mutate }) } },
  crafting: { read: { useQuery: () => fixtures.other }, craft: { useMutation: () => ({ mutateAsync: fixtures.mutate }) }, materializeBonus: { useMutation: () => ({ mutateAsync: fixtures.mutate }) } },
  player: { ui: { useQuery: () => fixtures.ui }, saveControls: { useMutation: () => ({ mutateAsync: fixtures.mutate }) }, collectLoot: { useMutation: () => ({ mutateAsync: fixtures.mutate }) }, equipItem: { useMutation: () => ({ mutateAsync: fixtures.mutate }) }, unequipItem: { useMutation: () => ({ mutateAsync: fixtures.mutate }) }, me: { useQuery: () => fixtures.player } },
  gameplay: { npcMultiMemory: { useQuery: () => ({}) }, npcSnapshots: { useQuery: () => ({}) }, relationshipStanding: { useQuery: () => fixtures.standing }, currentEncounter: { useQuery: () => fixtures.other }, startEncounter: { useMutation: () => ({}) }, progress: { useQuery: () => fixtures.other }, openWorld: { useQuery: () => fixtures.other }, acceptQuest: { useMutation: () => ({}) }, completeQuest: { useMutation: () => ({}) } },
} }));
vi.mock("../components/VirtualJoystick", () => ({ VirtualJoystick: () => null }));
const confirmed = { profile: { userId: 7, aurionPoints: 23, victories: 2, selectedClass: "unbound" }, progression: { characterId: "char-7", tracks: [{ trackKind: "weapon", trackId: "greatsword.two_handed.v3", characterId: "char-7", levelExact: "17", resultReceiptId: "result-00000001", sourceReceiptId: "source-00000001", receiptHash: "b".repeat(64) }] }, inventory: [] };
const uiState = { version: "aurion-ax1-ui.v1", userId: 7, settings: { revision: 0, autoLoot: true, hotbar: ["1", "2", "3", "4", "5"] }, items: [], equipment: [] };
const mount = () => render(<AurionAuthorityHud userId={7} connected onMove={fixtures.onMove} onAction={fixtures.onAction} />);
describe("server-backed Aurion HUD", () => {
  beforeEach(() => { fixtures.ui.data = undefined; fixtures.ui.isError = false; fixtures.ui.isStale = false; fixtures.player.data = undefined; fixtures.player.isError = false; fixtures.player.isStale = false; fixtures.standing.data = undefined; fixtures.standing.isStale = false; fixtures.standing.isError = false; vi.clearAllMocks(); fixtures.player.refetch.mockResolvedValue({ isError: false }); fixtures.other.refetch.mockResolvedValue({ isError: false }); fixtures.ui.refetch.mockImplementation(async () => ({ data: fixtures.ui.data, isError: false })); fixtures.mutate.mockResolvedValue({}); });
  it("shows no fabricated gold, hit points or class before a confirmed readback", () => {
    mount();
    expect(screen.getByText("Charakterdaten ausstehend")).toBeTruthy();
    expect(screen.queryByText(/LV |🪙|100\/100|Sir_Galahad/)).toBeNull();
  });
  it("toggles every panel shortcut once and stops movement on opening", () => {
    mount();
    for (const [key, name] of [["i", "Inventar & Paperdoll-Rüstkammer"], ["b", "Inventar & Paperdoll-Rüstkammer"], ["c", "Charakter & Skills"], ["m", "Weltatlas"], ["j", "Quest-Buch & Lore-Chroniken"], ["q", "Quest-Buch & Lore-Chroniken"]]) {
      fireEvent.keyDown(window, { key });
      expect(screen.getByRole("dialog", { name })).toBeTruthy();
      expect(fixtures.onMove).toHaveBeenLastCalledWith(0, 0);
      fireEvent.keyDown(window, { key, repeat: true });
      expect(screen.getByRole("dialog", { name })).toBeTruthy();
      fireEvent.keyDown(window, { key });
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    expect(fixtures.onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Weltatlas" }).getAttribute("aria-keyshortcuts")).toBe("M");
  });
  it("leaves typing, browser shortcuts and other dialogs in control of their keys", () => {
    const { container } = mount();
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    const editor = document.createElement("div");
    editor.contentEditable = "true"; editor.setAttribute("contenteditable", "true"); editor.tabIndex = 0; container.append(editor); editor.focus();
    fireEvent.keyDown(editor, { key: "i" });
    expect(screen.queryByRole("dialog")).toBeNull();
    editor.remove();
    const external = document.createElement("section"); external.dataset.aurionPanel = "open"; container.append(external);
    fireEvent.keyDown(window, { key: "i" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("projects confirmed receipt-backed progression and never renders a class choice", () => {
    fixtures.player.data = confirmed; fixtures.player.isStale = true; mount();
    expect(screen.getByText("1 bestätigte Progressionspfade · 2 Siege")).toBeTruthy();
    expect(screen.queryByText(/290 EP/)).toBeNull();
    expect(screen.getByText(/◆\s*23/)).toBeTruthy();
    expect(screen.getByText("Receipt verifiziert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Charakter" }));
    expect(screen.queryByText(/Klasse wählen|Vorhut|Seher|Hüter/)).toBeNull();
    expect(screen.getAllByText("greatsword.two_handed.v3").length).toBeGreaterThan(0);
  });
  it("keeps a live inventory setting actionable when only the unrelated player readback is stale", async () => {
    fixtures.player.data = confirmed; fixtures.player.isStale = true; fixtures.ui.data = uiState;
    mount(); fireEvent.click(screen.getByRole("button", { name: "Inventar" }));
    const toggle = screen.getByRole("button", { name: "Auto-Loot AN" }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => expect(fixtures.mutate).toHaveBeenCalledTimes(1));
    expect(fixtures.mutate).toHaveBeenCalledWith(expect.objectContaining({ revision: 0, autoLoot: false }));
    await waitFor(() => expect(fixtures.ui.refetch).toHaveBeenCalled());
    expect(fixtures.player.refetch).toHaveBeenCalled();
  });
  it("shows confirmed NPC standing and labels stale relationship data", () => {
    fixtures.standing.data = { userId: 7, social: [], entries: [{ kind: "npc_relation", id: "lyra", score: 5, tier: "NEUTRAL", sourceCount: 1, xpExact: "4", levelExact: "1" }] };
    fixtures.standing.isStale = true; mount(); fireEvent.click(screen.getByRole("button", { name: "Aufträge & Kontakte" }));
    fireEvent.click(screen.getByRole("button", { name: "Kontakte" }));
    expect(screen.getByTestId("npc-standing-panel").dataset.state).toBe("stale");
    expect(screen.getByText("Neutral · Ansehen 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Beziehungen aktualisieren" })); expect(fixtures.standing.refetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a relationship response belonging to another player", () => {
    fixtures.standing.data = { userId: 8, social: [], entries: [{ kind: "npc_relation", id: "lyra", score: 80, tier: "EXALTED", sourceCount: 1, xpExact: "4", levelExact: "1" }] };
    mount(); fireEvent.click(screen.getByRole("button", { name: "Aufträge & Kontakte" }));
    fireEvent.click(screen.getByRole("button", { name: "Kontakte" }));
    expect(screen.getByTestId("npc-standing-panel").dataset.state).toBe("error");
    expect(screen.queryByText(/Erhaben/)).toBeNull();
  });
  it("opens the AX1 crafting surface without redirecting to the old community window", () => {
    const handler = vi.fn(); window.addEventListener("aurion:open-community", handler);
    try { mount(); fireEvent.click(screen.getByRole("button", { name: "Handwerk" })); expect(screen.getByRole("dialog", { name: "Handwerk & Berufe" })).toBeTruthy(); expect(handler).not.toHaveBeenCalled(); }
    finally { window.removeEventListener("aurion:open-community", handler); }
  });
  it("keeps equip blocked through mutation and the subsequent server readback", async () => {
    const item = { id: "fixture_item", version: "legacy", name: "Aurionspeer", definition: "aurion_spear", levelExact: "1", quality: "normal", slot: "main_hand", status: "owned", stats: {}, receiptId: "fixture_receipt" };
    fixtures.player.data = confirmed;
    const state = { version: "aurion-ax1-ui.v1", userId: 7, settings: { revision: 0, autoLoot: true, hotbar: ["1", "2", "3", "4", "5"] }, items: [item], equipment: [] };
    fixtures.ui.data = state;
    let resolveRead!: (value: unknown) => void;
    fixtures.ui.refetch.mockImplementation(() => new Promise(resolve => { resolveRead = resolve; }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Inventar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aurionspeer · Gewöhnlich" }));
    fireEvent.click(screen.getByRole("button", { name: "Ausrüsten" }));
    await waitFor(() => expect(fixtures.ui.refetch).toHaveBeenCalled());
    expect(fixtures.mutate).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Ausrüsten" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Ausrüsten" }));
    expect(fixtures.mutate).toHaveBeenCalledTimes(1);
    await act(async () => resolveRead({ data: state, isError: false }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Ausrüsten" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
