import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RealClientHarness } from "@/test/realClientHarness";
import CausalStudioDashboard from "./CausalStudioDashboard";

describe("Causal Studio form accessibility", () => {
  it("associates each label with its own input even with two dashboard instances", () => {
    render(<RealClientHarness><CausalStudioDashboard /><CausalStudioDashboard /></RealClientHarness>);
    const zones = screen.getAllByLabelText("Zone");
    const ticks = screen.getAllByLabelText("Tick");
    expect(zones).toHaveLength(2);
    expect(ticks).toHaveLength(2);
    expect(new Set([...zones, ...ticks].map(input => input.id)).size).toBe(4);
    expect(screen.getAllByRole("textbox", { name: "Search checkpoints" })).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: "Export diagnostic JSON" })) {
      expect(button.title).toBe("Export diagnostic JSON");
    }
    for (const button of screen.getAllByRole("button", { name: "Verify Tick" })) {
      expect(button.getAttribute("aria-busy")).toBe("false");
    }
  });
});
