import { expect, test } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";

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
      await page.getByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/ }).click();
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
      }).toBe(true);
      const [account] = await pool.query<RowDataPacket[]>("SELECT u.role, p.level FROM users u JOIN playerProfiles p ON p.userId=u.id WHERE u.id=?", [latestPresence!.userId]);
      expect(account).toEqual([expect.objectContaining({ role: "user", level: 1 })]);
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
