import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import Home from "./Home";
import { RealClientHarness } from "@/test/realClientHarness";

describe("Home", () => {
  it("prioritizes account/community and renders no gameplay for guests", async () => {
    window.history.replaceState({}, "", "/");
    render(<RealClientHarness><Home /></RealClientHarness>);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i }).length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: /Eine Welt, die nicht auf dich wartet\./i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /SPIEL BETRETEN/i })).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.getByRole("button", { name: "Asset-Katalog" })).toBeTruthy();
    expect(screen.getByText("NPCs mit eigenem Leben")).toBeTruthy();
  });

  it("opens only the account authentication contract from the account CTA", async () => {
    const user = userEvent.setup();
    let openRequests = 0;
    const onOpen = () => { openRequests += 1; };
    window.addEventListener("aurion:open-local-auth", onOpen);
    try {
      render(<RealClientHarness><Home /></RealClientHarness>);
      let accountButton: HTMLButtonElement | null = null;
      await waitFor(() => {
        accountButton = screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i })[0]! as HTMLButtonElement;
        expect(accountButton.disabled).toBe(false);
      });
      if (accountButton) await user.click(accountButton);
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

  it("gates tactile transforms behind the user's reduced-motion preference", async () => {
    render(<RealClientHarness><Home /></RealClientHarness>);
    await waitFor(() => {
      const accountButton = screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i })[0];
      expect(accountButton).toBeTruthy();
      if (accountButton) {
        expect(accountButton.className).toContain("motion-safe:hover:-translate-y-0.5");
        expect(accountButton.className).toContain("motion-safe:active:scale-95");
        expect(accountButton.className).not.toContain(" hover:-translate-y-0.5");
        expect(accountButton.className).not.toContain(" active:scale-95");
      }
    });
  });

  it("exposes the living-cinematic presentation hooks without changing the play/auth contract", async () => {
    render(<RealClientHarness><Home /></RealClientHarness>);
    await waitFor(() => {
      const root = document.querySelector(".aurion-cinematic-home");
      const hero = document.querySelector(".cinematic-hero");
      expect(root).toBeTruthy();
      expect(hero).toBeTruthy();
      expect(document.querySelector(".cinematic-hero__art")).toBeTruthy();
      expect(document.querySelector(".cinematic-hero__aether")).toBeTruthy();
      expect(document.querySelector(".cinematic-hero__vignette")).toBeTruthy();
      expect(document.querySelector(".cinematic-world-panel")).toBeTruthy();
      expect(document.querySelector(".cinematic-feature-grid")).toBeTruthy();
      expect(document.querySelector(".cinematic-process")).toBeTruthy();
      expect(document.querySelector(".cinematic-cta")).toBeTruthy();
      expect(screen.getByRole("heading", { name: /Eine Welt, die nicht auf dich wartet\./i })).toBeTruthy();
    });
  });
});
