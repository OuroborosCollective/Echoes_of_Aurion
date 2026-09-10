import { expect, test, type Page } from "@playwright/test";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { tsImport } from "tsx/esm/api";
import { testAnimatedPlayerGlb } from "../server/glbImportFixtures";
import { WASD_ZONE_CARDINAL_STEP_FIXED as STEP } from "../server/wasdZoneMovementProtocol";

const manifest = JSON.parse(readFileSync("shared/worldCollisionManifest.json", "utf8"));
test.skip(process.env.AURION_COLLISION_E2E !== "1", "Isolated collision runtime required");

type Presence = { userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number };

async function registerAndEnter(page: Page, handle: string, pool: Pool) {
  await page.goto("/");
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
  await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
  await dialog.getByLabel("Passwort", { exact: true }).fill(["Aurion", "collision", "e2e", "only!"].join("-"));
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
  const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
  await expect(launch).toBeVisible({ timeout: 30_000 });

  const publicDisplayName = `${handle} public avatar`;
  await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle=?", [handle]);
  const publicBytes = testAnimatedPlayerGlb(`${handle}_Public_Player`);
  const publicUpload = await page.request.post("/api/admin/glb-smart-upload", { data: {
    displayName: publicDisplayName,
    fileName: `${handle}-public-player.glb`,
    purpose: "player-public",
    contentBase64: publicBytes.toString("base64"),
  } });
  expect(publicUpload.status()).toBe(201);
  expect(await publicUpload.json()).toMatchObject({ accepted: true, purpose: "player-public", classification: { assetType: "character" }, receipt: { targetKey: null, status: "catalog" } });
  await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='user' WHERE c.handle=?", [handle]);

  await launch.click();
  await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
  const runtime = page.getByTestId("xaurion-open-world-runtime");
  await expect(runtime).toBeVisible();
  const gate = page.getByTestId("player-character-selection-gate");
  const publicAvatar = gate.getByRole("radio", { name: new RegExp(publicDisplayName) });
  await expect(publicAvatar).toBeVisible({ timeout: 45_000 });
  await publicAvatar.click();
  const selectionReply = page.waitForResponse(response => response.url().endsWith("/api/game/public-player-characters/select") && response.request().method() === "POST");
  await gate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
  const selected = await selectionReply;
  expect(selected.status()).toBe(200);
  expect(await selected.json()).toMatchObject({ visibility: "public", immutable: true });
  await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
}

