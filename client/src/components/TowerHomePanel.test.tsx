import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TowerHomePanel from "./TowerHomePanel";

describe("TowerHomePanel", () => {
  it("shows every house service and the guided gameplay exits without hiding controls", () => {
    const onPrepare = vi.fn();
    const onEnterExpanse = vi.fn();
    const onSignal = vi.fn();
    render(<TowerHomePanel playerName="Mira Voss" onPrepare={onPrepare} onEnterExpanse={onEnterExpanse} onSignal={onSignal} />);

    expect(screen.getByRole("heading", { name: /Willkommen zurück, Mira Voss/i })).toBeTruthy();
    for (const action of ["Ruhe finden", "Items lagern", "Zimmer einrichten", "Besuch einladen"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${action}`) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "LOADOUT VORBEREITEN" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "IN DIE OPEN WORLD" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Items lagern/ }));
    expect(onSignal).toHaveBeenCalledWith(expect.stringContaining("Lager geöffnet"));
    fireEvent.click(screen.getByRole("button", { name: "LOADOUT VORBEREITEN" }));
    fireEvent.click(screen.getByRole("button", { name: "IN DIE OPEN WORLD" }));
    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onEnterExpanse).toHaveBeenCalledTimes(1);
  });
});
