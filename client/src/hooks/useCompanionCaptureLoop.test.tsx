import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompanionCaptureLoop } from "./useCompanionCaptureLoop";
import type { CompanionFrameSample } from "@/lib/companionFrameCapture";

const sample: CompanionFrameSample = { capturedAt: 1000, frameDataUrl: "data:image/png;base64,AAAA", featureVector: Array(16).fill(.5) };
describe("companion capture generation", () => {
  afterEach(() => vi.useRealTimers());
  it("finishes an in-flight capture across observer rerenders with the latest readback callback", async () => {
    vi.useFakeTimers();
    let resolve!: (sample: CompanionFrameSample) => void;
    const capture = vi.fn(() => new Promise<CompanionFrameSample>(done => { resolve = done; }));
    const pending = { current: { id: 1, issuedAt: 1000 } as { id: number; issuedAt: number } | undefined };
    const oldAccept = vi.fn(() => true), newAccept = vi.fn(() => true);
    const initialProps = { enabled: true, scope: "user:session:world", pending, now: () => 1000, capture, accept: oldAccept, onError: vi.fn() };
    const { rerender } = renderHook(props => useCompanionCaptureLoop(props), { initialProps });
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ ...initialProps, accept: newAccept });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(capture).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(sample); });
    expect(oldAccept).not.toHaveBeenCalled(); expect(newAccept).toHaveBeenCalledWith(sample, { id: 1, issuedAt: 1000 });
    expect(pending.current).toBeUndefined();
  });
  it("discards late captures on a world/session change and on stopping learning", async () => {
    vi.useFakeTimers();
    let resolve!: (sample: CompanionFrameSample) => void;
    const pending = { current: { id: 1, issuedAt: 1000 } as { id: number; issuedAt: number } | undefined };
    const props = { enabled: true, scope: "one", pending, now: () => 1000, capture: () => new Promise<CompanionFrameSample>(done => { resolve = done; }), accept: vi.fn(() => true), onError: vi.fn() };
    const { rerender } = renderHook(p => useCompanionCaptureLoop(p), { initialProps: props });
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ ...props, scope: "two" });
    await act(async () => { resolve(sample); });
    expect(props.accept).not.toHaveBeenCalled(); expect(pending.current).toBeUndefined();
    pending.current = { id: 2, issuedAt: 1000 };
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ ...props, enabled: false });
    await act(async () => { resolve(sample); });
    expect(props.accept).not.toHaveBeenCalled();
  });
  it("rejects stale and superseded labels and recovers from capture errors", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const pending = { current: { id: 1, issuedAt: 1000 } as { id: number; issuedAt: number } | undefined };
    const capture = vi.fn().mockRejectedValueOnce(new Error("capture unavailable")).mockResolvedValue(sample);
    const accept = vi.fn(() => true), onError = vi.fn();
    renderHook(() => useCompanionCaptureLoop({ enabled: true, scope: "one", pending, now: () => now, capture, accept, onError }));
    await act(() => vi.advanceTimersByTimeAsync(100)); expect(onError).toHaveBeenCalledTimes(1);
    now = 3000;
    await act(() => vi.advanceTimersByTimeAsync(100)); expect(pending.current).toBeUndefined(); expect(accept).not.toHaveBeenCalled();
    pending.current = { id: 2, issuedAt: 3000 };
    await act(() => vi.advanceTimersByTimeAsync(100)); expect(accept).not.toHaveBeenCalled();
    now = 1000; pending.current = { id: 3, issuedAt: 1000 };
    await act(() => vi.advanceTimersByTimeAsync(100)); expect(accept).toHaveBeenCalledTimes(1);
  });
});
