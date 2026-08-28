export type CompanionFrameSample = Readonly<{
  frameDataUrl: string;
  featureVector: readonly number[];
  capturedAt: number;
}>;

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

export async function createCompanionFrameSample(frameDataUrl: string, capturedAt = Date.now()): Promise<CompanionFrameSample> {
  if (!frameDataUrl.startsWith("data:image/")) throw new Error("Companion frame must be an image data URL");
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error("Companion frame decode failed"));
    candidate.src = frameDataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, image.naturalWidth || image.width);
  canvas.height = Math.max(4, image.naturalHeight || image.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Companion frame scratch canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    frameDataUrl,
    featureVector: extractCompanionFrameFeatures(pixels.data, pixels.width, pixels.height),
    capturedAt,
  };
}

export function isFreshCompanionFrame(sample: CompanionFrameSample | null, now = Date.now(), maximumAgeMs = 1_250): sample is CompanionFrameSample {
  return Boolean(sample && Number.isFinite(sample.capturedAt) && sample.featureVector.length === 16 && now >= sample.capturedAt && now - sample.capturedAt <= maximumAgeMs);
}
