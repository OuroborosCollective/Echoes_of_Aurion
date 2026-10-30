import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import CommunityOverlay from "./CommunityOverlay";
import { RealClientHarness } from "@/test/realClientHarness";
import { getQueryKey } from "@trpc/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

// Synthetic cache fixture; the real HTTP/browser boundary also runs in CI.
function SelectedForumFixture() {
  const cache = useQueryClient();
  React.useEffect(() => {
    cache.setQueryData(getQueryKey(trpc.community.forum.list, { category: "announcements" }, "query"), [
      { id: "test-thread", title: "Vorherige Ankündigung", authorName: "Test", authorUserId: 1 },
    ]);
    cache.setQueryData(getQueryKey(trpc.community.forum.get, { threadId: "test-thread" }, "query"), {
      id: "test-thread", title: "Vorherige Ankündigung", body: "Alter Threadinhalt", authorName: "Test", authorUserId: 1, replies: [],
    });
  }, [cache]);
  return null;
}

describe("CommunityOverlay", () => {
  it("opens issue reports from a selected thread and restores focus to the dock", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><SelectedForumFixture /><CommunityOverlay isAuthenticated /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: "Forum öffnen" }));
    await user.click(await screen.findByRole("button", { name: /Vorherige Ankündigung/ }));
    expect(await screen.findByText("Alter Threadinhalt")).toBeTruthy();
    const issues = screen.getByRole("button", { name: "Fehlerberichte öffnen" });
    await user.click(issues);
    const dialog = await screen.findByRole("dialog", { name: "Fehlerberichte" });
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(screen.queryByText("Alter Threadinhalt")).toBeNull();
    expect(screen.getByRole("heading", { name: "Fehler melden" })).toBeTruthy();
    expect(issues.getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Community-Konsole schließen" }));
    expect(document.activeElement).toBe(issues);
  });

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

  it("exposes deterministic accessibility state for community dock and icon-only controls", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated /></RealClientHarness>);
    const chat = screen.getByRole("button", { name: "Expeditionschat öffnen" });
    const forum = screen.getByRole("button", { name: "Forum öffnen" });
    const assets = screen.getByRole("button", { name: "Asset-Katalog öffnen" });
    expect(chat.getAttribute("aria-pressed")).toBe("false");
    expect(forum.getAttribute("aria-pressed")).toBe("false");
    expect(assets.getAttribute("aria-pressed")).toBe("false");

    await user.click(forum);
    expect(screen.getByRole("button", { name: "Forum öffnen" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(await screen.findByRole("dialog", { name: "Sternwartenforum" }));
    await user.click(screen.getByRole("button", { name: "Community-Events öffnen" }));
    const eventsDialog = await screen.findByRole("dialog", { name: "Community-Events" });
    await waitFor(() => expect(document.activeElement).toBe(eventsDialog));
    expect(screen.getByRole("button", { name: "Community-Konsole schließen" }).getAttribute("title")).toBe("Community-Konsole schließen");
  });

  it("keeps events in the forum-backed community surface", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: "Community-Events öffnen" }));
    const dialog = await screen.findByRole("dialog", { name: "Community-Events" });
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByRole("button", { name: "Events" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Community-Konsole schließen" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Community-Events öffnen" }));
  });
  it("opens a read-only anonymous leaderboard panel for guests", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} /></RealClientHarness>);
    const button = screen.getByRole("button", { name: "Rangliste öffnen" });
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Saison-Rangliste" });
    expect(dialog).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(screen.getByText("Sortiert nach bestätigten Saisonpunkten, Siegen und Stufe.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ausrüsten|Hochladen/i })).toBeNull();
  });

});
