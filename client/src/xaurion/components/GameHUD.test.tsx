import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameHUD, type GameHUDProps } from "./GameHUD";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("./Ax1HpMeter", () => ({
  Ax1HpMeter: ({ hp, maxHp }: { hp: number; maxHp: number }) => (
    <div role="meter" aria-label="Party health" data-value={`${hp}/${maxHp}`} />
  ),
}));

const baseProps = (): GameHUDProps => ({
  playerName: "Explorer",
  playerIcon: "✦",
  playerColor: "#d8b45f",
  points: 42,
  victories: 7,
  progressionCount: 3,
  mastery: { name: "weapon", level: 4, xpPercent: 0.4 },
  playerState: "live",
  playerStateLabel: "Live",
  connected: true,
  remotePlayerCount: 3,
  zoneName: "Observatory Threshold",
  coordinates: "[0, -32]",
  worldState: "live",
  worldStateLabel: "Live",
  party: [
    { id: "2", name: "Mira", role: "Heiler", ready: true, hp: 80, maxHp: 100 },
  ],
  objectives: [
    {
      id: "primary-1",
      label: "Find the Observatory",
      detail: "Cross the threshold and reach the living world.",
      kind: "primary",
      progress: 0.4,
    },
    {
      id: "poi-1",
      label: "Wind Shrine",
      detail: "A confirmed nearby landmark.",
      kind: "landmark",
    },
    {
      id: "poi-2",
      label: "Threshold Keeper",
      detail: "A confirmed NPC contact.",
      kind: "npc",
    },
  ],
  hotbar: [
    { command: "1", name: "First Skill", icon: "✦", color: "#67d0c4" },
    { command: "2", name: "Second Skill", icon: "◆", color: "#d8b45f" },
  ],
  autoLoot: true,
  autoAttack: false,
  actionsDisabled: false,
  controlsDisabled: false,
  combat: {
    eventCount: 2,
    currentDps: 120,
    peakDps: 180,
    currentDtps: 15,
    logs: [{ id: "e1", tick: 12, text: "Strike", value: 120 }],
  },
  miniMap: <div data-testid="mini-map">MiniMap</div>,
  movementControl: <div data-testid="movement-control">Movement</div>,
  feedback: "Server bestätigte den letzten Readback.",
  onMenuOpenChange: vi.fn(),
  onOpenCharacter: vi.fn(),
  onOpenInventory: vi.fn(),
  onOpenCrafting: vi.fn(),
  onOpenQuests: vi.fn(),
  onOpenContacts: vi.fn(),
  onOpenParty: vi.fn(),
  onOpenDungeonFinder: vi.fn(),
  onOpenMap: vi.fn(),
  onOpenControls: vi.fn(),
  onOpenDisciplines: vi.fn(),
  onOpenCompanion: vi.fn(),
  onOpenChat: vi.fn(),
  onOpenGuild: vi.fn(),
  onOpenEconomy: vi.fn(),
  onOpenDialogue: vi.fn(),
  onOpenTerritory: vi.fn(),
  onOpenHomestead: vi.fn(),
  onOpenDeterminism: vi.fn(),
  onOpenResearch: vi.fn(),
  onToggleAutoLoot: vi.fn(),
  onInteract: vi.fn(),
  onToggleAutoAttack: vi.fn(),
  onAttack: vi.fn(),
  onCastSkill: vi.fn(),
});

describe("GameHUD", () => {
  it("presents explicit player/world projection states instead of color-only status", async () => {
    const props = baseProps();
    props.playerState = "stale";
    props.playerStateLabel = "Stale";
    props.worldState = "error";
    props.worldStateLabel = "Unavailable";
    render(<GameHUD {...props} />);

    expect(screen.getByText("Player · Stale")).toBeTruthy();
    expect(screen.getByText("World · Unavailable")).toBeTruthy();
    expect(screen.getByLabelText("Serverbestätigter Charakter")).toHaveAttribute("data-state", "stale");
  });

  it("keeps frequent actions visible and groups lower-frequency systems in the command deck", async () => {
    const props = baseProps();
    render(<GameHUD {...props} />);

    expect(screen.getByRole("button", { name: "Charakter [C]" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inventar [I/B]" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Weitere Menüs" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gilde", exact: true })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Weitere Menüs" }));
    expect(screen.getByRole("dialog", { name: "Weitere Menüs" })).toBeTruthy();
    expect(screen.getByText("Character & Progression")).toBeTruthy();
    expect(screen.getByText("World & Adventure")).toBeTruthy();
    expect(screen.getByText("Social & Holdings")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gilde" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kontakte" })).toBeTruthy();
  });

  it("renders one dominant primary objective and a compact nearby layer", () => {
    render(<GameHUD {...baseProps()} />);

    expect(screen.getByRole("region", { name: "Hauptziel" })).toBeTruthy();
    expect(screen.getByText("PRIMARY · SERVER PROJECTION")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Nearby objectives" })).toBeTruthy();
    expect(screen.getByText("Nearby · 2")).toBeTruthy();
    expect(screen.getByText("Find the Observatory")).toBeTruthy();
  });

  it("keeps gameplay controls touch-safe and self-describing", () => {
    render(<GameHUD {...baseProps()} />);

    const attack = screen.getByTitle("Angriff [F]");
    expect(attack.className).toContain("min-h-14");
    expect(attack.className).toContain("min-w-14");

    const skill = screen.getByRole("button", { name: /First Skill · Hotbar 1/ });
    expect(skill.className).toContain("min-h-11");
    expect(skill.className).toContain("min-w-11");
  });

  it("keeps menu state wired to the integration callback", async () => {
    const props = baseProps();
    render(<GameHUD {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Weitere Menüs" }));
    await waitFor(() => expect(props.onMenuOpenChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole("button", { name: "Weitere Menüs" }));
    await waitFor(() => expect(props.onMenuOpenChange).toHaveBeenLastCalledWith(false));
  });
});
