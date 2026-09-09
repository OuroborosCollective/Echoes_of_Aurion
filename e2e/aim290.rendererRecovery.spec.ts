import { expect, test, type Page } from "@playwright/test";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable authenticated MariaDB environment");

const evidence = async (page: Page) => JSON.parse(await page.getByTestId("renderer-evidence").textContent() ?? "null");
const assets = async (page: Page) => JSON.parse(await page.getByTestId("world-assets-evidence").getAttribute("data-presentation") ?? "null");

for (const profile of [{ name: "phone", width: 412, height: 915 }, { name: "tablet", width: 800, height: 1280 }, { name: "desktop", width: 1440, height: 1000 }]) {
  test(`authenticated backend parity and actual loss recovery on ${profile.name}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    expect(baseURL).toBe("http://127.0.0.1:3000");
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/aurion_browser_test");
    await page.setViewportSize(profile);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /shader|WebGPU|WebGLProgram|render.*failed/i.test(message.text())) errors.push(message.text()); });
    // Capture actual devices from the browser, without adding a production debug
    // mutation or manufacturing a device-loss event.
    await page.addInitScript(() => {
      if (!("GPUAdapter" in globalThis)) return;
      const original = GPUAdapter.prototype.requestDevice;
      const devices: GPUDevice[] = [];
      Object.assign(globalThis, { __aim290Devices: devices });
      GPUAdapter.prototype.requestDevice = async function (descriptor) {
        const device = await original.call(this, descriptor); devices.push(device); return device;
      };
    });
    const health = await page.request.get("/healthz");
    expect(await health.json()).toMatchObject({ status: "ok", revision: process.env.AURION_RELEASE_SHA });
    await register(page, `aim290_${profile.name}`);
    const baseline = await enterAx1(page);
    await expect.poll(async () => (await evidence(page))?.status).toBe("rendering");
    expect(await evidence(page)).toMatchObject({ backend: "webgl2", requested: "webgl2", recoveryAttempt: 0 });
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toMatch(/^[a-f0-9]{64}$/);
    const originalAssets = await assets(page);
    await page.screenshot({ path: testInfo.outputPath("webgl2.png") });
    await page.locator("#three-viewport canvas").evaluate((canvas: HTMLCanvasElement) => {
      const extension = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context");
      if (!extension) throw Error("ACTUAL_CONTEXT_LOSS_UNAVAILABLE");
      extension.loseContext();
    });
    await expect.poll(async () => (await evidence(page))?.recoveryAttempt, { timeout: 45_000 }).toBe(1);
    await expect.poll(async () => (await evidence(page))?.status, { timeout: 45_000 }).toBe("rendering");
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toBe(originalAssets.catalogHash);
    expect((await assets(page)).collisionHash).toBe(originalAssets.collisionHash);
    expect(await evidence(page)).toMatchObject({ backend: "webgl2", recoveryCause: "WEBGL_CONTEXT_LOST" });
    await expect(page.locator("#three-viewport canvas")).toHaveCount(1);
    await expect(baseline.runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("webgl2-recovered.png") });
    const glRecovery = await evidence(page);
    await baseline.runtime.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    await expect(page).toHaveURL(baseURL + "/");
    await page.evaluate(() => sessionStorage.setItem("aurion:renderer", "webgpu"));
    const optional = await enterAx1(page);
    await expect.poll(async () => (await evidence(page))?.status, { timeout: 45_000 }).toBe("rendering");
    const selected = await evidence(page);
    expect(selected.requested).toBe("webgpu");
    // This dedicated lane requires a real initialized WebGPU backend (SwiftShader
    // is software evidence). It cannot pass by silently testing only WebGL2.
    expect(selected.backend).toBe("webgpu");
    expect(selected.recoveryAttempt).toBe(0);
    expect(optional.snapshot.globalWorld.deterministicHash).toBe(baseline.snapshot.globalWorld.deterministicHash);
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toBe(originalAssets.catalogHash);
    expect((await assets(page)).collisionHash).toBe(originalAssets.collisionHash);
    await page.screenshot({ path: testInfo.outputPath("webgpu.png") });
    await page.evaluate(() => {
      const devices = (globalThis as typeof globalThis & { __aim290Devices: GPUDevice[] }).__aim290Devices;
      if (!devices?.length) throw Error("ACTUAL_WEBGPU_DEVICE_REQUIRED");
      devices.at(-1)!.destroy();
    });
    await expect.poll(async () => (await evidence(page))?.recoveryAttempt, { timeout: 45_000 }).toBe(1);
    await expect.poll(async () => (await evidence(page))?.status, { timeout: 45_000 }).toBe("rendering");
    expect(await evidence(page)).toMatchObject({ backend: "webgl2", recoveryCause: "WEBGPU_DEVICE_LOST" });
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toBe(originalAssets.catalogHash);
    await expect(page.locator("#three-viewport canvas")).toHaveCount(1);
    await expect(optional.runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("webgpu-recovered.png") });
    expect(errors).toEqual([]);
    await testInfo.attach("renderer-recovery", { contentType: "application/json", body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, profile: profile.name, driver: "CI SwiftShader software rendering; no hardware performance claim", worldHash: baseline.snapshot.globalWorld.deterministicHash, catalogHash: originalAssets.catalogHash, collisionHash: originalAssets.collisionHash, glRecovery, selected, gpuRecovery: await evidence(page), actualContextLoss: true, actualDeviceDestroy: true }) });
  });
}
