import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it } from "vitest";
import CommunityOverlay from "./CommunityOverlay";
import { RealClientHarness } from "@/test/realClientHarness";

describe("CommunityOverlay", () => {
  it("zeigt Gästen nach dem Öffnen ausschließlich den öffentlichen Assetzugang", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} currentUserId={undefined} onTeamReady={() => undefined} onTeamCleared={() => undefined} starterCharacterId="wayfinder" onStarterCharacterSelected={() => undefined} /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: "GLB-Einreichung öffnen" }));
    expect(await screen.findByText("Öffentlicher Aurion-Katalog")).toBeTruthy();
    expect(screen.queryByLabelText(/Datei auswählen/i)).toBeNull();
  });
});
