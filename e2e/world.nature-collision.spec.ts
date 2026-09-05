import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync("shared/worldCollisionManifest.json", "utf8")
);

test.skip(
  process.env.AURION_COLLISION_E2E !== "1",
  "Isolated collision runtime required"
);
test("real desktop movement crosses a chunk, passes small decoration and collides with a tree, and agrees with a phone observer and MariaDB", async ({
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
  const streamWindows: Array<{ x: number; z: number }> = [];
  mover.on("response", async response => {
    if (!response.url().includes("gameplay.worldChunkWindow")) return;
    try {
      const payload = await response.json();
      for (const item of Array.isArray(payload) ? payload : [payload]) {
        const data = item.result?.data?.json;
        if (data?.center && Array.isArray(data.chunks)) streamWindows.push(data.center);
      }
    } catch {}
  });
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
    await expect
      .poll(() => stopSeq > 0 && current?.lastAcceptedClientSeq === stopSeq)
      .toBe(true);
    const crossed = { ...current!.position };
    expect(crossed.x).toBe(0);
    expect(crossed.z).toBeGreaterThan(-41000);
    await expect.poll(() => streamWindows.at(-1), { timeout: 3000 }).toEqual({x:0,z:-1});
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT chunkX,chunkZ,positionX,positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL",[moverId]);
      return rows.map(r=>({x:r.chunkX,z:r.chunkZ,positionX:r.positionX,positionZ:r.positionZ}));
    }, {timeout:3000}).toContainEqual({x:0,z:-1,positionX:crossed.x,positionZ:crossed.z+64000});
    await expect
      .poll(async () => (await evidence(mover)).center?.z, { timeout: 15000 })
      .toBe(-1);
    const driveUntil = async (
      key: string,
      reached: () => boolean,
      timeout = 15000
    ) => {
      const previousStop = stopSeq;
      await mover.keyboard.down(key);
      try {
        await expect.poll(reached, { intervals: [25], timeout }).toBe(true);
      } finally {
        await mover.keyboard.up(key);
      }
      await expect.poll(() => stopSeq).toBeGreaterThan(previousStop);
      await expect
        .poll(() => current?.lastAcceptedClientSeq === stopSeq)
        .toBe(true);
    };
    // The supplied Stump_3 sits at (8,-40)m. Small decoration must be passable.
    await driveUntil("d", () => !!current && current.position.x >= 10200);
    const passedDecoration = structuredClone(current!);
    expect(passedDecoration.position.x).toBeGreaterThan(9000);
    await driveUntil("a", () => !!current && current.position.x <= 0);
    await driveUntil("w", () => !!current && current.position.z <= -55760);
    const response = await mover.request.get(
      "/api/trpc/worldAssets.regionV2?input=" +
        encodeURIComponent(JSON.stringify({ json: { x: 0, z: -1 } }))
    );
    expect(response.ok()).toBe(true);
    const region = (await response.json()).result.data.json;
    expect(region.collisionHash).toBe(manifest.manifestSha256);
    expect(region.version).toBe("aurion-world-assets.v2");
    const legacyResponse = await mover.request.get("/api/trpc/worldAssets.region?input="+encodeURIComponent(JSON.stringify({json:{x:0,z:-1}})));
    expect(legacyResponse.ok()).toBe(true);
    const legacyRegion=(await legacyResponse.json()).result.data.json;
    expect(Object.keys(legacyRegion).sort()).toEqual(["version","catalogHash","worldId","center","placements"].sort());
    expect(legacyRegion.version).toBe("aurion-world-assets.v1");
    expect(legacyRegion.placements).toEqual(region.placements);
    const obstacle = region.placements.find(
      (p: { assetId: string; xMm: number; zMm: number }) =>
        p.assetId === "nature-tree-oak-6" &&
        p.xMm === -24000 &&
        p.zMm === -56000
    );
    expect(obstacle).toBeDefined();
    const source = manifest.colliders.find(
      (c: { assetId: string }) => c.assetId === obstacle.assetId
    );
    expect(source.blocksMovement).toBe(true);
    expect(
      manifest.colliders.find(
        (c: { assetId: string }) => c.assetId === "nature-stump-3"
      ).blocksMovement
    ).toBe(false);
    const hull = source.hullMm.map(([x, z]: [number, number]) =>
      obstacle.rotation === 0
        ? [x, z]
        : obstacle.rotation === 1
          ? [z, -x]
          : obstacle.rotation === 2
            ? [-x, -z]
            : [-z, x]
    );
    // Independent geometric measurement of the actual stopped snapshot. The test
    // does not call the production collision resolver to decide its expectations.
    const distanceToHull = (position: { x: number; z: number }) => {
      const px = position.x - obstacle.xMm,
        pz = position.z - obstacle.zMm;
      return Math.min(
        ...hull.map(([ax, az]: [number, number], i: number) => {
          const [bx, bz] = hull[(i + 1) % hull.length],
            dx = bx - ax,
            dz = bz - az;
          const t = Math.max(
            0,
            Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))
          );
          return Math.hypot(px - ax - t * dx, pz - az - t * dz);
        })
      );
    };
    await mover.keyboard.down("a");
    try {
      await expect
        .poll(() => current?.position.x, { timeout: 8000 })
        .toBeLessThan(-18000);
      await expect
        .poll(
          () =>
            !!current &&
            distanceToHull({
              x: current.position.x - 340,
              z: current.position.z,
            }) <
              manifest.playerRadiusMm + manifest.quantizationMarginMm,
          { timeout: 8000 }
        )
        .toBe(true);
      const blocked = { ...current!.position };
      const renderedFrames = await mover.evaluate(async () => {
        const samples: Array<{position:{x:number;z:number};rendered:{x:number;z:number}}> = [];
        for(let i=0;i<60;i++) {
          await new Promise(requestAnimationFrame);
          samples.push(JSON.parse(document.querySelector<HTMLElement>("#three-viewport")!.dataset.playerProjection!));
        }
        return samples;
      });
      for(const frame of renderedFrames) for(const position of [frame.position,frame.rendered]) {
        expect(position.x*1000).toBeCloseTo(blocked.x,6);
        expect(position.z*1000).toBeCloseTo(blocked.z,6);
      }
      expect(current!.position).toEqual(blocked);
    } finally {
      await mover.keyboard.up("a");
    }
    await expect
      .poll(() => stopSeq > 0 && current?.lastAcceptedClientSeq === stopSeq)
      .toBe(true);
    const stopped = structuredClone(current!);
    expect(distanceToHull(stopped.position)).toBeGreaterThanOrEqual(
      manifest.playerRadiusMm
    );
    expect(distanceToHull(stopped.position)).toBeLessThan(
      manifest.playerRadiusMm + 341
    );
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
        { timeout: 3000 }
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
      expect.objectContaining({ id: "nature-tree-oak-6" })
    );
    await mover.screenshot({
      path: info.outputPath("desktop-nature-collision.png"),
    });
    await observer.screenshot({
      path: info.outputPath("phone-shared-world.png"),
    });
    // Backing away must work immediately after contact.
    await mover.keyboard.down("d");
    try {
      await expect
        .poll(() => current?.position.x)
        .toBeGreaterThan(stopped.position.x);
    } finally {
      await mover.keyboard.up("d");
    }
    expect(errors).toEqual([]);
    await info.attach("world-collision-readback", {
      body: JSON.stringify({
        revision: process.env.AURION_RELEASE_SHA,
        auth: "public_registration",
        crossed,
        passedDecoration,
        stopped,
        remote,
        obstacle,
        visual,
        streamWindows,
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
