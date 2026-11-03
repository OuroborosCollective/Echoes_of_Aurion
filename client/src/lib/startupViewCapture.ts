import { operationalDate } from "@shared/operationalClock";

/** Opt-in, one-shot observation of the real renderer. Never sends a game intent. */
export class StartupViewCapture {
  private snapshot: any = null;
  private target: number | null = null;
  private captured: unknown = null;
  private failure: string | null = null;
  private frames = 0;
  readonly startedAtUtc = operationalDate().toISOString();

  constructor(readonly nonce: string, private read: () => Record<string, unknown>, private canvas: () => HTMLCanvasElement, readonly documentId: string = crypto.randomUUID()) {}

  observe(snapshot: { tick: number }) { this.snapshot = structuredClone(snapshot); }
  state() { const canvas = this.canvas(); return { nonce: this.nonce, documentId: this.documentId, viewportPx: [canvas.width, canvas.height], tick: this.snapshot?.tick ?? null, armed: this.target !== null, failure: this.failure }; }
  result() { return this.captured; }
  arm(tick: number) {
    if (this.target !== null || !Number.isSafeInteger(tick) || !this.snapshot || tick <= this.snapshot.tick || tick > this.snapshot.tick + 100) throw Error("CAPTURE_ARM_INVALID");
    this.target = tick;
  }
  onFrame() {
    this.frames++;
    if (this.captured || this.failure || this.target === null || !this.snapshot || this.snapshot.tick < this.target) return;
    try {
      // Read in onFrameRendered: preserveDrawingBuffer is unnecessary; no
      // resize, overlay removal, camera override, retry, or postprocessing.
      const canvas = this.canvas();
      this.captured = { schema: "aurion.startup-view.observation.v1", source: "aurion-web", nonce: this.nonce,
        documentId: this.documentId, minimumTick: this.target, captureIndex: 1, startedAtUtc: this.startedAtUtc, capturedAtUtc: operationalDate().toISOString(),
        frame: this.frames, snapshot: structuredClone(this.snapshot), ...this.read(),
        viewportPx: [canvas.width, canvas.height], png: canvas.toDataURL("image/png") };
    } catch { this.failure = "BROWSER_FRAME_CAPTURE_FAILED"; }
  }
}

declare global { interface Window { __aurionStartupCapture?: StartupViewCapture; __aurionStartupCaptureHandoff?: { nonce: string; documentId: string } } }

export function installStartupViewCapture(read: () => Record<string, unknown>, canvas: () => HTMLCanvasElement) {
  const handoff = window.__aurionStartupCaptureHandoff;
  delete window.__aurionStartupCaptureHandoff;
  const nonce = handoff?.nonce ?? new URLSearchParams(window.location.search).get("aurionParity");
  if (!nonce || !/^[a-f0-9]{32}$/.test(nonce)) return null;
  // Recovery/recreation is not the first startup. Preserve the failed initial
  // observer so a later successful frame cannot silently replace its result.
  if (window.__aurionStartupCapture) throw Error("STARTUP_RENDERER_RECREATED");
  return window.__aurionStartupCapture = new StartupViewCapture(nonce, read, canvas, handoff?.documentId);
}
