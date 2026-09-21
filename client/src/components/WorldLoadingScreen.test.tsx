import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { deriveWorldLoadingState, WorldLoadingScreen } from "./WorldLoadingScreen";

const readyProps = {
  rendererReady: true,
  chunks: { status: "APPLIED", count: 9, desiredCount: 9, pendingCount: 0, failedCount: 0 },
  modelStatus: "active",
  worldAssets: { version: "aurion-world-assets.v1", planned: 12, rendered: 12, loading: 0, failed: 0 },
} as const;

describe("WorldLoadingScreen", () => {
  it("hides only after all runtime-evidence gates are settled", () => {
    expect(deriveWorldLoadingState(readyProps)).toMatchObject({ ready: true, passed: 4, total: 4 });
    render(<WorldLoadingScreen {...readyProps} />);
    expect(screen.queryByTestId("world-loading-screen")).toBeNull();
  });

  it("reports exact observed counts without invented percentages", () => {
    render(
      <WorldLoadingScreen
        {...readyProps}
        rendererReady={false}
        chunks={{ status: "APPLIED", count: 4, desiredCount: 9, pendingCount: 2, failedCount: 0 }}
        worldAssets={{ version: "aurion-world-assets.v1", planned: 12, rendered: 7, loading: 2, failed: 1 }}
      />,
    );
    expect(screen.getByTestId("loading-gate-count").textContent).toBe("1 / 4 Evidence-Gates bestätigt");
    expect(screen.getByText("4 bestätigt / 9 erwartet")).toBeDefined();
    expect(screen.getByText("7 / 12 gerendert · 2 lädt · 1 fehlgeschlagen")).toBeDefined();
  });

  it("settles explicit presentation fallbacks but marks them degraded", () => {
    const state = deriveWorldLoadingState({
      ...readyProps,
      chunks: { status: "UNPROVABLE", count: 8, desiredCount: 9, pendingCount: 0, failedCount: 1 },
      modelStatus: "failed",
      worldAssets: { version: null, planned: 0, rendered: 0, loading: 0, failed: 1 },
    });
    expect(state).toMatchObject({ ready: true, degraded: true, passed: 4 });
  });

  it("keeps transient unproven chunks fail-closed until every desired slot settles", () => {
    const state = deriveWorldLoadingState({
      ...readyProps,
      chunks: { status: "UNPROVABLE", count: 7, desiredCount: 9, pendingCount: 1, failedCount: 1 },
    });
    expect(state.ready).toBe(false);
    expect(state.gates.chunks).toBe(false);
  });
});


  it("stops intercepting controls once renderer and character presentation are settled", () => {
    const state = deriveWorldLoadingState({
      ...readyProps,
      chunks: { status: "APPLIED", count: 4, desiredCount: 9, pendingCount: 2, failedCount: 0 },
      worldAssets: { version: "aurion-world-assets.v1", planned: 12, rendered: 7, loading: 2, failed: 0 },
    });
    expect(state).toMatchObject({ ready: false, blocking: false });

    render(
      <WorldLoadingScreen
        {...readyProps}
        chunks={{ status: "APPLIED", count: 4, desiredCount: 9, pendingCount: 2, failedCount: 0 }}
        worldAssets={{ version: "aurion-world-assets.v1", planned: 12, rendered: 7, loading: 2, failed: 0 }}
      />,
    );
    const status = screen.getByTestId("world-loading-screen");
    expect(status.getAttribute("data-mode")).toBe("non-blocking");
    expect(status.className).toContain("pointer-events-none");
  });


it("keeps degraded fallback evidence visible without blocking controls", () => {
  render(
    <WorldLoadingScreen
      rendererReady
      chunks={{ status: "UNPROVABLE", count: 8, desiredCount: 9, pendingCount: 0, failedCount: 1 }}
      modelStatus="failed"
      worldAssets={{ version: null, planned: 0, rendered: 0, loading: 0, failed: 1 }}
    />,
  );
  const status = screen.getByTestId("world-loading-screen");
  expect(status.getAttribute("data-mode")).toBe("non-blocking");
  expect(status.className).toContain("pointer-events-none");
  expect(screen.getByText("Welt bereit mit transparentem Präsentations-Fallback.")).toBeDefined();
});
