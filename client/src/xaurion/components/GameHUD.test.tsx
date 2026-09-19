import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GameHUD, type Ax1HudPartyMember, type Ax1HudCompanion } from "./GameHUD";

describe("GameHUD Party Strip & Smart Menu Logic", () => {
  const dummyProps = {
    playerIcon: "✦",
    playerName: "Kaelen",
    playerColor: "#fbbf24",
    playerState: "live" as const,
    playerStateLabel: "Online",
    connected: true,
    remotePlayerCount: 2,
    zoneName: "Emberfall Threshold",
    worldState: "live",
    worldStateLabel: "Bestätigt",
    objectives: [],
    hotbar: [],
    autoLoot: false,
    autoAttack: false,
    actionsDisabled: false,
    controlsDisabled: false,
    combat: {
      eventCount: 0,
      currentDps: "0",
      peakDps: "0",
      currentDtps: "0",
      logs: [],
    },
    miniMap: <div data-testid="mini-map">Map</div>,
    movementControl: <div data-testid="movement-control">Joystick</div>,
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
  };

  const sampleParty: readonly Ax1HudPartyMember[] = [
    {
      id: "p1",
      name: "Valerius",
      role: "Tank",
      ready: true,
      hp: 1800,
      maxHp: 2000,
      weaponTrack: "Aegis & Spear",
    },
    {
      id: "p2",
      name: "Lyra",
      role: "Heiler",
      ready: true,
      hp: 1200,
      maxHp: 1500,
      weaponTrack: "Solar Conduit",
    },
  ];

  const sampleCompanion: Ax1HudCompanion = {
    name: "Echo",
    label: "AI Partner",
    provider: "ChatGPT",
    mode: "playing",
    online: true,
    datasetRows: 142,
    spawned: true,
    resonance: 92,
    statusText: "Aktiv",
  };

  it("renders in compact micro-status mode by default to prevent screen clutter", () => {
    render(
      <GameHUD
        {...dummyProps}
        party={sampleParty}
        companion={sampleCompanion}
      />
    );

    const partyFrame = screen.getByLabelText("Gruppe und Partner Status");
    expect(partyFrame).toBeDefined();

    // Toggle button should be collapsed by default
    const toggleButton = screen.getByLabelText("Party- und Partner-Details umschalten");
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");

    // Human partner micro symbol is visible with health %
    expect(screen.getByText("Valerius")).toBeDefined();
    expect(screen.getByText("90%")).toBeDefined();

    // AI partner Echo micro symbol is visible with status
    expect(screen.getByText("Echo")).toBeDefined();
    expect(screen.getByText("Aktiv")).toBeDefined();
  });

  it("expands to full detailed view with real-time health meter on demand", () => {
    render(
      <GameHUD
        {...dummyProps}
        party={sampleParty}
        companion={sampleCompanion}
      />
    );

    const toggleButton = screen.getByLabelText("Party- und Partner-Details umschalten");
    fireEvent.click(toggleButton);
    expect(toggleButton.getAttribute("aria-expanded")).toBe("true");

    // Now detailed meters and members are visible
    expect(screen.getByText("1800/2000")).toBeDefined();
    expect(screen.getByText("Lyra")).toBeDefined();
    expect(screen.getByText("1200/1500")).toBeDefined();

    // AI partner resonance sync bar and details are shown
    expect(screen.getByText("SYNC-RESONANZ")).toBeDefined();
    expect(screen.getByText("142 Aktionen")).toBeDefined();
  });

  it("calls onOpenCompanion when AI partner symbol is clicked", () => {
    const onOpenCompanion = vi.fn();
    render(
      <GameHUD
        {...dummyProps}
        party={sampleParty}
        companion={sampleCompanion}
        onOpenCompanion={onOpenCompanion}
      />
    );

    const aiButton = screen.getByLabelText("AI Partner: Echo (ChatGPT), Status: Aktiv");
    fireEvent.click(aiButton);
    expect(onOpenCompanion).toHaveBeenCalledTimes(1);
  });

  it("ensures keyboard navigation and aria-label audit across interactive HUD buttons", () => {
    render(<GameHUD {...dummyProps} />);

    expect(screen.getByLabelText("Charakter öffnen")).toBeDefined();
    expect(screen.getByLabelText("Charakter")).toBeDefined();
    expect(screen.getByLabelText("Inventar")).toBeDefined();
    expect(screen.getByLabelText("Handwerk")).toBeDefined();
    expect(screen.getByLabelText("Aufträge")).toBeDefined();
    expect(screen.getByLabelText("Weltatlas")).toBeDefined();
    expect(screen.getByLabelText("Realm Chat öffnen")).toBeDefined();
    expect(screen.getByLabelText("Auto-Loot umschalten")).toBeDefined();
    expect(screen.getByLabelText("Interaktion ausführen")).toBeDefined();
    expect(screen.getByLabelText("Auto-Angriff umschalten")).toBeDefined();
    expect(screen.getByLabelText("Steuerung öffnen")).toBeDefined();
    expect(screen.getByLabelText("Standard-Angriff ausführen")).toBeDefined();
  });

  it("supports Freie Sicht (free view / uncluttered sight) toggle via button and keyboard shortcut", () => {
    render(<GameHUD {...dummyProps} party={sampleParty} companion={sampleCompanion} />);
    const toggleBtn = screen.getByLabelText("Freie Sicht umschalten");
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("Gruppe und Partner Status")).toBeDefined();

    // Click toggle button -> activates free view mode
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Gruppe und Partner Status")).toBeNull();

    // Press 'v' on window -> toggles back to normal view
    fireEvent.keyDown(window, { key: "v" });
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("Gruppe und Partner Status")).toBeDefined();
  });

  it("toggles the Active Quests panel showing mission objectives and completion percentages", () => {
    const sampleObjectives = [
      {
        id: "prim_1",
        label: "Das Erwachen der Resonanz",
        detail: "Finde die 3 Uralten Sphären und synchronisiere die Aurion-Welle.",
        kind: "primary" as const,
        progress: 0.75,
        subtasks: ["Erste Sphäre bergen", "Wächter besiegen", "Resonanz ausrichten"],
      },
      {
        id: "enc_2",
        label: "Schattenpirscher im Windhollow",
        detail: "Neutralisiere die korrumpierende Entität.",
        kind: "encounter" as const,
        progress: 0.5,
        subtasks: ["Spuren sichern", "Pirscher bezwingen"],
      },
      {
        id: "npc_3",
        label: "Botschaft an die Observatorin",
        detail: "Überbringe die Charta an Elia.",
        kind: "npc" as const,
        completed: true,
        progress: 1,
      },
    ];

    render(<GameHUD {...dummyProps} objectives={sampleObjectives} />);

    // Active quests panel is closed initially
    expect(screen.queryByTestId("active-quests-panel")).toBeNull();

    // Click on PANEL [O] button in the HUD objectives header
    const panelBtn = screen.getByLabelText("Aktives Quest Panel öffnen");
    expect(panelBtn).toBeDefined();
    fireEvent.click(panelBtn);

    // Active Quests panel is now visible
    const questModal = screen.getByTestId("active-quests-panel");
    expect(questModal).toBeDefined();
    const modal = within(questModal);
    expect(modal.getByText("Aktive Quests & Missionsziele")).toBeDefined();

    // Verify mission objectives and percentage display
    expect(modal.getByText("Das Erwachen der Resonanz")).toBeDefined();
    expect(modal.getAllByText("75%").length).toBeGreaterThanOrEqual(1);
    expect(modal.getByText("Schattenpirscher im Windhollow")).toBeDefined();
    expect(modal.getByText("50%")).toBeDefined();
    expect(modal.getByText("Botschaft an die Observatorin")).toBeDefined();
    expect(modal.getByText("100%")).toBeDefined();

    // Close via close button
    const closeBtn = modal.getByLabelText("Panel schließen");
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId("active-quests-panel")).toBeNull();

    // Test toggle with keyboard shortcut 'o'
    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByTestId("active-quests-panel")).toBeDefined();

    // Toggle again with keyboard shortcut 'o' to close
    fireEvent.keyDown(window, { key: "o" });
    expect(screen.queryByTestId("active-quests-panel")).toBeNull();
  });
});
