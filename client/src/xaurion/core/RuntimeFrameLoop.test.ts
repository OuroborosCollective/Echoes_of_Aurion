import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeFrameLoop } from "./RuntimeFrameLoop";

describe("render loop lifecycle", () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let sequence: number;
  beforeEach(() => {
    callbacks = new Map(); sequence = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callbacks.set(++sequence, callback); return sequence;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => callbacks.delete(id)));
  });
  afterEach(() => vi.unstubAllGlobals());
  const frame = (time: number) => {
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(time));
  };

  it("reports a late render failure once and cancels further work", () => {
    const failure = new Error("renderer unavailable");
    const step = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw failure; });
    const onError = vi.fn();
    const loop = new RuntimeFrameLoop(step, onError);
    loop.start(); loop.start();
    expect(callbacks.size).toBe(1);
    frame(100); frame(200); frame(300);
    expect(step).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(callbacks.size).toBe(0);
  });

  it("ignores a queued callback from a retired generation after restart", () => {
    const step = vi.fn();
    const loop = new RuntimeFrameLoop(step, vi.fn());
    loop.start();
    const retired = [...callbacks.values()][0];
    loop.stop(); loop.start();
    retired(100);
    expect(step).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(1);
    frame(200);
    expect(step).toHaveBeenCalledTimes(1);
    loop.stop();
    expect(callbacks.size).toBe(0);
  });

  it("does not reschedule when the scene stops itself during a frame", () => {
    const loop = new RuntimeFrameLoop(() => loop.stop(), vi.fn());
    loop.start(); frame(100);
    expect(callbacks.size).toBe(0);
  });
});
