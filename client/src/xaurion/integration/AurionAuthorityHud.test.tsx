import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AurionAuthorityHud } from "./AurionAuthorityHud";

const fixtures = vi.hoisted(() => ({ player: { data: undefined as unknown, isError: false, isStale: false, refetch: vi.fn() }, standing: { data: undefined as unknown, isError: false, isStale: false, refetch: vi.fn() }, other: { data: undefined, refetch: vi.fn() }, mutate: vi.fn(), onMove: vi.fn(), onAction: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ gameplay: { relationshipStanding: { invalidate: fixtures.standing.refetch } } }),
  player: { me: { useQuery: () => fixtures.player }, chooseClass: { useMutation: () => ({ mutateAsync: fixtures.mutate }) }, setWeaponLoadout: { useMutation: () => ({ mutateAsync: fixtures.mutate }) } },
  gameplay: { npcSnapshots: { useQuery: () => ({}) }, relationshipStanding: { useQuery: () => fixtures.standing }, currentEncounter: { useQuery: () => fixtures.other }, startEncounter: { useMutation: () => ({}) }, progress: { useQuery: () => fixtures.other }, openWorld: { useQuery: () => fixtures.other }, acceptQuest: { useMutation: () => ({}) }, completeQuest: { useMutation: () => ({}) } },
} }));
vi.mock("../components/VirtualJoystick", () => ({ VirtualJoystick: () => null }));
const confirmed = { profile: { userId: 7, level: 3, totalXp: 290, aurionPoints: 23, victories: 2, selectedClass: "warden" }, capabilities: { canChooseClass: false, classUnlockLevel: 36 }, weaponMasteries: [], inventory: [] };
const mount = () => render(<AurionAuthorityHud userId={7} connected onMove={fixtures.onMove} onAction={fixtures.onAction} />);
describe("server-backed Aurion HUD", () => {
  beforeEach(() => { fixtures.player.data = undefined; fixtures.player.isError = false; fixtures.player.isStale = false; fixtures.standing.data = undefined; fixtures.standing.isStale = false; fixtures.standing.isError = false; vi.clearAllMocks(); });
  it("shows no fabricated gold, hit points or class before a confirmed readback", () => {
    mount();
    expect(screen.getByText("Charakterdaten ausstehend")).toBeTruthy();
    expect(screen.queryByText(/LV |🪙|100\/100|Sir_Galahad/)).toBeNull();
  });
  it("projects confirmed currency and treats stale data as read-only", () => {
    fixtures.player.data = confirmed; fixtures.player.isStale = true; mount();
    expect(screen.getByText("290 EP · 23 AURION")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Charakter" }));
    const choice = screen.getByRole("button", { name: "Vorhut" });
    expect(choice.closest("fieldset")?.disabled).toBe(true);
    fireEvent.click(choice);
    expect(fixtures.mutate).not.toHaveBeenCalled();
  });
  it("shows confirmed NPC standing and labels stale relationship data", () => {
    fixtures.standing.data = { userId: 7, social: [], entries: [{ kind: "npc_relation", id: "lyra", score: 5, tier: "NEUTRAL", sourceCount: 1, xpExact: "4", levelExact: "1" }] };
    fixtures.standing.isStale = true; mount(); fireEvent.click(screen.getByRole("button", { name: "Aufträge & Kontakte" }));
    expect(screen.getByTestId("npc-standing-panel").dataset.state).toBe("stale");
    expect(screen.getByText("Neutral · Ansehen 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Beziehungen aktualisieren" })); expect(fixtures.standing.refetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a relationship response belonging to another player", () => {
    fixtures.standing.data = { userId: 8, social: [], entries: [{ kind: "npc_relation", id: "lyra", score: 80, tier: "EXALTED", sourceCount: 1, xpExact: "4", levelExact: "1" }] };
    mount(); fireEvent.click(screen.getByRole("button", { name: "Aufträge & Kontakte" }));
    expect(screen.getByTestId("npc-standing-panel").dataset.state).toBe("error");
    expect(screen.queryByText(/Erhaben/)).toBeNull();
  });
  it("opens the existing community flow without generating local inventory or group membership", () => {
    const handler = vi.fn(); window.addEventListener("aurion:open-community", handler);
    try { mount(); fireEvent.click(screen.getByRole("button", { name: "Handwerk" })); expect(handler.mock.calls[0][0].detail).toEqual({ panel: "crafting" }); }
    finally { window.removeEventListener("aurion:open-community", handler); }
  });
});
