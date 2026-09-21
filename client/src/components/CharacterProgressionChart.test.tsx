import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterProgressionChart, exactProgressionRows } from "./CharacterProgressionChart";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("CharacterProgressionChart", () => {
  it("preserves exact confirmed levels without synthesizing scores", () => {
    const rows = exactProgressionRows({
      progression: { tracks: [
        { trackKind: "weapon", trackId: "curved_blade", levelExact: "24" },
        { trackKind: "skill", trackId: "arcane_blast", levelExact: 15 },
      ] },
      craftingProgression: { levelExact: "32", totalXpExact: "12400" },
    });
    expect(rows.map(row => [row.id, row.level])).toEqual([
      ["skill:arcane_blast", 15],
      ["crafting:confirmed", 32],
      ["weapon:curved_blade", 24],
    ]);
  });

  it("drops malformed levels instead of inventing fallback level one", () => {
    expect(exactProgressionRows({
      progression: { tracks: [
        { trackKind: "weapon", trackId: "bad", levelExact: "not-a-number" },
      ] },
      craftingProgression: { levelExact: "-1", totalXpExact: "0" },
    })).toEqual([]);
  });

  it("renders exact readbacks and explicitly states the non-authority boundary", () => {
    render(<CharacterProgressionChart
      profile={{ victories: 8, aurionPoints: 240 }}
      progression={{ tracks: [
        { trackKind: "weapon", trackId: "aurion_spear", levelExact: "4" },
        { trackKind: "skill", trackId: "solar_ward", levelExact: "3" },
      ] }}
      craftingProgression={{ levelExact: "5", totalXpExact: "1250" }}
    />);
    expect(screen.getByText("Charakter-Progression")).toBeDefined();
    expect(screen.getByText(/Keine Gesamtlevel-, Power- oder Resonanz-Scores werden erfunden/)).toBeDefined();
    expect(screen.getByText("Stufe 4")).toBeDefined();
    expect(screen.getByText("Stufe 3")).toBeDefined();
    expect(screen.getByText("Stufe 5")).toBeDefined();
    expect(screen.getByText("1250")).toBeDefined();
  });

  it("shows a truthful empty state when no confirmed progression exists", () => {
    render(<CharacterProgressionChart profile={null} progression={null} craftingProgression={null} />);
    expect(screen.getByTestId("progression-no-evidence")).toBeDefined();
  });
});
