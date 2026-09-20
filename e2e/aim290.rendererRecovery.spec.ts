import { expect, test, type Page } from "@playwright/test";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable authenticated MariaDB environment");

const evidence = async (page: Page) => JSON.parse(await page.getByTestId("renderer-evidence").textContent() ?? "null");
const assets = async (page: Page) => JSON.parse(await page.getByTestId("world-assets-evidence").getAttribute("data-presentation") ?? "null");
const chunks = async (page: Page) => JSON.parse(await page.locator("#three-viewport").getAttribute("data-chunk-projection") ?? "null");
const rpcData = (body: any) => body.result?.data?.json;

// Isolated real authority: an authenticated action, running zone receipts and the
// normal epoch resolver. No fabricated receipt, world root or chunk payload.
async function commitConstructionEpoch(page: Page, handle: string) {
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionCausalTickReceipts WHERE worldId=? AND revision=?", [GLOBAL_WORLD_ID, process.env.AURION_RELEASE_SHA]);
      return Number(rows[0]!.n);
    }, { timeout: 30_000 }).toBeGreaterThan(0);
    const base = await page.request.get("/api/trpc/gameplay.worldChunk", { params: { input: JSON.stringify({ json: { worldVersion: "aurion-global-world.v1", expectedBaseRevision: 1, chunkX: 0, chunkZ: 0 } }) } });
    expect(base.ok()).toBe(true);
    const placed = await page.request.post("/api/trpc/gameplay.applyWorldChunkAction", { data: { json: {
      kind: "place_structure", coordinate: { x: 0, z: 0 }, expectedBaseRevision: 1,
      expectedBaseHash: rpcData(await base.json()).generation.baseHash,
      assetKey: "aurion_tripo_starpath_marker", xMm: 34_000, zMm: 34_000,
      idempotencyKey: `step28-construction-${handle}`,
    } } });
    expect(placed.ok(), await placed.text()).toBe(true);
    expect(rpcData(await placed.json()).source).toBe("created");
    await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle=?", [handle]);
    const resolved = await page.request.post("/api/trpc/admin.world.resolveEpoch", { data: { json: { idempotencyKey: `step28-browser-epoch-${handle}` } } });
    expect(resolved.ok(), await resolved.text()).toBe(true);
    const epoch = rpcData(await resolved.json()).plan.epoch;
    const projection = await page.request.get("/api/trpc/gameplay.worldChunkProjectionV2", { params: { input: JSON.stringify({ json: { epoch, chunkX: 0, chunkZ: 0 } }) } });
    expect(projection.ok()).toBe(true);
    const packet = rpcData(await projection.json());
    expect(packet).toMatchObject({ status: "VERIFIED", epoch, sourceRevision: process.env.AURION_RELEASE_SHA, membership: "COMMITTED_CHUNK_RECEIPT", mutationAuthority: "none" });
    expect(JSON.parse(packet.payloadJson).structures).toHaveLength(1);
    return { epoch, worldRootHash: packet.manifest.worldCausalRoot, projectionHash: packet.manifest.projectionHash, payloadHash: packet.manifest.payloadHash };
  } finally {
    await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='user' WHERE c.handle=?", [handle]);
    await pool.end();
  }
}

async function expectChunkProjection(page: Page, worldRootHash: string) {
  await expect.poll(async () => (await chunks(page))?.status, { timeout: 45_000 }).toBe("APPLIED");
  await expect.poll(async () => (await chunks(page))?.meshCount, { timeout: 45_000 }).toBeGreaterThan(0);
  expect((await chunks(page)).worldRootHash).toBe(worldRootHash);
}

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
    const handle = `aim290_${profile.name}`;
    await register(page, handle);
    const warmup = await enterAx1(page);
    const projection = await commitConstructionEpoch(page, handle);
    await warmup.runtime.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    const baseline = await enterAx1(page);
    expect(baseline.snapshot.globalWorld.epoch).toBe(projection.epoch);
    await expect.poll(async () => (await evidence(page))?.status).toBe("rendering");
    expect(await evidence(page)).toMatchObject({ backend: "webgl2", requested: "webgl2", recoveryAttempt: 0 });
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toMatch(/^[a-f0-9]{64}$/);
    const originalAssets = await assets(page);
    await expectChunkProjection(page, projection.worldRootHash);
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
    await expectChunkProjection(page, projection.worldRootHash);
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
    await expectChunkProjection(page, projection.worldRootHash);
    expect(optional.snapshot.globalWorld.deterministicHash).toBe(baseline.snapshot.globalWorld.deterministicHash);
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toBe(originalAssets.catalogHash);
    expect((await assets(page)).collisionHash).toBe(originalAssets.collisionHash);
    await page.screenshot({ path: testInfo.outputPath("webgpu.png") });
    const actualLoss = await page.evaluate(async () => {
      const devices = (globalThis as typeof globalThis & { __aim290Devices: GPUDevice[] }).__aim290Devices;
      if (!devices?.length) throw Error("ACTUAL_WEBGPU_DEVICE_REQUIRED");
      const device = devices.at(-1)!;
      device.destroy();
      const info = await device.lost;
      return { reason: info.reason, message: info.message };
    });
    expect(actualLoss.reason).toBe("destroyed");
    await expect.poll(async () => (await evidence(page))?.recoveryAttempt, { timeout: 45_000 }).toBe(1);
    await expect.poll(async () => (await evidence(page))?.status, { timeout: 45_000 }).toBe("rendering");
    expect(await evidence(page)).toMatchObject({ backend: "webgl2", recoveryCause: "WEBGPU_DEVICE_LOST" });
    await expectChunkProjection(page, projection.worldRootHash);
    await expect.poll(async () => (await assets(page))?.catalogHash, { timeout: 45_000 }).toBe(originalAssets.catalogHash);
    await expect(page.locator("#three-viewport canvas")).toHaveCount(1);
    await expect(optional.runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("webgpu-recovered.png") });
    expect(errors).toEqual([]);
    const persisted = await page.request.get("/api/trpc/gameplay.worldChunkProjectionV2", { params: { input: JSON.stringify({ json: { epoch: projection.epoch, chunkX: 0, chunkZ: 0 } }) } });
    expect(rpcData(await persisted.json())).toMatchObject({ status: "VERIFIED", manifest: { worldCausalRoot: projection.worldRootHash, projectionHash: projection.projectionHash, payloadHash: projection.payloadHash } });
    await testInfo.attach("renderer-recovery", { contentType: "application/json", body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, profile: profile.name, driver: "CI SwiftShader software rendering; no hardware performance claim", worldHash: baseline.snapshot.globalWorld.deterministicHash, catalogHash: originalAssets.catalogHash, collisionHash: originalAssets.collisionHash, projection, workerProjection: await chunks(page), glRecovery, selected, gpuRecovery: await evidence(page), actualContextLoss: true, actualDeviceDestroy: true, actualLoss }) });
  });
}
