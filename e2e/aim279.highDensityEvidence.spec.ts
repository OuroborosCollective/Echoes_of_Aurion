import { expect, test } from "@playwright/test";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable authenticated MariaDB");

for (const profile of [
  { name: "phone", width: 412, height: 915 },
  { name: "tablet", width: 800, height: 1280 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`AIM-279 real renderer evidence on ${profile.name}`, async ({ page, baseURL }, testInfo) => {
    expect(baseURL).toBe("http://127.0.0.1:3000");
    await page.setViewportSize({ width: profile.width, height: profile.height });

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));

    const health = await page.request.get("/healthz");
    expect(await health.json()).toMatchObject({
      status: "ok",
      revision: process.env.AURION_RELEASE_SHA,
    });

    await register(page, `aim279_${profile.name}`);
    await enterAx1(page);

    await expect(page.getByTestId("renderer-evidence")).toContainText(/webgl2|webgpu/, { timeout: 60_000 });
    await expect(page.getByTestId("glb-model-status")).toHaveText("active", { timeout: 90_000 });
    await expect(page.locator("#threejs-canvas")).toBeVisible({ timeout: 30_000 });

    await page.keyboard.down("w");
    await page.waitForTimeout(1500);
    await page.keyboard.up("w");

    await expect.poll(
      async () => page.getByTestId("runtime-performance-evidence").getAttribute("data-evidence"),
      { timeout: 30_000, message: `live performance evidence missing for ${profile.name}` },
    ).not.toBeNull();

    const performanceEvidence = JSON.parse(
      await page.getByTestId("runtime-performance-evidence").getAttribute("data-evidence") ?? "null",
    );
    const worldAssets = JSON.parse(
      await page.getByTestId("world-assets-evidence").getAttribute("data-presentation") ?? "null",
    );
    const rendererEvidence = JSON.parse(
      await page.getByTestId("renderer-evidence").textContent() ?? "null",
    );

    expect(performanceEvidence.samples).toBeGreaterThanOrEqual(120);
    expect(performanceEvidence.frameTimeMs.p50).toBeGreaterThan(0);
    expect(performanceEvidence.frameTimeMs.p95).toBeGreaterThan(0);
    expect(performanceEvidence.frameTimeMs.p99).toBeGreaterThan(0);
    expect(performanceEvidence.frameTimeMs.p99).toBeLessThan(1_000);
    expect(performanceEvidence.render.maxCallsPerFrame).toBeGreaterThan(0);
    expect(performanceEvidence.render.maxTrianglesPerFrame).toBeGreaterThan(0);
    expect(worldAssets?.failed ?? 0).toBe(0);
    expect(errors).toEqual([]);

    await testInfo.attach("aim279-runtime-evidence", {
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        recordType: "aurion_aim279_runtime_evidence",
        revision: process.env.AURION_RELEASE_SHA,
        profile,
        renderer: rendererEvidence,
        performance: performanceEvidence,
        worldAssets,
        movement: { source: "AX1 keyboard", authoritativePath: "ZoneMovementClient", durationMs: 1500 },
        interpretation: "Real active /play browser evidence. Browser/SwiftShader timings are not native mobile GPU performance proof.",
      }, null, 2),
    });
  });
}
