import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { WORLD_PRESENCE_REFRESH_MS } from "../server/worldPresenceProtocol";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const enabled = process.env.AURION_E2E_ISOLATED === "1";
test.skip(!enabled, "Requires the dedicated isolated migration CI environment");

type Presence = { userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number };

async function register(page: Page, handle: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
  await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
  await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-regression-254!");
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
}

async function enterAx1(page: Page): Promise<{ runtime: ReturnType<Page["getByTestId"]>; snapshot: any }> {
  const solo = page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ });
  const enter = page.getByRole("button", { name: "IN DIE OPEN WORLD", exact: true });
  await expect(solo.or(enter).first()).toBeVisible({ timeout: 30_000 });
  if (await solo.isVisible()) await solo.click();
  const response = page.waitForResponse(candidate => candidate.url().includes("gameplay.enterOpenWorld") && candidate.status() === 200);
  await enter.click();
  const body = await (await response).json();
  const snapshot = (Array.isArray(body) ? body : [body]).map(value => value.result?.data?.json).find(Boolean);
  const runtime = page.getByTestId("xaurion-open-world-runtime");
  await expect(runtime).toBeVisible();
  await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#three-viewport canvas")).toBeVisible();
  await expect(page.locator(".xaurion-runtime__error")).toHaveCount(0);
  return { runtime, snapshot };
}

