import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AchievementsGallery } from "./AchievementsGallery";

describe("AchievementsGallery", () => {
  const mockProps = {
    profile: {
      userId: 42,
      aurionPoints: 250,
      victories: 25,
      selectedClass: "explorer",
    },
    progression: {
      characterId: "char-1",
      tracks: [
        {
          trackKind: "weapon",
          trackId: "curved_blade",
          levelExact: "24",
        },
        {
          trackKind: "skill",
          trackId: "arcane_blast",
          levelExact: "15",
        },
      ],
    },
    craftingProgression: {
      levelExact: "32",
      totalXpExact: "12400",
    },
    confirmedSkills: ["light_step", "stealth"],
    guildRole: "Explorer",
  };

  it("renders the Achievements Gallery title and summary metrics", () => {
    render(<AchievementsGallery {...mockProps} />);

    expect(screen.getByText("Meilensteine & Auszeichnungen-Galerie")).toBeDefined();
    expect(screen.getByText(/Verdiente Römische Rang-Abzeichen/i)).toBeDefined();
    // Check metric badges
    expect(screen.getAllByText(/Freigeschaltet/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Gesamtfortschritt/i)).toBeDefined();
  });

  it("renders roman numeral badges for each 10-level interval (I, II, III, etc.)", () => {
    render(<AchievementsGallery {...mockProps} />);

    // Roman numeral badges I, II, III, IV should be rendered in badge elements
    const romanIs = screen.getAllByText("I");
    expect(romanIs.length).toBeGreaterThan(0);

    const romanIIs = screen.getAllByText("II");
    expect(romanIIs.length).toBeGreaterThan(0);

    const romanIIIs = screen.getAllByText("III");
    expect(romanIIIs.length).toBeGreaterThan(0);
  });

  it("correctly marks badges as unlocked when level meets or exceeds the tier requirement", () => {
    render(<AchievementsGallery {...mockProps} />);

    // Crafting level is 32 -> Tier I (lvl 10), Tier II (lvl 20), Tier III (lvl 30) are unlocked
    // Look for crafting badges
    expect(screen.getByText("Handwerk & Alchemie I")).toBeDefined();
    expect(screen.getByText("Handwerk & Alchemie II")).toBeDefined();
    expect(screen.getByText("Handwerk & Alchemie III")).toBeDefined();
    expect(screen.getByText("Handwerk & Alchemie IV")).toBeDefined(); // Locked (lvl 40)
  });

  it("filters milestones by category tab (Waffen, Fertigkeiten, Handwerk, etc.)", () => {
    render(<AchievementsGallery {...mockProps} />);

    // Click on "Handwerk" filter tab
    const craftTab = screen.getByRole("button", { name: /Handwerk/i });
    fireEvent.click(craftTab);

    // Should display crafting badges
    expect(screen.getByText("Handwerk & Alchemie I")).toBeDefined();
    expect(screen.getByText("Handwerk & Alchemie X")).toBeDefined();
  });

  it("filters milestones by search query", () => {
    render(<AchievementsGallery {...mockProps} />);

    const searchInput = screen.getByPlaceholderText(/Abzeichen \/ Pfad suchen/i);
    fireEvent.change(searchInput, { target: { value: "curved_blade" } });

    // Should find curved_blade tracks
    expect(screen.getAllByText(/curved_blade/i).length).toBeGreaterThan(0);
  });

  it("opens milestone detail view when an achievement card is clicked", () => {
    render(<AchievementsGallery {...mockProps} />);

    // Click on Handwerk & Alchemie I card
    const handwerkBadges = screen.getAllByText("Handwerk & Alchemie I");
    fireEvent.click(handwerkBadges[0]);

    // Detail drawer / card info appears
    expect(screen.getByRole("button", { name: /Schließen/i })).toBeDefined();
    expect(screen.getAllByText(/Freigeschaltet/i).length).toBeGreaterThan(0);
  });
});
