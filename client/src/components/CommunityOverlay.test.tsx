import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import CommunityOverlay from "./CommunityOverlay";
import { RealClientHarness } from "@/test/realClientHarness";

describe("CommunityOverlay", () => {
  it("offers only Aurion social/read-only areas and no gameplay economy controls", () => {
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} /></RealClientHarness>);
    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Community-Events öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Asset-Katalog öffnen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Schmiede|Handel|Partnergesuche|Auktionshaus/i })).toBeNull();
  });

  it("shows the public asset catalog as read-only", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: "Asset-Katalog öffnen" }));
    expect(await screen.findByText(/Öffentlicher Aurion-Katalog · nur lesend/)).toBeTruthy();
    expect(screen.queryByLabelText(/Datei auswählen/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Als Charakter wählen|Ausrüsten|Hochladen/i })).toBeNull();
  });

  it("rejects old gameplay/economy panel events instead of executing them", () => {
    render(<RealClientHarness><CommunityOverlay isAuthenticated currentUserId={42} /></RealClientHarness>);
    fireEvent(window, new CustomEvent("aurion:open-community", { detail: { panel: "crafting" } }));
    expect(screen.getByText(/gehört nicht zur Aurion-Communityfläche/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Sternwartenschmiede/i })).toBeNull();
  });

  it("keeps events in the forum-backed community surface", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: "Community-Events öffnen" }));
    expect(await screen.findByRole("heading", { name: "Community-Events" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Events" }).getAttribute("aria-pressed")).toBe("true");
  });
});
