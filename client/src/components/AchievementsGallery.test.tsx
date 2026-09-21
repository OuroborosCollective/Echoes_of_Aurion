import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AchievementsGallery } from "./AchievementsGallery";

describe("truth-bound achievements gallery", () => {
  it("does not invent fallback tracks when evidence is absent", () => {
    render(<AchievementsGallery />);
    expect(screen.getByTestId("achievements-no-evidence")).toBeTruthy();
    expect(screen.queryByText(/Aurion-Speer/i)).toBeNull();
    expect(screen.queryByText(/Sonnenschutz/i)).toBeNull();
  });

  it("derives milestones only from supplied confirmed readbacks", () => {
    render(<AchievementsGallery
      profile={{ victories: 25, aurionPoints: 120 }}
      progression={{ tracks: [{ trackKind: "weapon", trackId: "curved_blade", levelExact: "24" }] }}
      craftingProgression={{ levelExact: "32", totalXpExact: "12400" }}
    />);
    expect(screen.getByText("Waffe: curved_blade I")).toBeTruthy();
    expect(screen.getByText("Waffe: curved_blade II")).toBeTruthy();
    expect(screen.getByText("Handwerk & Alchemie III")).toBeTruthy();
    expect(screen.queryByText(/Aurion-Speer/i)).toBeNull();
  });

  it("filters to reached milestones without changing source data", () => {
    render(<AchievementsGallery profile={{ victories: 5, aurionPoints: 50 }} />);
    fireEvent.click(screen.getByRole("button", { name: /Nur erreicht/i }));
    expect(screen.getByText("Aurion-Punkte I")).toBeTruthy();
    expect(screen.queryByText("Kampfsiege I")).toBeNull();
  });
});
