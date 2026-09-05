import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { WORLD_PRESENCE_REFRESH_MS } from "../server/worldPresenceProtocol";

// This test creates disposable accounts through the public registration UI.
// It is forbidden against a production endpoint or non-isolated database.
const enabled = process.env.AURION_E2E_ISOLATED === "1";
test.skip(!enabled, "Requires the dedicated isolated migration CI environment");

for (const viewport of [
  { name: "phone", width: 412, height: 915 },
  { name: "tablet", width: 800, height: 1280 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`registered player enters, moves, persists presence and returns on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    expect(baseURL).toBe("http://127.0.0.1:3000");
    const target = new URL(process.env.DATABASE_URL ?? "");
    expect(target.hostname).toBe("127.0.0.1");
    expect(target.pathname).toBe("/aurion_browser_test");
    const pool = createPool(process.env.DATABASE_URL!);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0].name).toBe("aurion_browser_test");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /shader|WebGLProgram|render.*failed/i.test(message.text())) errors.push(message.text()); });
    let latestPresence: { userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number } | undefined;
    let confirmedWorld: { epoch: number; deterministicHash: string; worldSeed: string } | undefined;
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (["welcome", "snapshot"].includes(value.type) && Array.isArray(value.presences) && value.presences.length === 1) latestPresence = value.presences[0];
        } catch { /* Other frames cannot count as movement evidence. */ }
      });
    });
    try {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const health = await page.request.get("/healthz");
      expect(await health.json()).toMatchObject({ status: "ok", revision: process.env.AURION_RELEASE_SHA });
      await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
      const handle = `aim254_${viewport.name}`;
      await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
      await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-regression-254!");
      await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
      await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
      await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();

      const enter = async () => {
        const response = page.waitForResponse(response => response.url().includes("gameplay.enterOpenWorld") && response.status() === 200);
        await page.getByRole("button", { name: "IN DIE OPEN WORLD", exact: true }).click();
        const body = await (await response).json();
        const results = Array.isArray(body) ? body : [body];
        confirmedWorld = results.map(value => value.result?.data?.json?.globalWorld).find(Boolean);
        expect(confirmedWorld?.worldSeed).toBe("echoes-of-aurion-v1");
        expect(confirmedWorld?.deterministicHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
        const runtime = page.getByTestId("xaurion-open-world-runtime");
        await expect(runtime).toBeVisible();
        await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
        await expect(page.locator("#three-viewport canvas")).toBeVisible();
        await expect(page.locator(".xaurion-runtime__error")).toHaveCount(0);
        return runtime;
      };
      const runtime = await enter();
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
      const hud = page.getByTestId("authoritative-world-hud");
      await expect(hud.getByText("0 EP · 0 AURION", { exact: true })).toBeVisible();
      await hud.getByRole("button", { name: "Inventar", exact: true }).click();
      await expect(page.getByRole("dialog").getByText("Dein Inventar ist leer.", { exact: true })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      await hud.getByRole("button", { name: "Charakter", exact: true }).click();
      const characterDialog = page.getByRole("dialog");
      await expect(characterDialog.getByRole("button", { name: "Hüter", exact: true })).toBeDisabled();
      await characterDialog.getByRole("button", { name: "staff", exact: true }).click();
      await expect(characterDialog.getByText("Änderung vom Server bestätigt.", { exact: true })).toBeVisible();
      const [chosen] = await pool.query<RowDataPacket[]>("SELECT p.selectedClass, w.weaponTrack FROM playerProfiles p JOIN weaponLoadouts w ON w.userId=p.userId WHERE p.userId=?", [latestPresence!.userId]);
      expect(chosen[0]).toMatchObject({ selectedClass: "unbound", weaponTrack: "staff" });
      await characterDialog.getByRole("button", { name: "Close", exact: true }).click();
      await hud.getByRole("button", { name: "Weltatlas", exact: true }).click();
      await expect(page.getByRole("dialog").getByText(`Welt-Hash: ${confirmedWorld!.deterministicHash}`, { exact: true })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      const [world] = await pool.query<RowDataPacket[]>("SELECT epoch, snapshotHash FROM aurionGlobalWorldStates WHERE worldId='echoes-of-aurion-global'");
      // Reading a fresh world's canonical epoch must not create a write receipt.
      expect(world).toHaveLength(0);
      expect(confirmedWorld?.epoch).toBe(0);
      await page.locator("#three-viewport canvas").screenshot({ path: testInfo.outputPath(`${viewport.name}-world.png`) });

      if (viewport.name === "desktop") {
        await page.locator("#three-viewport canvas").evaluate((element: HTMLCanvasElement) => {
          const context = element.getContext("webgl2") || element.getContext("webgl");
          const extension = context?.getExtension("WEBGL_lose_context");
          if (!extension) throw new Error("CONTEXT_LOSS_TEST_EXTENSION_REQUIRED");
          extension.loseContext();
        });
        await expect(runtime.getByText("OPEN WORLD ANGEHALTEN", { exact: true })).toBeVisible();
      }
      await runtime.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
      await expect(runtime).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
      await expect.poll(async () => {
        const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS active FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [latestPresence!.userId]);
        return Number(rows[0].active);
      }).toBe(0);
      await enter();
      await expect(page.locator("#three-viewport canvas")).toHaveCount(1);
      expect(errors).toEqual([]);
      await testInfo.attach("migration-readback", { body: JSON.stringify({ viewport: viewport.name, revision: process.env.AURION_RELEASE_SHA, authenticatedUserId: latestPresence!.userId, world: confirmedWorld, worldReadbackMode: "canonical_initial_epoch_without_write", persistedPresenceVerified: true, movementAccepted: true, returnedAndReentered: true, contextLossChecked: viewport.name === "desktop" }), contentType: "application/json" });
    } finally { await page.close(); await pool.end(); }
  });
}

test("two authenticated accounts see the same confirmed movement and departure", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL ?? "");
  expect(target.hostname).toBe("127.0.0.1"); expect(target.pathname).toBe("/aurion_browser_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name"); expect(database[0].name).toBe("aurion_browser_test");
  const leftContext = await browser.newContext({ baseURL, viewport: { width: 800, height: 1280 } });
  const rightContext = await browser.newContext({ baseURL, viewport: { width: 412, height: 915 } });
  const left = await leftContext.newPage(), right = await rightContext.newPage();
  type Presence = { userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number };
  let leftView: Presence[] = [], rightView: Presence[] = [];
  const errors: string[] = [];
  const observe = (page: Page, update: (presences: Presence[]) => void) => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => { if (socket.url().endsWith("/v1/ws")) socket.on("framereceived", frame => {
      try { const value = JSON.parse(String(frame.payload)); if (["welcome", "snapshot"].includes(value.type) && Array.isArray(value.presences)) update(value.presences); } catch { /* Invalid frames cannot satisfy assertions. */ }
    }); });
  };
  observe(left, value => { leftView = value; }); observe(right, value => { rightView = value; });
  const enter = async (page: Page, handle: string) => {
    await page.goto("/");
    await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
    await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
    await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-regression-254!");
    await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
    await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    await page.getByRole("button", { name: "IN DIE OPEN WORLD", exact: true }).click();
    await expect(page.getByTestId("xaurion-open-world-runtime").getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("canvas")).toHaveCount(1);
  };
  try {
    await enter(left, "aim254_coop_left");
    await expect.poll(() => leftView.length).toBe(1);
    const leftUserId = leftView[0].userId;
    await enter(right, "aim254_coop_right");
    await expect.poll(() => leftView.length).toBe(2);
    await expect.poll(() => rightView.length).toBe(2);
    const rightUserId = rightView.find(p => p.userId !== leftUserId)!.userId;
    expect(rightUserId).not.toBe(leftUserId);
    await expect(left.getByTestId("confirmed-remote-player-count")).toHaveText("1 andere Explorer verbunden");
    await expect(right.getByTestId("confirmed-remote-player-count")).toHaveText("1 andere Explorer verbunden");
    const initial = { ...rightView.find(p => p.userId === leftUserId)!.position };
    await left.keyboard.down("w");
    try { await expect.poll(() => rightView.find(p => p.userId === leftUserId)?.position.z !== initial.z, { timeout: 15_000 }).toBe(true); }
    finally { await left.keyboard.up("w"); }
    await expect.poll(() => JSON.stringify(rightView.find(p => p.userId === leftUserId)?.position) === JSON.stringify(leftView.find(p => p.userId === leftUserId)?.position)).toBe(true);
    await expect.poll(async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT positionZ FROM aurionWorldPresenceLeases WHERE userId=? AND disconnectedAt IS NULL", [leftUserId]);
      return rows.some(row => row.positionZ !== initial.z);
    }, { timeout: WORLD_PRESENCE_REFRESH_MS + 10_000 }).toBe(true);
    await right.getByRole("button", { name: "Weltatlas", exact: true }).click();
    await expect(right.getByRole("dialog").getByText(new RegExp(`^Explorer ${leftUserId}:`))).toBeVisible();
    await right.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await right.locator("#three-viewport canvas").screenshot({ path: testInfo.outputPath("confirmed-other-player.png") });
    await left.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    await expect(right.getByTestId("confirmed-remote-player-count")).toHaveText("0 andere Explorer verbunden");
    await expect.poll(() => rightView.map(p => p.userId)).toEqual([rightUserId]);
    expect(errors).toEqual([]);
    await testInfo.attach("two-account-readback", { body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, leftUserId, rightUserId, replicatedMovement: true, databasePresenceVerified: true, departedActorRemoved: true }), contentType: "application/json" });
  } finally { await leftContext.close(); await rightContext.close(); await pool.end(); }
});

test("native encounter survives a world return and commits the quest reward once", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL ?? "");
  expect(target.hostname).toBe("127.0.0.1"); expect(target.pathname).toBe("/aurion_browser_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name"); expect(database[0].name).toBe("aurion_browser_test");
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 412, height: 915 }); await page.goto("/");
    await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
    await dialog.getByLabel("Rufname", { exact: true }).fill("aim253_encounter");
    await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-regression-253!");
    await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
    await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    const enter = async () => {
      await page.getByRole("button", { name: "IN DIE OPEN WORLD", exact: true }).click();
      await expect(page.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.locator("canvas")).toHaveCount(1);
    };
    await enter();
    const hud = page.getByTestId("authoritative-world-hud");
    await hud.getByRole("button", { name: "Aufträge & Kontakte", exact: true }).click();
    await dialog.getByRole("button", { name: "Bei Lyra annehmen", exact: true }).click();
    await expect(dialog.getByText("Änderung vom Server bestätigt.", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await hud.getByRole("button", { name: "Begegnungen", exact: true }).click();
    await dialog.getByRole("button", { name: "Sternwarte Asterion beginnen", exact: true }).click();
    const attack = hud.getByRole("button", { name: "Angreifen", exact: true });
    await expect(attack).toBeEnabled();
    const firstAction = page.waitForResponse(response => response.url().includes("gameplay.act") && response.status() === 200);
    await attack.click(); await firstAction;
    const [before] = await pool.query<RowDataPacket[]>("SELECT s.* FROM gameplaySessions s JOIN users u ON u.id=s.userId WHERE u.name='aim253_encounter' AND s.status='active'");
    expect(before).toHaveLength(1); expect(before[0].bossHp).toBeLessThan(before[0].maxBossHp); expect(before[0].nextSequence).toBe(2);
    await page.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    await expect(page.getByTestId("xaurion-open-world-runtime")).toHaveCount(0);
    await enter();
    await expect(hud.getByText(`${before[0].bossHp} / ${before[0].maxBossHp} LP`, { exact: true })).toBeVisible();
    for (let step = 0; step < 20; step++) {
      const [state] = await pool.query<RowDataPacket[]>("SELECT status FROM gameplaySessions WHERE id=?", [before[0].id]);
      if (state[0].status === "completed") break;
      await expect(attack).toBeEnabled();
      const response = page.waitForResponse(response => response.url().includes("gameplay.act") && response.status() === 200);
      await attack.click(); await response;
    }
    await expect(hud.getByText("Keine aktive Begegnung", { exact: true })).toBeVisible();
    const [completed] = await pool.query<RowDataPacket[]>("SELECT s.status, s.bossHp, q.state FROM gameplaySessions s JOIN gameplayQuestProgress q ON q.completionSessionId=s.id WHERE s.id=?", [before[0].id]);
    expect(completed[0]).toMatchObject({ status: "completed", bossHp: 0, state: "ready_to_turn_in" });
    await hud.getByRole("button", { name: "Aufträge & Kontakte", exact: true }).click();
    await dialog.getByRole("button", { name: "Bei Lyra abgeben", exact: true }).click();
    await expect(dialog.getByText("Änderung vom Server bestätigt.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Bei Lyra abgeben", exact: true })).toHaveCount(0);
    const [reward] = await pool.query<RowDataPacket[]>("SELECT p.totalXp, p.aurionPoints, q.state FROM playerProfiles p JOIN gameplayQuestProgress q ON q.userId=p.userId WHERE p.userId=? AND q.questKey='astral_call'", [before[0].userId]);
    expect(reward[0]).toMatchObject({ totalXp: 122, aurionPoints: 20, state: "completed" });
    expect(errors).toEqual([]);
    await testInfo.attach("encounter-readback", { body: JSON.stringify({ sessionId: before[0].id, userId: before[0].userId, resumedWithoutReset: true, questCompleted: true, reward: reward[0] }), contentType: "application/json" });
  } finally { await page.close(); await pool.end(); }
});
