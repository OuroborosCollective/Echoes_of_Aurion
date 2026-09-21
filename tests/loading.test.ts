import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { LoadingProvider, useLoading } from "../client/src/contexts/LoadingContext";

// Minimal test component to hook into and execute context functions
function TestComponent({ onStateChange }: { onStateChange?: (state: any) => void }) {
  const loading = useLoading();

  React.useEffect(() => {
    if (onStateChange) {
      onStateChange(loading);
    }
  }, [loading, onStateChange]);

  return (
    <div>
      <div data-testid="is-loading">{loading.isInitialWorldLoad ? "true" : "false"}</div>
      <div data-testid="progress">{loading.progress}</div>
      <div data-testid="chunks">{loading.chunksLoaded}/{loading.chunksTotal}</div>
      <div data-testid="model">{loading.modelStatus}</div>
      <div data-testid="env">{loading.envAssetsLoading}/{loading.envAssetsTotal}</div>
    </div>
  );
}

describe("Ouroboros Initial World Loading Engine & Toggles", () => {
  it("should initialize with loading screen active and progress reflective of initial state", () => {
    const { getByTestId } = render(
      <LoadingProvider>
        <TestComponent />
      </LoadingProvider>
    );

    expect(getByTestId("is-loading").textContent).toBe("true");
    const progress = Number(getByTestId("progress").textContent);
    expect(progress).toBeGreaterThanOrEqual(15);
  });

  it("should update progress as assets stream in incrementally", () => {
    let latestState: any = null;
    const { getByTestId } = render(
      <LoadingProvider>
        <TestComponent onStateChange={(state) => { latestState = state; }} />
      </LoadingProvider>
    );

    // Initial load chunks
    act(() => {
      latestState.setChunksStatus(3, 9);
    });
    const midChunksProgress = Number(getByTestId("progress").textContent);
    expect(midChunksProgress).toBeGreaterThan(15);

    // Load character model
    act(() => {
      latestState.setModelStatus("loading");
    });
    const loadingModelProgress = Number(getByTestId("progress").textContent);
    expect(loadingModelProgress).toBeGreaterThan(midChunksProgress);
  });

  it("should auto-complete loading and hide screen once all critical assets reach readiness", () => {
    vi.useFakeTimers();
    let latestState: any = null;
    const { getByTestId } = render(
      <LoadingProvider>
        <TestComponent onStateChange={(state) => { latestState = state; }} />
      </LoadingProvider>
    );

    // Set everything to completion state
    act(() => {
      latestState.setChunksStatus(9, 9);
      latestState.setModelStatus("active");
      latestState.setEnvAssetsStatus(0, 0, 15);
    });

    // Progress is now 100%
    expect(Number(getByTestId("progress").textContent)).toBe(100);

    // Advance timer for transition duration (600ms)
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // The loading screen is now hidden
    expect(getByTestId("is-loading").textContent).toBe("false");
    vi.useRealTimers();
  });

  it("should stay hidden during background chunk streaming as the player traverses the world", () => {
    vi.useFakeTimers();
    let latestState: any = null;
    const { getByTestId } = render(
      <LoadingProvider>
        <TestComponent onStateChange={(state) => { latestState = state; }} />
      </LoadingProvider>
    );

    // 1. Load initial chunks
    act(() => {
      latestState.setChunksStatus(9, 9);
      latestState.setModelStatus("active");
      latestState.setEnvAssetsStatus(0, 0, 10);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(getByTestId("is-loading").textContent).toBe("false");

    // 2. Traversal background streaming (more chunks loaded, total changes)
    act(() => {
      latestState.setChunksStatus(15, 18);
    });

    // Visibility must remain strictly hidden (false)
    expect(getByTestId("is-loading").textContent).toBe("false");
    vi.useRealTimers();
  });
});
