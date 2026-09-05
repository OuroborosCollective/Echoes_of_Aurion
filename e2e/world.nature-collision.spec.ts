import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { WORLD_PRESENCE_REFRESH_MS } from "../server/worldPresenceProtocol";
import { worldNatureCollision } from "../server/worldNatureCollision";
import manifest from "../shared/worldCollisionManifest.json";

test.skip(
  process.env.AURION_COLLISION_E2E !== "1",
  "Isolated collision runtime required"
);
test("real desktop movement crosses a chunk, collides with the supplied stump, and agrees with a phone observer and MariaDB", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(180000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.pathname).toBe("/aurion_group_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const desktop = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
    }),
    phone = await browser.newContext({
      baseURL,
      viewport: { width: 412, height: 915 },
    });
  const mover = await desktop.newPage(),
    observer = await phone.newPage();
  type Presence = {
    userId: number;
    position: { x: number; z: number };
    lastAcceptedClientSeq: number;
  };
  let moverId = 0,
    current: Presence | undefined,
    remote: Presence | undefined,
    stopSeq = 0;
  const errors: string[] = [],
    frames: unknown[] = [];
  const observe = (page: Page, isMover: boolean) => {
    page.on("pageerror", e => errors.push(e.message));
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framesent", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (
            isMover &&
            value.type === "move" &&
            !value.input.x &&
            !value.input.z
          )
            stopSeq = value.clientSeq;
        } catch {}
      });
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (!["welcome", "snapshot"].includes(value.type)) return;
          if (isMover && !moverId && value.presences.length === 1)
            moverId = value.presences[0].userId;
          const found = value.presences.find(
            (p: Presence) => p.userId === moverId
          );
          if (isMover) current = found;
          else remote = found;
          if (found && frames.length < 1500)
            frames.push({
              observer: !isMover,
              tick: value.tick,
              sequence: value.snapshotSeq,
              presence: found,
            });
        } catch {}
      });
    });
  };
  observe(mover, true);
  observe(observer, false);
  const enter = async (page: Page, handle: string) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("tab", { name: "Konto anlegen", exact: true })
      .click();
    await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
    await dialog
      .getByLabel("Passwort", { exact: true })
      .fill("Aurion-isolated-collision-proof!");
    await dialog
      .getByRole("button", { name: "Aurion-Konto erstellen", exact: true })
      .click();
    await page
      .getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ })
      .click();
    await page
      .getByRole("button", { name: "IN DIE OPEN WORLD", exact: true })
      .click();
    await expect(
      page.getByText("BEWEGUNG VERBUNDEN", { exact: true })
    ).toBeVisible({ timeout: 45000 });
  };
  const evidence = async (page: Page) =>
    JSON.parse(
      (await page
        .getByTestId("world-assets-evidence")
        .getAttribute("data-presentation")) || "{}"
    );
  try {
    await enter(mover, "nature_collision_mover");
    await expect.poll(() => moverId).toBeGreaterThan(0);
    await enter(observer, "nature_collision_observer");
    await expect.poll(() => remote?.userId).toBe(moverId);
    // Drive the actual keyboard input. A frame observer releases W at the target
    // distance; no teleport, direct state mutation or test-only server endpoint.
    await mover.keyboard.down("w");
    try {
      await expect
        .poll(() => current?.position.z, { intervals: [25], timeout: 20000 })
        .toBeLessThanOrEqual(-39780);
    } finally {
      await mover.keyboard.up("w");
    }
    await expect.poll(() => current?.lastAcceptedClientSeq).toBe(stopSeq);
    const crossed = { ...current!.position };
    expect(crossed.x).toBe(0);
    expect(crossed.z).toBeGreaterThan(-41000);
    await expect
      .poll(async () => (await evidence(mover)).center?.z, { timeout: 15000 })
      .toBe(-1);
    await mover.keyboard.down("d");
    try {
      await expect
        .poll(() => current?.position.x, { timeout: 8000 })
        .toBeGreaterThan(5000);
      await expect
        .poll(
          () =>
            !!current &&
            !!worldNatureCollision.blockingObstacle(current.position, {
              x: current.position.x + 340,
              z: current.position.z,
            }),
          { timeout: 8000 }
        )
        .toBe(true);
      const blocked = { ...current!.position };
      await mover.waitForTimeout(1200);
      expect(current!.position).toEqual(blocked);
    } finally {
      await mover.keyboard.up("d");
    }
    await expect.poll(() => current?.lastAcceptedClientSeq).toBe(stopSeq);
    const stopped = structuredClone(current!);
    const obstacle = worldNatureCollision.blockingObstacle(stopped.position, {
      x: stopped.position.x + 340,
      z: stopped.position.z,
    });
    expect(obstacle?.assetId).toBe("nature-stump-3");
    await expect.poll(() => remote).toEqual(stopped);
    await expect
      .poll(
        async () => {
          const [rows] = await pool.query<RowDataPacket[]>(
            "SELECT chunkX,chunkZ,positionX,positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL",
            [moverId]
          );
          return rows.some(
            r =>
              r.chunkX === 0 &&
              r.chunkZ === -1 &&
              r.chunkX * 64000 + r.positionX === stopped.position.x &&
              r.chunkZ * 64000 + r.positionZ === stopped.position.z
          );
        },
        { timeout: WORLD_PRESENCE_REFRESH_MS + 10000 }
      )
      .toBe(true);
    await expect
      .poll(async () => (await evidence(mover)).loading, { timeout: 60000 })
      .toBe(0);
    const visual = await evidence(mover);
    expect(visual.failed).toBe(0);
    expect(visual.collisionHash).toBe(manifest.manifestSha256);
    expect(visual.origin).toEqual({ x: 0, z: -64 });
    expect(visual.selected).toContainEqual(
      expect.objectContaining({ id: "nature-stump-3" })
    );
    await mover.screenshot({
      path: info.outputPath("desktop-nature-collision.png"),
    });
    await observer.screenshot({
      path: info.outputPath("phone-shared-world.png"),
    });
    // Backing away must work immediately after contact.
    await mover.keyboard.down("a");
    try {
      await expect
        .poll(() => current?.position.x)
        .toBeLessThan(stopped.position.x);
    } finally {
      await mover.keyboard.up("a");
    }
    expect(errors).toEqual([]);
    await info.attach("world-collision-readback", {
      body: JSON.stringify({
        revision: process.env.AURION_RELEASE_SHA,
        auth: "public_registration",
        crossed,
        stopped,
        remote,
        obstacle,
        visual,
        frames,
        storage: "chunk-local INT with exact global reconstruction",
      }),
      contentType: "application/json",
    });
  } finally {
    await desktop.close();
    await phone.close();
    await pool.end();
  }
});
