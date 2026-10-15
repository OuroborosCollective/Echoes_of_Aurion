// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "sonner";
import { CausalBackupNotifier } from "@/components/CausalBackupNotifier";
import { projectConfirmedZoneSnapshot } from "./zoneCombatBridge";
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
