import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AurionCommunityHost from "./AurionCommunityHost";
import { RealClientHarness } from "@/test/realClientHarness";

let mockAuthState = {
  user: null as { id: number; name?: string } | null,
  isAuthenticated: false,
};

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

function AppSurfaceHarness({
  location,
  isAuthenticated = false,
  userId,
}: {
  location: string;
  isAuthenticated?: boolean;
  userId?: number;
}) {
  mockAuthState = {
    user: userId ? { id: userId, name: `Explorer ${userId}` } : null,
    isAuthenticated,
  };

  // Replicates the canonical websiteSurface state logic from App.tsx:
  // const websiteSurface = location !== "/play";
  const websiteSurface = location !== "/play";

  return (
    <RealClientHarness>
      <div data-testid="app-root">
        <div data-testid="location-indicator">{location}</div>
        {websiteSurface && <AurionCommunityHost />}
      </div>
    </RealClientHarness>
  );
}

describe("AurionCommunityHost & websiteSurface state logic", () => {
  beforeEach(() => {
    mockAuthState = { user: null, isAuthenticated: false };
    window.dispatchEvent(new CustomEvent("aurion:return-to-tower"));
  });

  it("renders AurionCommunityHost on website surface (location !== '/play')", () => {
    render(<AppSurfaceHarness location="/" />);

    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Community-Events öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Asset-Katalog öffnen" })).toBeTruthy();
  });

  it("renders AurionCommunityHost on /community and /account website routes", () => {
    const { rerender } = render(<AppSurfaceHarness location="/community" />);
    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();

    rerender(<AppSurfaceHarness location="/account" />);
    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();
  });

  it("does NOT render AurionCommunityHost when websiteSurface is false (location === '/play')", () => {
    render(<AppSurfaceHarness location="/play" />);

    expect(screen.queryByRole("button", { name: "Forum öffnen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Community-Events öffnen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Asset-Katalog öffnen" })).toBeNull();
  });

  it("dynamically reacts to websiteSurface state transitions between gameplay and website surfaces", () => {
    const { rerender } = render(<AppSurfaceHarness location="/" />);
    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();

    // Transition to gameplay surface (/play)
    rerender(<AppSurfaceHarness location="/play" />);
    expect(screen.queryByRole("button", { name: "Forum öffnen" })).toBeNull();

    // Transition back to website surface (/ops)
    rerender(<AppSurfaceHarness location="/ops" />);
    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();
  });

  it("passes authenticated user context from useAuth to the underlying CommunityOverlay", () => {
    render(<AppSurfaceHarness location="/" isAuthenticated={true} userId={77} />);

    expect(screen.getByRole("button", { name: "Forum öffnen" })).toBeTruthy();
    expect(mockAuthState.isAuthenticated).toBe(true);
    expect(mockAuthState.user?.id).toBe(77);
  });

  it("reacts to aurion:open-community events when hosted on website surface", async () => {
    render(<AppSurfaceHarness location="/" isAuthenticated={true} userId={42} />);

    fireEvent(window, new CustomEvent("aurion:open-community", { detail: { panel: "forum" } }));
    expect(await screen.findByRole("heading", { name: "Sternwartenforum" })).toBeTruthy();
  });

  it("reacts to aurion:return-to-tower events to reset open community panels", async () => {
    render(<AppSurfaceHarness location="/" isAuthenticated={true} userId={42} />);

    fireEvent(window, new CustomEvent("aurion:open-community", { detail: { panel: "forum" } }));
    expect(await screen.findByRole("heading", { name: "Sternwartenforum" })).toBeTruthy();

    fireEvent(window, new CustomEvent("aurion:return-to-tower"));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Sternwartenforum" })).toBeNull();
    });
  });
});
