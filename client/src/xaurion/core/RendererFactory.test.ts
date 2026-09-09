import { describe, expect, it, vi } from "vitest";
import { checkWebGL2Support, createRuntimeRenderer, type RendererHandle } from "./RendererFactory";

// Test doubles exercise lifecycle policy only; GPU evidence comes from browser CI.
const handle = (backend: "webgl2" | "webgpu") => ({ backend, rendererName: backend, renderer: {}, dispose: vi.fn(), onLoss: vi.fn() }) as unknown as RendererHandle;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe("renderer negotiation and retirement", () => {
  it("keeps WebGL2 as the explicitly disabled release baseline", async () => {
    const gl = handle("webgl2"), gpu = vi.fn();
    const result = await createRuntimeRenderer("webgl2", new AbortController().signal, { hasWebGPU: () => true, webgl2: () => gl, webgpu: gpu });
    expect(result.handle).toBe(gl); expect(result.evidence).toMatchObject({ backend: "webgl2", fallback: "disabled" }); expect(gpu).not.toHaveBeenCalled();
  });

  it("falls back when capabilities are absent or initialization fails", async () => {
    for (const available of [false, true]) {
      const gl = handle("webgl2");
      const result = await createRuntimeRenderer("webgpu", new AbortController().signal, { hasWebGPU: () => available, webgl2: () => gl, webgpu: async () => { throw Error("adapter rejected"); } });
      expect(result.handle).toBe(gl); expect(result.evidence.fallback).toBe(available ? "initialization_failed" : "unavailable");
    }
  });

  it("reports the initialized backend, not the WebGPURenderer class", async () => {
    const fallback = handle("webgl2"), gpu = handle("webgpu"), gl = handle("webgl2");
    const dependencies = { hasWebGPU: () => true, webgl2: () => gl, webgpu: async () => fallback };
    expect((await createRuntimeRenderer("webgpu", new AbortController().signal, dependencies)).handle).toBe(gl);
    expect(fallback.dispose).toHaveBeenCalledOnce();
    expect((await createRuntimeRenderer("webgpu", new AbortController().signal, { ...dependencies, webgpu: async () => gpu })).evidence).toMatchObject({ backend: "webgpu", fallback: null });
    expect(gpu.dispose).not.toHaveBeenCalled();
  });

  it("disposes a late GPU result after cancellation without constructing a fallback", async () => {
    const pending = deferred<RendererHandle>(), abort = new AbortController(), gpu = handle("webgpu"), webgl2 = vi.fn();
    const request = createRuntimeRenderer("webgpu", abort.signal, { hasWebGPU: () => true, webgl2, webgpu: () => pending.promise });
    abort.abort(); await expect(request).rejects.toThrow();
    pending.resolve(gpu); await Promise.resolve();
    expect(gpu.dispose).toHaveBeenCalledOnce(); expect(webgl2).not.toHaveBeenCalled();
  });

  it("bounds initialization and disposes the timed-out result after fallback", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<RendererHandle>(), gpu = handle("webgpu"), gl = handle("webgl2");
      const request = createRuntimeRenderer("webgpu", new AbortController().signal, { hasWebGPU: () => true, webgl2: () => gl, webgpu: () => pending.promise }, 50);
      await vi.advanceTimersByTimeAsync(50);
      expect((await request).handle).toBe(gl);
      pending.resolve(gpu); await Promise.resolve();
      expect(gpu.dispose).toHaveBeenCalledOnce(); expect(gl.dispose).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("does not accept or request a WebGL1 context as a release capability", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try { expect(checkWebGL2Support().supported).toBe(false); expect(getContext).toHaveBeenCalledOnce(); expect(getContext).toHaveBeenCalledWith("webgl2"); }
    finally { getContext.mockRestore(); }
  });
});
