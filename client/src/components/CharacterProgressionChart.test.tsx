import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterProgressionChart } from "./CharacterProgressionChart";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("CharacterProgressionChart", () => {
  it("renders progression analytics card and radar chart controls", () => {
    render(
      <CharacterProgressionChart
        profile={{
          userId: 1,
          aurionPoints: 240,
          victories: 8,
          selectedClass: "unbound",
        }}
        progression={{
          characterId: "char-123",
          tracks: [
            {
              trackKind: "weapon",
              trackId: "aurion_spear",
              levelExact: "4",
            },
            {
              trackKind: "skill",
              trackId: "solar_ward",
              levelExact: "3",
            },
          ],
        }}
        craftingProgression={{
          levelExact: "5",
          totalXpExact: "1250",
        }}
        confirmedSkills={["solar_ward", "light_strike"]}
        guildRole="Captain"
      />
    );

    expect(screen.getByText("Charakter-Statistiken & Progression")).toBeDefined();
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.getByText("240")).toBeDefined();
    expect(screen.getByText("Stufe 5")).toBeDefined();
    expect(screen.getByText("Radar-Diagramm")).toBeDefined();
    expect(screen.getByText("Stufen-Balken")).toBeDefined();
  });

  it("allows switching between radar view and bars view", async () => {
    const user = userEvent.setup();
    render(
      <CharacterProgressionChart
        profile={{
          userId: 1,
          aurionPoints: 100,
          victories: 2,
        }}
        progression={{
          tracks: [
            {
              trackKind: "weapon",
              trackId: "blade_resonance",
              levelExact: "2",
            },
          ],
        }}
      />
    );

    const barsBtn = screen.getByRole("button", { name: /Stufen-Balken/i });
    await user.click(barsBtn);
    expect(screen.getByText("Stufen-Balken")).toBeDefined();

    const radarBtn = screen.getByRole("button", { name: /Radar-Diagramm/i });
    await user.click(radarBtn);
    expect(screen.getByText("Radar-Diagramm")).toBeDefined();
  });

  it("handles empty or missing profile and progression gracefully", () => {
    render(
      <CharacterProgressionChart
        profile={null}
        progression={null}
        craftingProgression={null}
      />
    );

    expect(screen.getByText("Charakter-Statistiken & Progression")).toBeDefined();
    expect(screen.getByText("Fortschritts-Balken")).toBeDefined();
  });

  it("triggers level-up animation when test level up button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CharacterProgressionChart
        profile={{ userId: 1, aurionPoints: 50, victories: 1 }}
      />
    );

    const levelUpBtn = screen.getByRole("button", { name: /Level-Up Pulsieren/i });
    expect(levelUpBtn).toBeDefined();

    await user.click(levelUpBtn);
    expect(screen.getByText(/LEVEL UP!/i)).toBeDefined();
  });
});
