import { expect, test, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";
import shipping from "../shared/worldAssetShipping.json";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable authenticated MariaDB");
const assets = async (page: Page) => JSON.parse(await page.getByTestId("world-assets-evidence").getAttribute("data-presentation") ?? "null");

async function chromiumRssBytes(): Promise<number> {
  const pids = (await readdir("/proc")).filter(name => /^\d+$/.test(name));
  const values = await Promise.all(pids.map(async pid => {
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      if (!/^Name:\s+(chrome|chromium)/m.test(status)) return 0;
      return Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0) * 1024;
    } catch { return 0; }
  }));
  return values.reduce((sum, value) => sum + value, 0);
}

for (const profile of [{name: "phone", width: 412, height: 915}, {name: "tablet", width: 800, height: 1280}, {name: "desktop", width: 1440, height: 1000}]) {
  test(`actual compressed asset delivery and decoder failure on ${profile.name}`, async ({page, baseURL}, testInfo) => {
    expect(baseURL).toBe("http://127.0.0.1:3000");
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/aurion_browser_test");
    await page.setViewportSize(profile);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    let peakJsHeapBytes = 0, peakChromiumProcessRssSumBytes = 0, samples = 0, sampling = false;
    const sample = async () => {
      if (sampling) return; sampling = true;
      try {
        const metrics = await cdp.send("Performance.getMetrics");
        peakJsHeapBytes = Math.max(peakJsHeapBytes, metrics.metrics.find(m => m.name === "JSHeapUsedSize")?.value ?? 0);
        peakChromiumProcessRssSumBytes = Math.max(peakChromiumProcessRssSumBytes, await chromiumRssBytes()); samples++;
      } finally { sampling = false; }
    };
    const timer = setInterval(() => { void sample().catch(() => undefined); }, 500);
    try {
      const health = await page.request.get("/healthz");
      expect(await health.json()).toMatchObject({status: "ok", revision: process.env.AURION_RELEASE_SHA});
      await register(page, `aim291_${profile.name}`);
      const compressed = await enterAx1(page);
      await expect.poll(async () => (await assets(page))?.shipping.ktxModels ?? 0, {timeout: 90_000}).toBeGreaterThan(0);
      await expect.poll(async () => (await assets(page))?.shipping.textures.transcodedMipPayloadBytes ?? 0, {timeout: 60_000}).toBeGreaterThan(0);
      await expect.poll(async () => (await assets(page))?.loading, {timeout: 60_000}).toBe(0);
      const compressedEvidence = await assets(page);
      expect(compressedEvidence.shipping.manifestSha256).toBe(shipping.manifest.manifestSha256);
      expect(compressedEvidence.failed).toBe(0);
      await page.screenshot({path: testInfo.outputPath("ktx2-rendered.png")});
      const compressedNetwork = await page.evaluate(() => performance.getEntriesByType("resource").filter(entry => /world-shipping|world-assets|\/basis\/|\/api\/assets\/glb\//.test(entry.name)).map(entry => {
        const r = entry as PerformanceResourceTiming;
        return {path: new URL(r.name).pathname, transferBytes: r.transferSize, encodedBytes: r.encodedBodySize, decodedHttpBytes: r.decodedBodySize, durationMs: r.duration};
      }));
      expect(compressedNetwork.some(entry => entry.path.endsWith(".ktx2.glb") && entry.decodedHttpBytes > 0)).toBe(true);
      await compressed.runtime.getByRole("button", {name: "ZUR STERNWARTE", exact: true}).click();
      await expect(page).toHaveURL(baseURL + "/");
      // A new page discards the previous Basis loader/worker/cache. Only the real
      // decoder network request is blocked; world state and manifests are untouched.
      await page.reload();
      let decoderFailures = 0;
      await page.route("**/basis/basis_transcoder.wasm", async route => { decoderFailures++; await route.abort("failed"); });
      const fallback = await enterAx1(page);
      await expect.poll(async () => (await assets(page))?.shipping.fallbackCount ?? 0, {timeout: 90_000}).toBeGreaterThan(0);
      await expect.poll(async () => (await assets(page))?.loading, {timeout: 60_000}).toBe(0);
      const fallbackEvidence = await assets(page);
      expect(decoderFailures).toBeGreaterThan(0);
      expect(fallbackEvidence.shipping.ktxModels).toBe(0);
      expect(fallbackEvidence.failed).toBe(0);
      expect(fallbackEvidence.rendered).toBeGreaterThan(0);
      expect(fallbackEvidence.catalogHash).toBe(compressedEvidence.catalogHash);
      expect(fallbackEvidence.collisionHash).toBe(compressedEvidence.collisionHash);
      expect(fallback.snapshot.globalWorld.deterministicHash).toBe(compressed.snapshot.globalWorld.deterministicHash);
      for (const stage of [compressedEvidence, fallbackEvidence]) {
        const r = stage.shipping.resources, l = r.limits;
        expect(r.tier).toBe(profile.name);
        expect(r.peakDecoderJobs).toBeLessThanOrEqual(l.decoderJobs);
        expect(r.peakNetworkInFlightBytes).toBeLessThanOrEqual(l.networkBytes);
        expect(r.peakReservedDecodedBytes).toBeLessThanOrEqual(l.decodedBytes);
        expect(r.peakAssetWorkingSetCeilingBytes).toBeLessThanOrEqual(l.assetWorkingSetBytes);
        expect(r.reservedTextureBytes).toBeLessThanOrEqual(l.textureBytes);
        expect(r.models).toBeLessThanOrEqual(l.cacheModels);
        expect(r.actors).toBeLessThanOrEqual(l.actors);
        expect(r.animations).toBeLessThanOrEqual(l.animations);
        expect(r.decodedCount).toBeGreaterThan(0);
        expect(r.totalDecodeMs).toBeGreaterThan(0);
        expect(r.fetchedBytes).toBeGreaterThan(0);
      }
      await page.screenshot({path: testInfo.outputPath("decoder-failure-fallback.png")});
      await sample();
      expect(peakJsHeapBytes).toBeGreaterThan(0);
      expect(peakChromiumProcessRssSumBytes).toBeGreaterThan(0);
      expect(errors).toEqual([]);
      await testInfo.attach("asset-shipping-evidence", {contentType: "application/json", body: JSON.stringify({
        revision: process.env.AURION_RELEASE_SHA, profile, driver: "CI Chromium SwiftShader; native mobile hardware unverified",
        worldHash: compressed.snapshot.globalWorld.deterministicHash, decoderFailures,
        compressed: compressedEvidence, fallback: fallbackEvidence, network: compressedNetwork,
        memory: {samples, intervalMs: 500, peakJsHeapBytes, peakChromiumProcessRssSumBytes,
          interpretation: "Sampled CDP JS heap and sum of Chromium process RSS. RSS includes shared-page double counting; neither is native-device RAM or GPU VRAM. Asset reservations are conservative application allocation ceilings."},
      })});
    } finally { clearInterval(timer); }
  });
}
