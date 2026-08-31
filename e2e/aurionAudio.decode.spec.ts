import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

type AudioAsset = {
  role: string;
  source: string;
  bytes: number;
  sha256: string;
  durationSeconds: number;
};

const manifest = JSON.parse(
  readFileSync(new URL("../shared/audioAssetIntegrity.json", import.meta.url), "utf8"),
) as { assets: AudioAsset[] };

for (const viewport of [
  { name: "Android phone", width: 412, height: 915 },
  { name: "Android tablet", width: 800, height: 1280 },
]) {
  test(`loads all bound soundtrack masters and decodes expedition music on ${viewport.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/?aurion_preview=open-world");

    for (const asset of manifest.assets) {
      const browserResponse = await page.evaluate(async (url) => {
        const response = await fetch(url, { cache: "no-store" });
        const body = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", body);
        const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        return {
          ok: response.ok,
          status: response.status,
          bytes: body.byteLength,
          sha256,
          contentEncoding: response.headers.get("content-encoding"),
          contentLength: response.headers.get("content-length"),
        };
      }, `/audio/${asset.source}`);

      expect(browserResponse.ok, `${asset.source} browser response status ${browserResponse.status}`).toBe(true);
      expect(browserResponse.bytes, `${asset.source} browser response bytes`).toBe(asset.bytes);
      expect(browserResponse.sha256, `${asset.source} browser response SHA-256`).toBe(asset.sha256);

      const metadata = await page.evaluate(async (url) => {
        return await new Promise<{ duration: number; error?: string }>((resolve) => {
          const audio = new Audio();
          const timer = window.setTimeout(() => resolve({ duration: Number.NaN, error: "metadata-timeout" }), 20_000);
          audio.preload = "metadata";
          audio.onloadedmetadata = () => {
            window.clearTimeout(timer);
            resolve({ duration: audio.duration });
          };
          audio.onerror = () => {
            window.clearTimeout(timer);
            resolve({ duration: Number.NaN, error: `media-error-${audio.error?.code ?? "unknown"}` });
          };
          audio.src = url;
          audio.load();
        });
      }, `/audio/${asset.source}`);

      expect(metadata.error, `${asset.source} browser metadata`).toBeUndefined();
      expect(metadata.duration).toBeGreaterThan(asset.durationSeconds - 0.05);
      expect(metadata.duration).toBeLessThan(asset.durationSeconds + 0.05);
    }

    const decoded = await page.evaluate(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return { duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate };
      } finally {
        await context.close();
      }
    }, "/audio/ambient-forest.wav");

    expect(decoded.channels).toBe(2);
    expect(decoded.sampleRate).toBe(44_100);
    expect(decoded.duration).toBeGreaterThan(118.33);
    expect(decoded.duration).toBeLessThan(118.44);
  });
}
