import { COMPANION_FRAME_REQUEST_EVENT, COMPANION_FRAME_RESPONSE_EVENT, type CompanionFrameRequestDetail, type CompanionFrameResponseDetail } from "./companionFrameCapture";

/** Captures only on a learning request; owns and cancels its scheduled frame on retirement. */
export class VisibleCanvasCapture {
  private disposed = false;
  private pending: CompanionFrameRequestDetail | null = null;
  private frame: number | null = null;
  constructor(private readonly render: () => HTMLCanvasElement, private readonly canCapture: () => boolean) {
    window.addEventListener(COMPANION_FRAME_REQUEST_EVENT, this.request);
  }
  private respond(detail: CompanionFrameResponseDetail) {
    if (!this.disposed) window.dispatchEvent(new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, { detail }));
  }
  private request = (event: Event) => {
    const input = (event as CustomEvent<unknown>).detail;
    if (!input || typeof input !== "object" || !("requestId" in input) || typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{1,96}$/.test(input.requestId) || !("captureStartedAt" in input) || !Number.isSafeInteger(input.captureStartedAt) || (input.captureStartedAt as number) < 1 || this.disposed) return;
    const request = input as CompanionFrameRequestDetail;
    if (!this.canCapture()) { this.respond({ requestId: request.requestId, error: "unavailable" }); return; }
    if (this.pending) { this.respond({ requestId: request.requestId, error: "busy" }); return; }
    this.pending = request;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.disposed || this.pending !== request) return;
      try {
        if (!this.canCapture()) { this.respond({ requestId: request.requestId, error: "unavailable" }); return; }
        const source = this.render();
        if (source.width < 1 || source.height < 1) throw new Error("EMPTY_VISIBLE_CANVAS");
        const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 144;
        const context = canvas.getContext("2d"); if (!context) throw new Error("CAPTURE_CONTEXT_UNAVAILABLE");
        const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
        const width = source.width * scale, height = source.height * scale;
        context.fillStyle = "#000"; context.fillRect(0, 0, 256, 144);
        context.drawImage(source, (256 - width) / 2, (144 - height) / 2, width, height);
        const frameDataUrl = canvas.toDataURL("image/webp", 0.7);
        if (!/^data:image\/(webp|png);base64,/.test(frameDataUrl) || frameDataUrl.length > 262_144) throw new Error("CAPTURE_SIZE_INVALID");
        // The explicit request-start timestamp is a conservative age bound: render latency cannot make an old observation look fresh.
        this.respond({ requestId: request.requestId, frameDataUrl, capturedAt: request.captureStartedAt });
      } catch { this.respond({ requestId: request.requestId, error: "capture_failed" }); }
      finally { this.pending = null; }
    });
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener(COMPANION_FRAME_REQUEST_EVENT, this.request);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null; this.pending = null;
  }
}
