import * as THREE from "three";

export type RendererBackend = "webgl2" | "webgpu";
export type RendererPreference = "webgl2" | "webgpu";
export type RuntimeRenderer = Pick<THREE.WebGLRenderer,
  "domElement" | "render" | "setSize" | "setPixelRatio" | "setClearColor" |
  "toneMapping" | "toneMappingExposure" | "dispose"> & { info: { render: { calls: number; triangles: number; drawCalls?: number } } };
export type ParticleBuffers = Readonly<{
  positions: Float32Array; colors: Float32Array; sizes: Float32Array; alphas: Float32Array;
}>;
export type ParticleView = { object: THREE.Object3D; update(count: number): void; dispose(): void };
export type RendererHandle = Readonly<{
  renderer: RuntimeRenderer;
  backend: RendererBackend;
  rendererName: string;
  createParticles?: (buffers: ParticleBuffers, texture: THREE.Texture) => ParticleView;
  onLoss(callback: (code: "WEBGPU_DEVICE_LOST" | "WEBGPU_RENDER_ERROR") => void): void;
  dispose(): void;
}>;
export type RendererEvidence = Readonly<{
  protocol: "ax1-renderer.v1"; requested: RendererPreference; backend: RendererBackend;
  fallback: "disabled" | "unavailable" | "initialization_failed" | null;
}>;

export function checkWebGL2Support(): { supported: boolean; version?: string; error?: string } {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return { supported: false, error: "WebGL 2 ist nicht verfügbar." };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { supported: true, version: "WebGL 2.0" };
  } catch { return { supported: false, error: "WebGL 2 konnte nicht initialisiert werden." }; }
}

function createWebGL2(): RendererHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); throw new Error("WEBGL2_REQUIRED"); }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  let disposed = false;
  return { renderer, backend: "webgl2", rendererName, onLoss() {}, dispose() {
    if (disposed) return; disposed = true;
    renderer.dispose(); renderer.forceContextLoss();
  } };
}

type FactoryDependencies = {
  hasWebGPU(): boolean;
  webgl2(): RendererHandle;
  webgpu(): Promise<RendererHandle>;
};
const productionDependencies: FactoryDependencies = {
  hasWebGPU: () => typeof navigator !== "undefined" && "gpu" in navigator && globalThis.isSecureContext === true,
  webgl2: createWebGL2,
  webgpu: async () => (await import("./WebGpuRenderer")).createWebGpuRenderer(),
};

/** No world state enters this factory. Only an initialized backend counts as evidence. */
export async function createRuntimeRenderer(
  requested: RendererPreference, signal: AbortSignal,
  dependencies: FactoryDependencies = productionDependencies,
  timeoutMs = 10_000,
): Promise<{ handle: RendererHandle; evidence: RendererEvidence }> {
  signal.throwIfAborted();
  let fallback: RendererEvidence["fallback"] = requested === "webgl2" ? "disabled" : "unavailable";
  if (requested === "webgpu" && dependencies.hasWebGPU()) {
    let retired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const pending = dependencies.webgpu().then(handle => {
      if (retired || signal.aborted) { handle.dispose(); throw new Error("RETIRED_RENDERER"); }
      return handle;
    });
    try {
      const handle = await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("RENDERER_INIT_TIMEOUT")), timeoutMs);
        abort = () => reject(signal.reason ?? new Error("RETIRED_RENDERER"));
        signal.addEventListener("abort", abort, { once: true });
      })]);
      if (signal.aborted) { handle.dispose(); signal.throwIfAborted(); }
      // Three's WebGPURenderer can initialize its own WebGL backend. Preserve the
      // established release baseline instead of labelling that class as WebGPU.
      if (handle.backend === "webgpu") return { handle, evidence: { protocol: "ax1-renderer.v1", requested, backend: handle.backend, fallback: null } };
      handle.dispose();
    } catch { signal.throwIfAborted(); }
    finally {
      retired = true;
      if (timer !== undefined) clearTimeout(timer);
      if (abort) signal.removeEventListener("abort", abort);
    }
    fallback = "initialization_failed";
  }
  signal.throwIfAborted();
  const handle = dependencies.webgl2();
  return { handle, evidence: { protocol: "ax1-renderer.v1", requested, backend: handle.backend, fallback } };
}
