import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import Home from "./Home";
import { RealClientHarness } from "@/test/realClientHarness";

describe("Home", () => {
  it("priorisiert für Gäste Konto und Community statt Gameplay", () => {
    window.history.replaceState({}, "", "/");
    render(<RealClientHarness><Home /></RealClientHarness>);

    expect(screen.getAllByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Konto erforderlich", { exact: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/i })).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.getByRole("button", { name: "GLB-Einreichung öffnen", exact: true })).toBeTruthy();
  });

  it("öffnet über den Konto-CTA ausschließlich den sicheren Authvertrag", async () => {
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

  it("owns no AX1 return bridge or legacy gameplay request handler", () => {
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
