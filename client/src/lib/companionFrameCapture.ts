import {
  COMPANION_FEATURE_VECTOR_LENGTH,
  COMPANION_FRAME_MAX_AGE_MS,
} from "@shared/companionLearningProtocol";

export const COMPANION_FRAME_REQUEST_EVENT = "aurion:companion-frame-request" as const;
export const COMPANION_FRAME_RESPONSE_EVENT = "aurion:companion-frame-response" as const;

export type CompanionFrameRequestDetail = Readonly<{ requestId: string; captureStartedAt: number }>;
export type CompanionFrameResponseDetail = Readonly<{
  requestId: string;
  frameDataUrl?: string;
  capturedAt?: number;
  error?: "busy" | "unavailable" | "capture_failed";
}>;

export type CompanionFrameSample = Readonly<{
  frameDataUrl: string;
  featureVector: readonly number[];
  capturedAt: number;
}>;

let requestSequence = 0;
function requestIdentity(): string {
  if (!Number.isSafeInteger(requestSequence + 1)) throw new Error("COMPANION_REQUEST_SEQUENCE_OVERFLOW");
  return `companion-frame-${++requestSequence}`;
}

export function extractCompanionFrameFeatures(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): number[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || rgba.length !== width * height * 4) {
    throw new Error("Companion frame buffer is invalid");
  }
  const features: number[] = [];
  const cellWidth = width / 4;
  const cellHeight = height / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const startX = Math.floor(column * cellWidth);
      const endX = Math.max(startX + 1, Math.floor((column + 1) * cellWidth));
      const startY = Math.floor(row * cellHeight);
      const endY = Math.max(startY + 1, Math.floor((row + 1) * cellHeight));
      let total = 0;
      let samples = 0;
      for (let y = startY; y < Math.min(height, endY); y += 2) {
        for (let x = startX; x < Math.min(width, endX); x += 2) {
          const offset = (y * width + x) * 4;
          total += (0.299 * rgba[offset]! + 0.587 * rgba[offset + 1]! + 0.114 * rgba[offset + 2]!) / 255;
          samples += 1;
        }
      }
      features.push(samples ? total / samples : 0.5);
    }
  }
  return features;
}

export async function createCompanionFrameSample(frameDataUrl: string, capturedAt: number): Promise<CompanionFrameSample> {
  if (!/^data:image\/(png|webp);base64,/.test(frameDataUrl) || frameDataUrl.length > 262_144 || !Number.isInteger(capturedAt) || capturedAt <= 0) {
    throw new Error("Companion frame response is invalid");
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error("Companion frame decode failed"));
    candidate.src = frameDataUrl;
  });
  if (image.naturalWidth < 4 || image.naturalHeight < 4 || image.naturalWidth > 512 || image.naturalHeight > 512) throw new Error("Companion frame dimensions are invalid");
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, image.naturalWidth || image.width);
  canvas.height = Math.max(4, image.naturalHeight || image.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Companion frame scratch canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const featureVector = extractCompanionFrameFeatures(pixels.data, pixels.width, pixels.height);
  if (featureVector.length !== COMPANION_FEATURE_VECTOR_LENGTH) throw new Error("Companion frame feature contract failed");
  return { frameDataUrl, featureVector, capturedAt };
}

export function isFreshCompanionFrame(
  sample: CompanionFrameSample | null,
  now: number,
  maximumAgeMs = COMPANION_FRAME_MAX_AGE_MS,
): sample is CompanionFrameSample {
  return Boolean(
    sample
    && Number.isSafeInteger(now) && now > 0
    && Number.isSafeInteger(maximumAgeMs) && maximumAgeMs >= 0
    && Number.isSafeInteger(sample.capturedAt) && sample.capturedAt > 0
    && sample.featureVector.length === COMPANION_FEATURE_VECTOR_LENGTH
    && sample.featureVector.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    && now >= sample.capturedAt
    && now - sample.capturedAt <= maximumAgeMs,
  );
}

export async function requestCompanionFrame(captureStartedAt: number, timeoutMs = 1_000): Promise<CompanionFrameSample | null> {
  if (typeof window === "undefined" || !Number.isSafeInteger(captureStartedAt) || captureStartedAt < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) return null;
  const requestId = requestIdentity();
  return await new Promise<CompanionFrameSample | null>((resolve) => {
    let settled = false;
    const finish = (sample: CompanionFrameSample | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(COMPANION_FRAME_RESPONSE_EVENT, onResponse);
      resolve(sample);
    };
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameResponseDetail>).detail;
      if (!detail || detail.requestId !== requestId) return;
      if (detail.error || !detail.frameDataUrl || detail.capturedAt !== captureStartedAt) {
        finish(null);
        return;
      }
      void createCompanionFrameSample(detail.frameDataUrl, detail.capturedAt).then(finish).catch(() => finish(null));
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener(COMPANION_FRAME_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(new CustomEvent<CompanionFrameRequestDetail>(COMPANION_FRAME_REQUEST_EVENT, { detail: { requestId, captureStartedAt } }));
  });
}
