import { render, screen, fireEvent } from "@testing-library/react";
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

  it("verdichtet die mobilen Gemeinschaftsfunktionen zu einem zugänglichen Menü ohne Funktionsverlust", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated={false} currentUserId={undefined} onTeamReady={() => undefined} onTeamCleared={() => undefined} starterCharacterId="wayfinder" onStarterCharacterSelected={() => undefined} /></RealClientHarness>);
    const toggle = screen.getByRole("button", { name: "GEMEINSCHAFT" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Sternwartenschmiede öffnen" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "GLB-Einreichung öffnen" }));
    expect(await screen.findByText("Öffentlicher Aurion-Katalog")).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("zeigt die Schmiedefunktion als serverbestätigten Craftingpfad an", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated currentUserId={42} onTeamReady={() => undefined} onTeamCleared={() => undefined} starterCharacterId="wayfinder" onStarterCharacterSelected={() => undefined} /></RealClientHarness>);
    await user.click(screen.getByRole("button", { name: "Sternwartenschmiede öffnen" }));
    expect(await screen.findByRole("heading", { name: "Sternwartenschmiede" })).toBeTruthy();
    expect(screen.getByText(/Du benötigst einen eigenen Speer und erhältst 6 Handwerks-EP/i)).toBeTruthy();
    expect(screen.getByText("DEINE MATERIALIEN")).toBeTruthy();
  });
  it("mounts world-opened controls above the world portal and retires that layer on close", async () => {
    const user=userEvent.setup();
    render(<RealClientHarness><CommunityOverlay isAuthenticated currentUserId={42} onTeamReady={()=>undefined} onTeamCleared={()=>undefined} starterCharacterId="wayfinder" onStarterCharacterSelected={()=>undefined}/></RealClientHarness>);
    fireEvent(window,new CustomEvent("aurion:open-community",{detail:{panel:"crafting"}}));
    await screen.findByRole("heading",{name:"Sternwartenschmiede"});
    expect(screen.getByRole("complementary",{name:"Aurion Gemeinschaft"}).parentElement).toBe(document.body);
    await user.click(screen.getByRole("button",{name:"Community-Konsole schließen"}));
    expect(screen.getByRole("complementary",{name:"Aurion Gemeinschaft"}).parentElement).not.toBe(document.body);
    expect(screen.queryByRole("heading",{name:"Sternwartenschmiede"})).toBeNull();
  });

});
