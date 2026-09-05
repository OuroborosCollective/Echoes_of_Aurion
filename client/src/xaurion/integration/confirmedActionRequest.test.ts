import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmedAutoAttack, type ActionOutcome } from "./confirmedActionRequest";
const ongoing: ActionOutcome = { confirmed: true, completed: false, message: "Bestätigt" };
afterEach(() => vi.useRealTimers());
describe("auto attack schedules only sequential confirmed requests", () => {
  it("waits for the full readback and interval before requesting another action", async () => {
    vi.useFakeTimers();
    let resolve!: (value: ActionOutcome) => void;
    const request = vi.fn(() => new Promise<ActionOutcome>(r => { resolve = r; }));
    const auto = new ConfirmedAutoAttack(request, () => true, vi.fn());
    auto.start(); auto.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(1);
    resolve(ongoing);
    await vi.advanceTimersByTimeAsync(1_099);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    auto.stop();
  });
  it.each([{ confirmed: false, completed: false }, { confirmed: true, completed: true }])("stops on $confirmed/$completed without a retry", async outcome => {
    vi.useFakeTimers();
    const request = vi.fn(async () => ({ ...outcome, message: "Ende" }));
    const auto = new ConfirmedAutoAttack(request, () => true, vi.fn());
    auto.start(); await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not restart when a stopped in-flight action eventually resolves", async () => {
    vi.useFakeTimers();
    let resolve!: (value: ActionOutcome) => void;
    const request = vi.fn(() => new Promise<ActionOutcome>(r => { resolve = r; }));
    const auto = new ConfirmedAutoAttack(request, () => true, vi.fn());
    auto.start(); auto.stop(); auto.start();
    resolve(ongoing); await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rechecks permission before a scheduled request and stops after a rejection", async () => {
    vi.useFakeTimers();
    let permitted = true;
    const request = vi.fn(async () => ongoing);
    const auto = new ConfirmedAutoAttack(request, () => permitted, vi.fn());
    auto.start(); await vi.advanceTimersByTimeAsync(0); permitted = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(1);
    permitted = true; request.mockRejectedValueOnce(new Error("HTTP failure"));
    auto.start(); await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
