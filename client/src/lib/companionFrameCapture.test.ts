import { describe, expect, it } from "vitest";
import {
  extractCompanionFrameFeatures,
  isFreshCompanionFrame,
  type CompanionFrameSample,
} from "./companionFrameCapture";

describe("Aurion companion frame capture", () => {
  it("derives exactly sixteen bounded luminance features", () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      const value = ((index / 4) % 8) * 32;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    const features = extractCompanionFrameFeatures(pixels, 8, 8);
    expect(features).toHaveLength(16);
    expect(features.every(value => value >= 0 && value <= 1)).toBe(true);
  });

  it("fails closed for malformed frame buffers", () => {
    expect(() => extractCompanionFrameFeatures(new Uint8ClampedArray(12), 4, 4)).toThrow(/invalid/);
    expect(() => extractCompanionFrameFeatures(new Uint8ClampedArray(4 * 4 * 4), 3, 4)).toThrow(/invalid/);
  });

  it("accepts only fresh, sixteen-feature samples", () => {
    const now = 2_000;
    const sample: CompanionFrameSample = {
      frameDataUrl: "data:image/webp;base64,AAAA",
      featureVector: new Array(16).fill(0.5),
      capturedAt: 1_500,
    };
    expect(isFreshCompanionFrame(sample, now, 750)).toBe(true);
    expect(isFreshCompanionFrame(sample, now, 250)).toBe(false);
    expect(isFreshCompanionFrame({ ...sample, featureVector: new Array(15).fill(0.5) }, now, 750)).toBe(false);
  });
});
