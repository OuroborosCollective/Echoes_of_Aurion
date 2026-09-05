import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisibleCanvasCapture } from "./visibleCanvasCapture";
import { COMPANION_FRAME_REQUEST_EVENT, COMPANION_FRAME_RESPONSE_EVENT, createCompanionFrameSample } from "./companionFrameCapture";
import { actionFromWorldIntent, observedWorldState } from "./companionWorldInputs";

describe("visible canvas capture ownership", () => {
  let bridge: VisibleCanvasCapture | undefined;
  let callback: FrameRequestCallback;
  let allowed: boolean;
  const reply = vi.fn();
  const render = vi.fn(() => { const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 1280; return canvas; });
  const drawImage = vi.fn();
  const request = (requestId = "companion-frame-1") => window.dispatchEvent(new CustomEvent(COMPANION_FRAME_REQUEST_EVENT, { detail: { requestId, captureStartedAt: 1000 } }));
  beforeEach(() => {
    allowed = true; vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", vi.fn((next: FrameRequestCallback) => { callback = next; return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, fillRect: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(256 * 144 * 4), width: 256, height: 144 }) } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,AAAA");
    window.addEventListener(COMPANION_FRAME_RESPONSE_EVENT, reply);
    bridge = new VisibleCanvasCapture(render, () => allowed);
  });
  afterEach(() => { bridge?.dispose(); window.removeEventListener(COMPANION_FRAME_RESPONSE_EVENT, reply); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("captures the actual renderer at bounded size with the explicit conservative timestamp", () => {
    request(); request("companion-frame-2"); expect(reply.mock.calls[0][0].detail.error).toBe("busy");
    callback(0);
    expect(render).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0].slice(1)).toEqual([83, 0, 90, 144]);
    expect(reply.mock.calls[1][0].detail).toEqual({ requestId: "companion-frame-1", capturedAt: 1000, frameDataUrl: "data:image/webp;base64,AAAA", featureVector: Array(16).fill(0) });
  });
  it("reads one completed engine frame without scheduling a second render or an image decode", () => {
    bridge!.dispose(); bridge = new VisibleCanvasCapture(render, () => allowed, "renderer");
    request(); expect(requestAnimationFrame).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled();
    bridge.onRenderedFrame(); bridge.onRenderedFrame();
    expect(render).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0].detail.featureVector).toEqual(Array(16).fill(0));
  });
  it("does not capture before learning or after consent/state changes", () => {
    allowed = false; request(); expect(render).not.toHaveBeenCalled(); expect(reply.mock.calls[0][0].detail.error).toBe("unavailable");
    allowed = true; request(); allowed = false; callback(0); expect(render).not.toHaveBeenCalled();
  });
  it("cancels a retired generation and suppresses its late callback", () => {
    request(); bridge!.dispose(); callback(0); request();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1); expect(render).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
  });
  it("rejects malformed requests and oversized outputs without leaking diagnostics", () => {
    request("../bad"); expect(requestAnimationFrame).not.toHaveBeenCalled();
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue("data:image/webp;base64," + "A".repeat(262_144));
    request(); callback(0); expect(reply.mock.calls[0][0].detail).toEqual({ requestId: "companion-frame-1", error: "capture_failed" });
  });
  it("rejects SVG and oversized image envelopes before allocating a decoder", async () => {
    await expect(createCompanionFrameSample("data:image/svg+xml;base64,AAAA", 1000)).rejects.toThrow("invalid");
    await expect(createCompanionFrameSample("data:image/png;base64," + "A".repeat(262_144), 1000)).rejects.toThrow("invalid");
  });
  it("labels actual bounded human intents and masks unknown world state", () => {
    expect(actionFromWorldIntent({ kind: "move", x: 0, z: -1 })).toEqual([.5, 0, 1, 1]);
    expect(actionFromWorldIntent({ kind: "move", x: NaN, z: 0 })).toBeNull();
    expect(actionFromWorldIntent({ kind: "action", command: "sudo" })).toBeNull();
    expect(observedWorldState(undefined, 1, true)).toEqual({ vector: [0, 0, 0, 0, 0, 0], mask: [0, 0, 0, 0, 0, 0] });
  });
});
