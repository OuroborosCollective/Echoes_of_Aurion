import { describe, expect, it } from "vitest";
import {
  COMPANION_FRAME_REQUEST_EVENT,
  COMPANION_FRAME_RESPONSE_EVENT,
  luminanceGridFeatures,
  requestCompanionFrame,
  type CompanionFrameRequestDetail,
} from "./companionFrameCapture";

describe("Aurion companion frame capture", () => {
  it("derives a deterministic 4x4 luminance vector", () => {
    const white = new Uint8ClampedArray(4 * 4 * 4);
    for (let offset = 0; offset < white.length; offset += 4) {
      white[offset] = 255;
      white[offset + 1] = 255;
      white[offset + 2] = 255;
      white[offset + 3] = 255;
    }
    expect(luminanceGridFeatures(white, 4, 4)).toEqual(new Array(16).fill(1));
    expect(
      luminanceGridFeatures(new Uint8ClampedArray(4 * 4 * 4), 4, 4)
    ).toEqual(new Array(16).fill(0));
  });

  it("binds one response to its exact request id", async () => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameRequestDetail>).detail;
      window.dispatchEvent(
        new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, {
          detail: {
            requestId: "other-request",
            dataUrl: "data:image/webp;base64,wrong",
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, {
          detail: {
            requestId: detail.requestId,
            dataUrl: "data:image/webp;base64,right",
          },
        })
      );
    };
    window.addEventListener(COMPANION_FRAME_REQUEST_EVENT, onRequest, {
      once: true,
    });
    await expect(requestCompanionFrame(100)).resolves.toBe(
      "data:image/webp;base64,right"
    );
  });
});
