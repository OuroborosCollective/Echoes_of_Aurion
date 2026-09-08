import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("shared/worldCollisionManifest.json", "utf8"));
test.skip(process.env.AURION_COLLISION_E2E !== "1", "Isolated collision runtime required");

type Presence = { userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number };

async function registerAndEnter(page: Page, handle: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
  await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
  await dialog.getByLabel("Passwort", { exact: true }).fill(["Aurion", "collision", "e2e", "only!"].join("-"));
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
  const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
  await expect(launch).toBeVisible({ timeout: 30_000 });
  await launch.click();
  await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
  await expect(page.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
}

test("real movement crosses a chunk, passes decoration, collides with a tree and agrees across browser plus MariaDB", async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.pathname).toBe("/aurion_group_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const desktop = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const phone = await browser.newContext({ baseURL, viewport: { width: 412, height: 915 } });
  const mover = await desktop.newPage();
  const observer = await phone.newPage();
  const errors: string[] = [];
  let moverId = 0;
  let current: Presence | undefined;
  let remote: Presence | undefined;
  let stopSeq = 0;

  const observe = (page: Page, moverSide: boolean) => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framesent", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (moverSide && value.type === "move" && !value.input.x && !value.input.z) stopSeq = value.clientSeq;
        } catch {}
      });
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (!["welcome", "snapshot"].includes(value.type) || !Array.isArray(value.presences)) return;
          if (moverSide && !moverId && value.presences.length === 1) moverId = value.presences[0].userId;
          const found = value.presences.find((entry: Presence) => entry.userId === moverId);
          if (moverSide) current = found;
          else remote = found;
        } catch {}
      });
    });
  };
  observe(mover, true);
  observe(observer, false);

  const driveUntil = async (key: string, predicate: () => boolean, timeout = 15_000) => {
    const beforeStop = stopSeq;
    await mover.keyboard.down(key);
    try { await expect.poll(predicate, { intervals: [25], timeout }).toBe(true); }
    finally { await mover.keyboard.up(key); }
    await expect.poll(() => stopSeq, { timeout: 10_000 }).toBeGreaterThan(beforeStop);
    await expect.poll(() => current?.lastAcceptedClientSeq, { timeout: 10_000 }).toBe(stopSeq);
  };

  try {
    await registerAndEnter(mover, "nature_collision_mover");
    await expect.poll(() => moverId).toBeGreaterThan(0);
    await registerAndEnter(observer, "nature_collision_observer");
    await expect.poll(() => remote?.userId).toBe(moverId);

    await driveUntil("w", () => !!current && current.position.z <= -39780, 20_000);
    const crossed = structuredClone(current!);
    expect(crossed.position.x).toBe(0);
    expect(Math.abs(crossed.position.z) % 340).toBe(0);
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT chunkX,chunkZ,positionX,positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [moverId]);
      return rows.some(row => row.chunkX === 0 && row.chunkZ === -1 && row.positionX === crossed.position.x && row.positionZ === crossed.position.z + 64000);
    }, { timeout: 10_000 }).toBe(true);

    await driveUntil("d", () => !!current && current.position.x >= 10200);
    const passedDecoration = structuredClone(current!);
    expect(passedDecoration.position.x).toBeGreaterThan(9000);
    await driveUntil("a", () => !!current && current.position.x <= 0);
    await driveUntil("w", () => !!current && current.position.z <= -55760);

    const response = await mover.request.get("/api/trpc/worldAssets.regionV2?input=" + encodeURIComponent(JSON.stringify({ json: { x: 0, z: -1 } })));
    expect(response.ok()).toBe(true);
    const region = (await response.json()).result.data.json;
    expect(region.version).toBe("aurion-world-assets.v2");
    expect(region.collisionHash).toBe(manifest.manifestSha256);
    const obstacle = region.placements.find((entry: { assetId: string; xMm: number; zMm: number }) => entry.assetId === "nature-tree-oak-6" && entry.xMm === -24000 && entry.zMm === -56000);
    expect(obstacle).toBeDefined();
    expect(manifest.colliders.find((entry: { assetId: string }) => entry.assetId === "nature-tree-oak-6").blocksMovement).toBe(true);
    expect(manifest.colliders.find((entry: { assetId: string }) => entry.assetId === "nature-stump-3").blocksMovement).toBe(false);

    await driveUntil("a", () => !!current && current.position.x <= -18000);
    const beforeBlock = structuredClone(current!);
    await mover.keyboard.down("a");
    try {
      await mover.waitForTimeout(1_200);
      const first = structuredClone(current!);
      await mover.waitForTimeout(600);
      const second = structuredClone(current!);
      expect(second.position).toEqual(first.position);
    } finally { await mover.keyboard.up("a"); }

    // Releasing input can leave already-sent movement frames in flight. The
    // collision invariant is the confirmed position, not a pre-release client
    // sequence number. Wait for those frames to drain and prove that the player
    // remains at the same blocked position across consecutive server snapshots.
    await mover.waitForTimeout(600);
    const released = structuredClone(current!);
    await mover.waitForTimeout(600);
    const settled = structuredClone(current!);
    expect(settled.position).toEqual(released.position);
    expect(settled.lastAcceptedClientSeq).toBeGreaterThanOrEqual(released.lastAcceptedClientSeq);

    const stopped = settled;
    expect(stopped.position.x).toBeLessThanOrEqual(beforeBlock.position.x);
    await expect.poll(() => remote?.position, { timeout: 10_000 }).toEqual(stopped.position);
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT chunkX,chunkZ,positionX,positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [moverId]);
      return rows.some(row => row.chunkX * 64000 + row.positionX === stopped.position.x && row.chunkZ * 64000 + row.positionZ === stopped.position.z);
    }, { timeout: 10_000 }).toBe(true);

    await mover.screenshot({ path: info.outputPath("desktop-nature-collision.png") });
    await observer.screenshot({ path: info.outputPath("phone-shared-world.png") });
    expect(errors).toEqual([]);
    await info.attach("world-collision-readback", {
      body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, moverId, crossed, passedDecoration, stopped, remote, obstacle, collisionHash: region.collisionHash, launchRoute: "portal-confirmed-ax1-single-action" }),
      contentType: "application/json",
    });
  } finally {
    await desktop.close();
    await phone.close();
    await pool.end();
  }
});
