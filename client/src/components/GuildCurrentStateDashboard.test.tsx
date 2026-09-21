import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GuildCurrentStateDashboard from "./GuildCurrentStateDashboard";

describe("truth-bound guild current-state dashboard", () => {
  it("renders only confirmed current-state values", () => {
    render(<GuildCurrentStateDashboard
      treasuryBalanceExact="2500"
      resourceBalancesExact={{ wood: "450", stone: "320", aether: "180" }}
      heldItemsCount={8}
      buildingOptions={[{ buildingId:"bld_citadel", levelExact:"2", maximumLevelExact:"5", canUpgrade:true }]}
    />);
    expect(screen.getByText("2500 AURION")).toBeTruthy();
    expect(screen.getByText("8 Items")).toBeTruthy();
    expect(screen.getByText(/Stufe 2\/5/)).toBeTruthy();
    expect(screen.queryByText(/Gesamt eingezahlt/i)).toBeNull();
    expect(screen.queryByText(/Mitglieder-Aktivität/i)).toBeNull();
  });

  it("does not turn malformed evidence into a number", () => {
    render(<GuildCurrentStateDashboard
      treasuryBalanceExact="not-confirmed"
      resourceBalancesExact={{ wood: "0", stone: "0", aether: "0" }}
      heldItemsCount={0}
      buildingOptions={[]}
    />);
    expect(screen.getByText("— AURION")).toBeTruthy();
  });
});
