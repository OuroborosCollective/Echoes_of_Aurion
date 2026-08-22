import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import GameCanvas from "./GameCanvas";

describe("GameCanvas", () => {
  it("zeigt während der asynchronen 3D-Initialisierung einen sichtbaren Startstatus", () => {
    window.history.replaceState({}, "", "/");
    render(<GameCanvas />);
    expect(screen.getByTestId("webgl-boot").textContent).toContain("STERNWARTE WIRD KALIBRIERT");
  });

  it("zeigt bei fehlender WebGL-Unterstützung den spielbaren Fallback", () => {
    window.history.replaceState({}, "", "/?aurion_runtime=no-webgl");
    render(<GameCanvas />);
    expect(screen.getByTestId("webgl-fallback").textContent).toContain("Zugang und Gemeinschaft bleiben aktiv");
  });
});
