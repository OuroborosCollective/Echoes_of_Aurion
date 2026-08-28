export const COMPANION_FRAME_REQUEST_EVENT = "aurion:companion-frame-request";
export const COMPANION_FRAME_RESPONSE_EVENT = "aurion:companion-frame-response";

export type CompanionFrameRequestDetail = {
  requestId: string;
  width: number;
  height: number;
};

export type CompanionFrameResponseDetail = {
  requestId: string;
  dataUrl?: string;
  error?: "not_ready" | "capture_failed";
};

export type CompanionFrame = {
  dataUrl: string;
  features: number[];
};

let requestSequence = 0;

export function luminanceGridFeatures(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): number[] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 4 ||
    height < 4
  ) {
    throw new Error("Companion frame dimensions must be at least 4x4");
  }
  if (pixels.length < width * height * 4) {
    throw new Error("Companion frame pixel buffer is incomplete");
  }

  const features: number[] = [];
  for (let gridY = 0; gridY < 4; gridY += 1) {
    const startY = Math.floor((gridY * height) / 4);
    const endY = Math.floor(((gridY + 1) * height) / 4);
    for (let gridX = 0; gridX < 4; gridX += 1) {
      const startX = Math.floor((gridX * width) / 4);
      const endX = Math.floor(((gridX + 1) * width) / 4);
      let total = 0;
      let samples = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * width + x) * 4;
          total +=
            (0.299 * pixels[offset]! +
              0.587 * pixels[offset + 1]! +
              0.114 * pixels[offset + 2]!) /
            255;
          samples += 1;
        }
      }
      features.push(samples > 0 ? total / samples : 0);
    }
  }
  return features;
}

export function requestCompanionFrame(
  timeoutMs = 4_000
): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const requestId = `companion-frame-${++requestSequence}`;

  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(COMPANION_FRAME_RESPONSE_EVENT, onResponse);
      resolve(value);
    };
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameResponseDetail>)
        .detail;
      if (!detail || detail.requestId !== requestId) return;
      finish(detail.dataUrl ?? null);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener(COMPANION_FRAME_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent<CompanionFrameRequestDetail>(
        COMPANION_FRAME_REQUEST_EVENT,
        {
          detail: { requestId, width: 64, height: 64 },
        }
      )
    );
  });
}

async function decodeFramePixels(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("Companion frame decode failed")),
      {
        once: true,
      }
    );
  });
  image.src = dataUrl;
  if (typeof image.decode === "function") {
    await image.decode().catch(() => loaded);
  } else {
    await loaded;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Companion feature canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export async function captureCompanionFrame(): Promise<CompanionFrame | null> {
  const dataUrl = await requestCompanionFrame();
  if (!dataUrl) return null;
  const image = await decodeFramePixels(dataUrl);
  return {
    dataUrl,
    features: luminanceGridFeatures(image.data, image.width, image.height),
  };
}