test("real movement crosses a chunk, passes decoration, collides with a tree and agrees across browser plus MariaDB", async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.pathname).toBe("/aurion_group_test");
  // Scope TypeScript/JSON loading to the real server oracle. Playwright's native
  // ESM loader does not implement the JSON imports used by the bundled runtime.
  // No global loader registration, duplicated collision law or stand-in geometry.
  const { WorldNatureCollision } = await tsImport("../server/worldNatureCollision.ts", import.meta.url) as typeof import("../server/worldNatureCollision");
  const sourceCollision = new WorldNatureCollision();
  const pool = createPool(process.env.DATABASE_URL!);
  const desktop = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const phone = await browser.newContext({ baseURL, viewport: { width: 412, height: 915 } });
  const mover = await desktop.newPage();
  const observer = await phone.newPage();
  const errors: string[] = [];
  const samples: Array<{ tick: number; snapshotSeq: number; presence: Presence; alive: boolean | undefined }> = [];
  let phase = "entry";
  let moverId = 0;
  let current: Presence | undefined;
  let remote: Presence | undefined;
  let currentTick = -1;
  let currentSnapshotSeq = -1;
  let moverAlive: boolean | undefined;
  let stopSeq = 0;
  let lastSentMove: { clientSeq: number; input: { x: number; z: number } } | undefined;

  const observe = (page: Page, moverSide: boolean) => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framesent", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (moverSide && value.type === "move") {
            lastSentMove = value;
            if (!value.input.x && !value.input.z) stopSeq = value.clientSeq;
          }
        } catch {}
      });
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (!["welcome", "snapshot"].includes(value.type) || !Array.isArray(value.presences)) return;
          // Identity comes from this authenticated welcome, never the number/order of peers.
          if (moverSide && value.type === "welcome" && /^player:[1-9][0-9]*$/.test(value.selfEntityId)) moverId = Number(value.selfEntityId.slice(7));
          const found = value.presences.find((entry: Presence) => entry.userId === moverId);
          if (moverSide) {
            current = found;
            currentTick = value.tick;
            currentSnapshotSeq = value.snapshotSeq;
            moverAlive = value.combatants?.find((entry: { entityId: string }) => entry.entityId === `player:${moverId}`)?.alive;
            if (found) {
              samples.push({ tick: currentTick, snapshotSeq: currentSnapshotSeq, presence: structuredClone(found), alive: moverAlive });
              if (samples.length > 160) samples.shift();
            }
          } else remote = found;
        } catch {}
      });
    });
  };
  observe(mover, true);
  observe(observer, false);

  const waitForStop = async (beforeStop: number) => {
    await expect.poll(() => stopSeq, { timeout: 10_000 }).toBeGreaterThan(beforeStop);
    const expectedStop = stopSeq;
    await expect.poll(() => current?.lastAcceptedClientSeq, { timeout: 10_000 }).toBeGreaterThanOrEqual(expectedStop);
  };
  const driveUntil = async (key: string, predicate: () => boolean, timeout = 15_000) => {
    const beforeStop = stopSeq;
    await mover.keyboard.down(key);
    try { await expect.poll(predicate, { intervals: [25], timeout }).toBe(true); }
    finally { await mover.keyboard.up(key); }
    await waitForStop(beforeStop);
  };
  const alignRow = async (targetZ: number) => {
    // A coarse key-up can arrive several ticks after a sampled waypoint. Use
    // bounded real key presses plus stop acknowledgements; never edit position.
    for (let attempt = 0; attempt < 24; attempt++) {
      if (current && Math.abs(current.position.z - targetZ) <= STEP) return;
      expect(current).toBeDefined();
      expect(moverAlive).toBe(true);
      const beforeStop = stopSeq;
      await mover.keyboard.press(current!.position.z > targetZ ? "w" : "s", { delay: 150 + (attempt % 4) * 25 });
      await waitForStop(beforeStop);
    }
    throw new Error(`COLLISION_APPROACH_ROW_NOT_REACHED:${JSON.stringify({ targetZ, current })}`);
  };

  try {
    await registerAndEnter(mover, "nature_collision_mover", pool);
    await expect.poll(() => moverId).toBeGreaterThan(0);
    await registerAndEnter(observer, "nature_collision_observer", pool);
    await expect.poll(() => remote?.userId).toBe(moverId);

    phase = "cross-chunk";
    await driveUntil("w", () => !!current && current.position.z <= -39780, 20_000);
    const crossed = structuredClone(current!);
    expect(crossed.position.x).toBe(0);
    expect(Math.abs(crossed.position.z) % STEP).toBe(0);
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT chunkX,chunkZ,positionX,positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [moverId]);
      return rows.some(row => row.chunkX === 0 && row.chunkZ === -1 && row.positionX === crossed.position.x && row.positionZ === crossed.position.z + 64000);
    }, { timeout: 10_000 }).toBe(true);

    phase = "pass-decoration";
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

    phase = "align-tree-approach";
    const targetZ = Math.round(obstacle.zMm / STEP) * STEP;
    await alignRow(targetZ);
    const aligned = structuredClone(current!);
    expect(Math.abs(aligned.position.z - targetZ)).toBeLessThanOrEqual(STEP);
    await driveUntil("a", () => !!current && current.position.x <= -18000);
    const beforeBlock = structuredClone(current!);
    const blockingNextStep = () => current ? sourceCollision.blockingObstacle(current.position, { x: current.position.x - STEP, z: current.position.z }) : undefined;

    phase = "held-input-tree-contact";
    const beforeStop = stopSeq;
    await mover.keyboard.down("a");
    let heldProof: { first: Presence; second: Presence; firstTick: number; secondTick: number; firstSnapshotSeq: number; secondSnapshotSeq: number } | undefined;
    try {
      await expect.poll(() => lastSentMove?.input, { timeout: 10_000 }).toEqual({ x: -1, z: 0 });
      await expect.poll(() => blockingNextStep()?.id, { timeout: 15_000 }).toBe(obstacle.id);
      const first = structuredClone(current!);
      const firstTick = currentTick;
      const firstSnapshotSeq = currentSnapshotSeq;
      expect(moverAlive).toBe(true);
      expect(sourceCollision.blockingObstacle(first.position, first.position)).toBeUndefined();
      await expect.poll(() => currentTick, { timeout: 10_000 }).toBeGreaterThanOrEqual(firstTick + 8);
      expect(currentSnapshotSeq).toBeGreaterThan(firstSnapshotSeq);
      const second = structuredClone(current!);
      expect(second.position).toEqual(first.position);
      expect(blockingNextStep()?.id).toBe(obstacle.id);
      expect(moverAlive).toBe(true);
      expect(lastSentMove?.input).toEqual({ x: -1, z: 0 });
      heldProof = { first, second, firstTick, secondTick: currentTick, firstSnapshotSeq, secondSnapshotSeq: currentSnapshotSeq };
    } finally { await mover.keyboard.up("a"); }

    phase = "released-input-readback";
    await waitForStop(beforeStop);
    const released = structuredClone(current!);
    const releasedTick = currentTick;
    const releasedSnapshotSeq = currentSnapshotSeq;
    await expect.poll(() => currentTick, { timeout: 10_000 }).toBeGreaterThanOrEqual(releasedTick + 4);
    expect(currentSnapshotSeq).toBeGreaterThan(releasedSnapshotSeq);
    const settled = structuredClone(current!);
    expect(settled.position).toEqual(released.position);
    expect(settled.position).toEqual(heldProof!.second.position);
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
    phase = "complete";
    await info.attach("world-collision-readback", {
      body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, moverId, crossed, passedDecoration, aligned, heldProof, stopped, remote, obstacle, collisionHash: region.collisionHash, publicPlayerSelectedThroughAx1: true, launchRoute: "portal-confirmed-public-character-ax1-launch" }),
      contentType: "application/json",
    });
  } finally {
    await info.attach("world-collision-diagnostics", { body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, phase, moverId, current, remote, currentTick, currentSnapshotSeq, stopSeq, lastSentMove, samples, errors }), contentType: "application/json" });
    await desktop.close();
    await phone.close();
    await pool.end();
  }
});