for (const viewport of [
  { name: "phone", width: 412, height: 915 },
  { name: "tablet", width: 800, height: 1280 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`registered player enters AX1, moves, persists presence and returns on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    expect(baseURL).toBe("http://127.0.0.1:3000");
    const target = new URL(process.env.DATABASE_URL ?? "");
    expect(target.hostname).toBe("127.0.0.1");
    expect(target.pathname).toBe("/aurion_browser_test");
    const pool = createPool(process.env.DATABASE_URL!);
    const errors: string[] = [];
    let latestPresence: Presence | undefined;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /shader|WebGLProgram|render.*failed/i.test(message.text())) errors.push(message.text()); });
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (["welcome", "snapshot"].includes(value.type) && Array.isArray(value.presences) && value.presences.length === 1) latestPresence = value.presences[0];
        } catch { /* Only valid zone snapshots count. */ }
      });
    });

    try {
      await page.setViewportSize(viewport);
      const health = await page.request.get("/healthz");
      expect(await health.json()).toMatchObject({ status: "ok", revision: process.env.AURION_RELEASE_SHA });
      await register(page, `aim254_${viewport.name}`);
      await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
      await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
      const first = await enterAx1(page);
      expect(first.snapshot?.globalWorld?.worldSeed).toBe("echoes-of-aurion-v1");
      expect(first.snapshot?.globalWorld?.deterministicHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
      await expect.poll(() => latestPresence?.userId).toBeGreaterThan(0);

      const initial = { ...latestPresence!.position };
      await page.keyboard.down("w");
      try {
        await expect.poll(() => latestPresence && (latestPresence.position.x !== initial.x || latestPresence.position.z !== initial.z), { timeout: 15_000 }).toBe(true);
      } finally { await page.keyboard.up("w"); }
      await expect.poll(async () => {
        const [rows] = await pool.query<RowDataPacket[]>("SELECT positionX, positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [latestPresence!.userId]);
        return rows.some(row => row.positionX !== initial.x || row.positionZ !== initial.z);
      }, { timeout: WORLD_PRESENCE_REFRESH_MS + 10_000 }).toBe(true);

      const [account] = await pool.query<RowDataPacket[]>("SELECT u.role, p.level FROM users u JOIN playerProfiles p ON p.userId=u.id WHERE u.id=?", [latestPresence!.userId]);
      expect(account).toEqual([expect.objectContaining({ role: "user", level: 1 })]);
      const [legacySessions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?", [latestPresence!.userId]);
      const [legacyActions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE userId=?", [latestPresence!.userId]);
      expect(Number(legacySessions[0].count)).toBe(0);
      expect(Number(legacyActions[0].count)).toBe(0);

      if (viewport.name === "desktop") {
        await page.locator("#three-viewport canvas").evaluate((element: HTMLCanvasElement) => {
          const context = element.getContext("webgl2") || element.getContext("webgl");
          const extension = context?.getExtension("WEBGL_lose_context");
          if (!extension) throw new Error("CONTEXT_LOSS_TEST_EXTENSION_REQUIRED");
          extension.loseContext();
        });
        await expect(first.runtime.getByText("OPEN WORLD ANGEHALTEN", { exact: true })).toBeVisible();
      }

      await first.runtime.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
      await expect(page.getByTestId("xaurion-open-world-runtime")).toHaveCount(0);
      await expect(page).toHaveURL("http://127.0.0.1:3000/");
      await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
      await expect.poll(async () => {
        const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS active FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [latestPresence!.userId]);
        return Number(rows[0].active);
      }, { timeout: 15_000 }).toBe(0);

      const second = await enterAx1(page);
      await expect(second.runtime).toBeVisible();
      expect(second.snapshot?.globalWorld?.deterministicHash).toBe(first.snapshot?.globalWorld?.deterministicHash);
      const [legacySessionsAfter] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?", [latestPresence!.userId]);
      expect(Number(legacySessionsAfter[0].count)).toBe(0);
      expect(errors).toEqual([]);
      await testInfo.attach("migration-readback", {
        body: JSON.stringify({ viewport: viewport.name, revision: process.env.AURION_RELEASE_SHA, authenticatedUserId: latestPresence!.userId, worldHash: first.snapshot?.globalWorld?.deterministicHash, persistedPresenceVerified: true, movementAccepted: true, returnedAndReentered: true, legacyGameplaySessions: 0, contextLossChecked: viewport.name === "desktop" }),
        contentType: "application/json",
      });
    } finally { await page.close(); await pool.end(); }
  });
}

test("two authenticated AX1 clients converge and departure removes the remote actor", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL ?? "");
  expect(target.hostname).toBe("127.0.0.1");
  expect(target.pathname).toBe("/aurion_browser_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const leftContext = await browser.newContext({ baseURL, viewport: { width: 800, height: 1280 } });
  const rightContext = await browser.newContext({ baseURL, viewport: { width: 412, height: 915 } });
  const left = await leftContext.newPage(), right = await rightContext.newPage();
  let leftView: Presence[] = [], rightView: Presence[] = [], leftStopSequence = 0;
  const errors: string[] = [];
  const observe = (page: Page, update: (presences: Presence[]) => void) => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      if (page === left) socket.on("framesent", frame => {
        try { const value = JSON.parse(String(frame.payload)); if (value.type === "move" && value.input?.x === 0 && value.input?.z === 0) leftStopSequence = value.clientSeq; } catch {}
      });
      socket.on("framereceived", frame => {
        try { const value = JSON.parse(String(frame.payload)); if (["welcome", "snapshot"].includes(value.type) && Array.isArray(value.presences)) update(value.presences); } catch {}
      });
    });
  };
  observe(left, value => { leftView = value; });
  observe(right, value => { rightView = value; });

  try {
    await register(left, "aim254_coop_left");
    await left.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    await enterAx1(left);
    await expect.poll(() => leftView.length).toBe(1);
    const leftUserId = leftView[0].userId;

    await register(right, "aim254_coop_right");
    await right.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    await enterAx1(right);
    await expect.poll(() => leftView.length).toBe(2);
    await expect.poll(() => rightView.length).toBe(2);
    const rightUserId = rightView.find(p => p.userId !== leftUserId)!.userId;
    await expect(left.getByTestId("confirmed-remote-player-count")).toHaveText("1 andere Explorer verbunden");
    await expect(right.getByTestId("confirmed-remote-player-count")).toHaveText("1 andere Explorer verbunden");

    const initial = { ...rightView.find(p => p.userId === leftUserId)!.position };
    const stopBefore = leftStopSequence;
    await left.keyboard.down("w");
    try {
      await expect.poll(() => rightView.find(p => p.userId === leftUserId)?.position.z, { timeout: 15_000 }).not.toBe(initial.z);
    } finally { await left.keyboard.up("w"); }
    await expect.poll(() => leftStopSequence, { timeout: 15_000 }).toBeGreaterThan(stopBefore);
    await expect.poll(() => {
      const a = leftView.find(p => p.userId === leftUserId), b = rightView.find(p => p.userId === leftUserId);
      return Boolean(a && b && a.lastAcceptedClientSeq >= leftStopSequence && b.lastAcceptedClientSeq >= leftStopSequence && a.position.x === b.position.x && a.position.z === b.position.z);
    }, { timeout: 15_000 }).toBe(true);

    await left.getByTestId("xaurion-open-world-runtime").getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    await expect(left.getByTestId("xaurion-open-world-runtime")).toHaveCount(0);
    await expect.poll(() => rightView.map(p => p.userId), { timeout: 15_000 }).toEqual([rightUserId]);
    await expect(right.getByTestId("confirmed-remote-player-count")).toHaveText("0 andere Explorer verbunden");
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS active FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [leftUserId]);
      return Number(rows[0].active);
    }, { timeout: 15_000 }).toBe(0);
    expect(errors).toEqual([]);
    await testInfo.attach("two-account-readback", { body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, leftUserId, rightUserId, replicatedMovement: true, departedActorRemoved: true, databasePresenceReleased: true }), contentType: "application/json" });
  } finally { await leftContext.close(); await rightContext.close(); await pool.end(); }
});

test("explicit companion learning captures the visible AX1 world and stores a bounded human demonstration", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL ?? "");
  expect(target.hostname).toBe("127.0.0.1");
  expect(target.pathname).toBe("/aurion_browser_test");
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    await page.setViewportSize({ width: 800, height: 1280 });
    await register(page, "aim239_companion");
    await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    const { runtime } = await enterAx1(page);
    await runtime.getByRole("button", { name: "Weitere Menüs", exact: true }).click();
    await runtime.getByRole("button", { name: "Companion", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Companion verbinden", exact: true })).toBeVisible();
    const pairingResponse = page.waitForResponse(response => response.url().includes("gateway.createSession") && response.status() === 200);
    await dialog.getByRole("button", { name: "Companion verbinden", exact: true }).click();
    const pairBody = await (await pairingResponse).json();
    const pair = (Array.isArray(pairBody) ? pairBody[0] : pairBody).result.data.json;
    expect(pair.sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
    const [gateway] = await pool.query<RowDataPacket[]>("SELECT userId FROM gatewaySessions WHERE id=?", [pair.sessionId]);
    expect(gateway).toHaveLength(1);
    const userId = Number(gateway[0].userId);
    await expect(dialog.getByText("0 lokale Beobachtungszeilen", { exact: true })).toBeVisible();

    await page.evaluate(() => {
      const canvas = document.querySelector("#three-viewport canvas") as HTMLCanvasElement | null;
      if (!canvas) throw new Error("AX1_CANVAS_REQUIRED");
      const events: Record<string, unknown>[] = [{ framebufferWidth: canvas.width, framebufferHeight: canvas.height }];
      (window as any).captureDiagnostics = events;
      for (const name of ["aurion:world-demonstration", "aurion:companion-frame-request", "aurion:companion-frame-response", "aurion:companion-dataset-updated"]) {
        window.addEventListener(name, event => {
          const d = (event as CustomEvent).detail ?? {};
          events.push({ event: name, requestId: d.requestId, kind: d.kind, error: d.error, count: d.count, featureCount: d.featureVector?.length, frameLength: typeof d.frameDataUrl === "string" ? d.frameDataUrl.length : undefined });
          if (events.length > 100) events.shift();
        });
      }
    });

    await dialog.getByRole("button", { name: "Aufzeichnung starten", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const persisted = page.waitForResponse(response => response.url().includes("companion.persistObservation") && response.status() === 200, { timeout: 30_000 });
    await page.keyboard.down("w");
    let receipt: { memoryHash: string };
    try { const body = await (await persisted).json(); receipt = (Array.isArray(body) ? body[0] : body).result.data.json; }
    finally {
      await page.keyboard.up("w");
      await testInfo.attach("capture-events", { body: JSON.stringify(await page.evaluate(() => (window as any).captureDiagnostics)), contentType: "application/json" });
    }
    expect(receipt!.memoryHash).toMatch(/^[0-9a-f]{64}$/);
    const sessionId = `cmp_${pair.sessionId}`;
    const lines = (await readFile(`data/companion-memory/user-${userId}/${sessionId}.jsonl`, "utf8")).trim().split("\n");
    const line = lines.find(value => createHash("sha256").update(`${value}\n`).digest("hex") === receipt!.memoryHash)!;
    expect(line).toBeTruthy();
    const observation = JSON.parse(line);
    expect(observation.featureVector).toHaveLength(16);
    expect(observation.featureVector.every((value: number) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(new Set(observation.featureVector).size).toBeGreaterThan(1);
    expect(observation.stateMask).toEqual([0, 0, 0, 0, 0, 0]);
    expect(observation.stateVector).toEqual([0, 0, 0, 0, 0, 0]);

    await runtime.getByRole("button", { name: "Weitere Menüs", exact: true }).click();
    await runtime.getByRole("button", { name: "Companion", exact: true }).click();
    await expect(dialog.getByText(/^[1-9][0-9]* lokale Beobachtungszeilen$/)).toBeVisible();
    await dialog.getByRole("button", { name: "Aufzeichnung beenden", exact: true }).click();
    await runtime.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    await expect(page.getByTestId("xaurion-open-world-runtime")).toHaveCount(0);
    await testInfo.attach("visible-companion-readback", { body: JSON.stringify({ userId, sessionId, memoryHash: receipt!.memoryHash, featureCount: 16, unknownStateMasked: true, rendererCount: 1 }), contentType: "application/json" });
  } finally { await page.close(); await pool.end(); }
});
