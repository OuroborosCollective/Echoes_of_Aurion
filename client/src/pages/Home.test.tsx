import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import Home from "./Home";
import { RealClientHarness } from "@/test/realClientHarness";

describe("Home", () => {
  it("prioritizes account/community and renders no gameplay for guests", () => {
    window.history.replaceState({}, "", "/");
    render(<RealClientHarness><Home /></RealClientHarness>);
    expect(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Dein Zugang zu Echoes of Aurion/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /SPIEL BETRETEN/i })).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.getByRole("button", { name: "GLB-Einreichung öffnen" })).toBeTruthy();
    expect(screen.queryByText(/Markt|Crafting|Boss|Questgeber/i)).toBeNull();
  });

  it("opens only the account authentication contract from the account CTA", async () => {
    const user = userEvent.setup();
    let openRequests = 0;
    const onOpen = () => { openRequests += 1; };
    window.addEventListener("aurion:open-local-auth", onOpen);
    try {
      render(<RealClientHarness><Home /></RealClientHarness>);
      await user.click(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i })[0]!);
      expect(openRequests).toBe(1);
      expect(document.querySelector("canvas")).toBeNull();
    } finally {
      window.removeEventListener("aurion:open-local-auth", onOpen);
    }
  });

  it("owns neither AX1 return nor legacy gameplay action handlers", () => {
    render(<RealClientHarness><Home /></RealClientHarness>);
    let returns = 0;
    const returned = () => { returns += 1; };
    window.addEventListener("aurion:return-to-tower", returned);
    try {
      fireEvent(window, new Event("aurion:xaurion-return-request"));
      fireEvent(window, new CustomEvent("aurion:request-action", { detail: { command: "F" } }));
      expect(returns).toBe(0);
      expect(document.querySelector("canvas")).toBeNull();
    } finally {
      window.removeEventListener("aurion:return-to-tower", returned);
    }
  });
});
