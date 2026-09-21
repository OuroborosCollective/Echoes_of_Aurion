import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GuildBankDashboardSummary from "./GuildBankDashboardSummary";
import type { GuildBankDashboardSummary as DashboardData } from "@shared/guildBankView";

describe("GuildBankDashboardSummary", () => {
  const mockSummary: DashboardData = {
    resources: {
      wood: "450",
      stone: "320",
      aether: "180",
      treasuryPoints: "2500",
      lifetimeWoodDonated: "1200",
      lifetimeStoneDonated: "980",
      lifetimeAetherDonated: "450",
      lifetimePointsDeposited: "6000",
      totalVaultItems: 8,
      buildingInvestmentPoints: "1500",
    },
    memberStats: [
      {
        userId: 1,
        name: "Eldrin Sternsucher",
        role: "founder",
        contributionPoints: 1250,
        activityCount: 42,
        bankTransactionsCount: 15,
      },
      {
        userId: 2,
        name: "Lyra Mondschatten",
        role: "officer",
        contributionPoints: 890,
        activityCount: 28,
        bankTransactionsCount: 9,
      },
      {
        userId: 3,
        name: "Goran Felsenbrecher",
        role: "member",
        contributionPoints: 430,
        activityCount: 14,
        bankTransactionsCount: 4,
      },
    ],
    activityBreakdown: [
      { category: "expedition", label: "Expeditionen", points: 800, count: 25 },
      { category: "quest", label: "Quests", points: 650, count: 18 },
      { category: "resource_donation", label: "Ressourcenspenden", points: 520, count: 20 },
      { category: "combat", label: "Kampf & Dungeons", points: 600, count: 21 },
    ],
    totalActiveMembers: 3,
    totalGuildContributionPoints: 2570,
    totalBankReceiptsCount: 28,
  };

  it("renders KPI cards with correct values", () => {
    render(
      <GuildBankDashboardSummary
        summary={mockSummary}
        treasuryBalanceExact="2500"
        resourceBalancesExact={{ wood: "450", stone: "320", aether: "180" }}
        heldItemsCount={8}
      />
    );

    // KPI Cards
    expect(screen.getByText("Gildenkasse")).toBeTruthy();
    expect(screen.getByText("Tresor-Gegenstände")).toBeTruthy();
    expect(screen.getByText("Aktive Mitglieder")).toBeTruthy();
    expect(screen.getByText("Ausbau-Investition")).toBeTruthy();

    // Resource Stockpiles
    expect(screen.getByText("Bauholz (Oak)")).toBeTruthy();
    expect(screen.getByText("Sandstein & Granit")).toBeTruthy();
    expect(screen.getByText("Ätherstaub & Essenzen")).toBeTruthy();
  });

  it("switches to Member Activities tab and displays leaderboard", () => {
    render(
      <GuildBankDashboardSummary
        summary={mockSummary}
        treasuryBalanceExact="2500"
        resourceBalancesExact={{ wood: "450", stone: "320", aether: "180" }}
        heldItemsCount={8}
      />
    );

    const activityTab = screen.getByRole("tab", { name: /Mitglieder-Aktivität/i });
    fireEvent.click(activityTab);

    // Leaderboard entries
    expect(screen.getByText("Eldrin Sternsucher")).toBeTruthy();
    expect(screen.getByText("Gründer")).toBeTruthy();
    expect(screen.getByText("1.250 Pkt")).toBeTruthy();

    expect(screen.getByText("Lyra Mondschatten")).toBeTruthy();
    expect(screen.getByText("Offizier")).toBeTruthy();
    expect(screen.getByText("890 Pkt")).toBeTruthy();

    expect(screen.getByText("Goran Felsenbrecher")).toBeTruthy();
    expect(screen.getByText("Mitglied")).toBeTruthy();
    expect(screen.getByText("430 Pkt")).toBeTruthy();
  });

  it("renders gracefully with default empty summary", () => {
    render(
      <GuildBankDashboardSummary
        treasuryBalanceExact="0"
        resourceBalancesExact={{ wood: "0", stone: "0", aether: "0" }}
        heldItemsCount={0}
      />
    );

    expect(screen.getByText("Expeditions-Zentrale & Ressourcen-Akkumulation")).toBeTruthy();
    expect(screen.getByText("Gildenkasse")).toBeTruthy();
  });
});
