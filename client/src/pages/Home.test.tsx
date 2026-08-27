import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import Home from "./Home";
import { RealClientHarness } from "@/test/realClientHarness";

describe("Home", () => {
  it("priorisiert für Gäste die Kontoerstellung statt eines Solo- oder MCP-Einstiegs", () => {
    window.history.replaceState({}, "", "/?aurion_runtime=no-webgl");
    render(<RealClientHarness><Home /></RealClientHarness>);

    expect(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Konto erforderlich", { exact: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/i })).toBeNull();
    expect(screen.queryByText(/OPTIONAL: MCP-PARTNER VERBINDEN/i)).toBeNull();
    expect(screen.queryByText(/KOOP-VERBINDUNG ERFORDERLICH/i)).toBeNull();
  });

  it("öffnet über den bestehenden Konto-CTA den sicheren Authdialogvertrag", async () => {
    window.history.replaceState({}, "", "/?aurion_runtime=no-webgl");
    const user = userEvent.setup();
    let openRequests = 0;
    const onOpen = () => { openRequests += 1; };
    window.addEventListener("aurion:open-local-auth", onOpen);
    try {
      render(<RealClientHarness><Home /></RealClientHarness>);
      await user.click(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i })[0]!);
      expect(openRequests).toBe(1);
      expect(screen.queryByRole("heading", { name: /Setze den Resonanzkurs/i })).toBeNull();
    } finally {
      window.removeEventListener("aurion:open-local-auth", onOpen);
    }
  });
});
