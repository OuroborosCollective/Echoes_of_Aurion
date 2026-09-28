import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorldLoadingScreen, deriveWorldLoadingState } from "./WorldLoadingScreen";

describe("WorldLoadingScreen small-screen behavior", () => {
  it("does not cover the playable horizon once renderer and character gates are usable", () => {
    const state = deriveWorldLoadingState({
      rendererReady: true,
      chunks: { status: "PROJECTING", count: 0, desiredCount: 108, pendingCount: 108, failedCount: 0 },
      modelStatus: "active",
      worldAssets: { version: null, planned: 108, rendered: 0, loading: 1, failed: 0 },
    });
    expect(state.blocking).toBe(false);
    render(
      <WorldLoadingScreen
        rendererReady
        chunks={{ status: "PROJECTING", count: 0, desiredCount: 108, pendingCount: 108, failedCount: 0 }}
        modelStatus="active"
        worldAssets={{ version: null, planned: 108, rendered: 0, loading: 1, failed: 0 }}
      />,
    );
    expect(screen.queryByTestId("world-loading-screen")).toBeNull();
  });

  it("keeps a real blocking gate only before the renderer or character is usable", () => {
    render(
      <WorldLoadingScreen
        rendererReady={false}
        chunks={null}
        modelStatus="loading"
        worldAssets={null}
      />,
    );
    expect(screen.getByTestId("world-loading-screen").getAttribute("data-mode")).toBe("blocking");
    expect(screen.getByTestId("loading-gate-count").textContent).toContain("0 / 4");
  });
});
