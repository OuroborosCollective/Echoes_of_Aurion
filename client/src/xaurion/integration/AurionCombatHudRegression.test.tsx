// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "sonner";
import { CausalBackupNotifier } from "@/components/CausalBackupNotifier";
import { projectConfirmedZoneSnapshot } from "./zoneCombatBridge";
import { AURION_COMBAT_FEEDBACK_EVENT } from "./confirmedActionRequest";
import { AurionAuthorityHud } from "./AurionAuthorityHud";

const f = vi.hoisted(() => {
  const empty = { data: undefined, isError: false, isStale: false, refetch: vi.fn(async () => ({ isError: false })) };
  return { empty, onMove: vi.fn(), onAction: vi.fn() };
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ gameplay: { relationshipStanding: { invalidate: vi.fn() } } }),
    player: { statWallet: { useQuery: () => f.empty }, allocateStatPoint: { useMutation: () => ({ mutateAsync: vi.fn(async () => ({})) }) }, me: { useQuery: () => f.empty }, ui: { useQuery: () => f.empty }, saveControls: { useMutation: () => ({}) }, collectLoot: { useMutation: () => ({}) }, equipItem: { useMutation: () => ({}) }, unequipItem: { useMutation: () => ({}) } },
    gameplay: { openWorld: { useQuery: () => f.empty } },
    groups: { read: { useQuery: () => f.empty }, command: { useMutation: () => ({}) } },
    crafting: { read: { useQuery: () => f.empty }, manipulationRead: { useQuery: () => f.empty }, manipulate: { useMutation: () => ({}) }, craft: { useMutation: () => ({}) }, materializeBonus: { useMutation: () => ({}) } },
  },
}));
vi.mock("../components/VirtualJoystick", () => ({ VirtualJoystick: () => null }));

afterEach(() => { toast.dismiss(); cleanup(); vi.clearAllMocks(); });
const mount = () => render(<><Toaster visibleToasts={3}/><CausalBackupNotifier/><AurionAuthorityHud userId={7} connected onMove={f.onMove} onTouchMoveDestination={vi.fn()} onAction={f.onAction}/></>);
const confirmed = (health: number) => ({
  entityId: "player:7", health, maxHealth: 100, alive: health > 0,
  stamina: 100, maxStamina: 100, combatLevel: 1, lastCombatSequence: 1,
});

describe("Aurion authoritative self-health and combat feedback", () => {
  it("projects a rejected direct attack into the single visible combat feedback lane", async () => {
    f.onAction.mockResolvedValueOnce({
      confirmed: false,
      completed: false,
      message: "Ziel außerhalb der bestätigten Aurion-Reichweite.",
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Angriff [R]" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Ziel außerhalb der bestätigten Aurion-Reichweite."));
    expect(screen.getAllByText("Ziel außerhalb der bestätigten Aurion-Reichweite.")).toHaveLength(1);
  });

  it("projects keyboard combat outcomes from the runtime into the same feedback lane", () => {
    mount();
    act(() => window.dispatchEvent(new CustomEvent(AURION_COMBAT_FEEDBACK_EVENT, {
      detail: { confirmed: false, completed: false, message: "Der Aurion-Skill ist serverseitig noch auf Abklingzeit." },
    })));
    expect(screen.getByRole("status").textContent).toBe("Der Aurion-Skill ist serverseitig noch auf Abklingzeit.");
  });

  it("expires stale combat feedback and restarts the lifetime for an identical newer outcome", async () => {
    vi.useFakeTimers();
    try {
      const repeatedMessage = "Wiederholte Aurion-Rückmeldung.";
      f.onAction.mockResolvedValueOnce({ confirmed: false, completed: false, message: repeatedMessage });
      mount();
      act(() => window.dispatchEvent(new CustomEvent(AURION_COMBAT_FEEDBACK_EVENT, {
        detail: { confirmed: false, completed: false, message: repeatedMessage },
      })));
      expect(screen.getByRole("status").textContent).toBe(repeatedMessage);

      act(() => vi.advanceTimersByTime(3_999));
      expect(screen.getByRole("status").textContent).toBe(repeatedMessage);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Angriff [R]" }));
      });

      act(() => vi.advanceTimersByTime(3_999));
      expect(screen.getByRole("status").textContent).toBe(repeatedMessage);
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByText(repeatedMessage)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never announces a successful cold archive simply because a combat action was confirmed", async () => {
    mount();
    act(() => window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { sequence: 1, command: "F" } })));
    await waitFor(() => expect(f.empty.refetch).toHaveBeenCalled());
    expect(screen.queryByText("Sitzung serverseitig gesichert")).toBeNull();
    expect(screen.queryByText(/Kaltlager archiviert/)).toBeNull();
  });

  it("renders only the server-confirmed current HP, death and respawn; ignores other players and invalid reports", () => {
    mount();
    expect(screen.queryByTestId("aurion-self-hp")).toBeNull();
    act(() => projectConfirmedZoneSnapshot({ selfEntityId: "player:8", mobs: [], combatants: [confirmed(50)] }));
    expect(screen.queryByTestId("aurion-self-hp")).toBeNull();
    act(() => projectConfirmedZoneSnapshot({ selfEntityId: "player:7", mobs: [], combatants: [confirmed(72)] }));
    expect(screen.getByTestId("aurion-self-hp").textContent).toContain("72/100");
    act(() => projectConfirmedZoneSnapshot({ selfEntityId: "player:7", mobs: [], combatants: [confirmed(0)] }));
    expect(screen.getByTestId("aurion-self-hp").textContent).toContain("0/100");
    expect(screen.getByTestId("aurion-self-life-status").textContent).toContain("Kampfunfähig");
    act(() => projectConfirmedZoneSnapshot({ selfEntityId: "player:7", mobs: [], combatants: [confirmed(100)] }));
    expect(screen.getByTestId("aurion-self-life-status").textContent).toContain("Wiederbelebt");
  });

  it("does not stack repeated identical backup confirmations", async () => {
    mount();
    act(() => {
      for (let i = 0; i < 12; i++) window.dispatchEvent(new CustomEvent("aurion:causal-backup-confirmed", { detail: { message: "Sitzung serverseitig gesichert" } }));
    });
    await waitFor(() => expect(screen.getAllByText("Sitzung serverseitig gesichert")).toHaveLength(1));
  });
});
