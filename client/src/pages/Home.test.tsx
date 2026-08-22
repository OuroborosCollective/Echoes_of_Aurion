import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import Home from "./Home";
import { RealClientHarness } from "@/test/realClientHarness";

describe("Home", () => {
  it("führt einen Gast ohne LLM oder menschliches Team in das Solo-Loadout", async () => {
    window.history.replaceState({}, "", "/?aurion_runtime=no-webgl");
    const user = userEvent.setup();
    render(<RealClientHarness><Home /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/i }));
    expect(await screen.findByRole("heading", { name: /Setze den Resonanzkurs/i })).toBeTruthy();
    expect(screen.getByText("SOLO // ECHO-AUTOMATIK", { exact: true })).toBeTruthy();
  });

  it("macht die echte Kontoerstellung bereits am Startzugang auffindbar", () => {
    window.history.replaceState({}, "", "/?aurion_runtime=no-webgl");
    render(<RealClientHarness><Home /></RealClientHarness>);
    expect(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i }).length).toBeGreaterThan(0);
  });
});
