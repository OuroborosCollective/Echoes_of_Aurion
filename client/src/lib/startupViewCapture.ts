import { PerspectiveCamera, Vector3 } from "three";
import { operationalDate } from "@shared/operationalClock";

/** Opt-in, one-shot observation of the real renderer. Never sends a game intent. */
export class StartupViewCapture {
  private snapshot: any = null;
  private target: number | null = null;
  private captured: unknown = null;
  private failure: string | null = null;
  private frames = 0;
  private camera: PerspectiveCamera | null = null;
  private pose: { positionMm: number[]; targetMm: number[]; fovMilliDeg: number; nearMm: number; farMm: number } | null = null;
  bindCamera(camera: PerspectiveCamera) { this.camera = camera; }
  alignCamera() {
    if (this.pose || this.target !== null) throw Error("CAPTURE_CAMERA_ALREADY_ALIGNED");
    const raw = this.read().camera as NonNullable<typeof this.pose>;
    if (!this.camera || !this.snapshot || !raw || ![raw.positionMm, raw.targetMm].every(v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isSafeInteger(n) && Math.abs(n) <= 10**10)) ||
      !Number.isSafeInteger(raw.fovMilliDeg) || raw.fovMilliDeg < 10000 || raw.fovMilliDeg > 150000 ||
      !Number.isSafeInteger(raw.nearMm) || !Number.isSafeInteger(raw.farMm) || raw.nearMm < 1 || raw.farMm <= raw.nearMm || raw.farMm > 10000000 ||
      (raw.positionMm[0] === raw.targetMm[0] && raw.positionMm[2] === raw.targetMm[2])) throw Error("CAPTURE_CAMERA_INVALID");
    this.pose = {positionMm:[...raw.positionMm],targetMm:[...raw.targetMm],fovMilliDeg:raw.fovMilliDeg,nearMm:raw.nearMm,farMm:raw.farMm};
    this.beforeFrame();
    return structuredClone(this.pose);
  }
  cameraTargetMm(fallback: number[]) { return this.pose ? [...this.pose.targetMm] : fallback; }
  beforeFrame() {
    if (!this.camera || !this.pose) return;
    const p = this.pose;
    this.camera.position.fromArray(p.positionMm.map(n => n / 1000));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(new Vector3().fromArray(p.targetMm.map(n => n / 1000)));
    this.camera.fov = p.fovMilliDeg / 1000;
    this.camera.near = p.nearMm / 1000;
    this.camera.far = p.farMm / 1000;
    this.camera.zoom = 1;
    this.camera.filmOffset = 0;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  readonly startedAtUtc = operationalDate().toISOString();

  constructor(readonly nonce: string, private read: () => Record<string, unknown>, private canvas: () => HTMLCanvasElement, readonly documentId: string = crypto.randomUUID()) {}

  observe(snapshot: { tick: number }) { this.snapshot = structuredClone(snapshot); }
  state() { const canvas = this.canvas(); return { nonce: this.nonce, documentId: this.documentId, viewportPx: [canvas.width, canvas.height], tick: this.snapshot?.tick ?? null, armed: this.target !== null, failure: this.failure }; }
  result() { return this.captured; }
  arm(tick: number) {
    if (this.target !== null || !Number.isSafeInteger(tick) || !this.snapshot || tick <= this.snapshot.tick || tick > this.snapshot.tick + 100) throw Error("CAPTURE_ARM_INVALID");
    if (this.camera && !this.pose) throw Error("CAPTURE_CAMERA_NOT_ALIGNED");
    this.target = tick;
  }
  onFrame() {
    this.frames++;
    if (this.captured || this.failure || this.target === null || !this.snapshot || this.snapshot.tick < this.target) return;
    try {
      // Read in onFrameRendered: preserveDrawingBuffer is unnecessary; no
      // image resize, overlay removal, retry, or postprocessing.
      // A declared common camera is applied before rendering, never to PNG bytes.
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
