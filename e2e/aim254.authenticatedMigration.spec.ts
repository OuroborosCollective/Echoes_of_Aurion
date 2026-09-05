import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { WORLD_PRESENCE_REFRESH_MS } from "../server/worldPresenceProtocol";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

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
        const cityLayout = results.map(value => value.result?.data?.json?.worldKernel?.cityLayout).find(Boolean);
        expect(cityLayout?.receiptHash).toMatch(/^[a-f0-9]{64}$/);
        expect(cityLayout.entities).toHaveLength(3);
        const buildings = cityLayout.entities.filter((entity: { type: string }) => entity.type !== "road");
        expect(buildings).toHaveLength(2);
        expect(buildings.every((entity: { position: { y: number } }) => entity.position.y === 0)).toBe(true);
        expect(Math.hypot(buildings[0].position.x - buildings[1].position.x, buildings[0].position.z - buildings[1].position.z)).toBeGreaterThanOrEqual(2);
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
    await left.getByTestId("xaurion-open-world-runtime").getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
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
    await page.getByTestId("xaurion-open-world-runtime").getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
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
    await expect(hud.getByRole("region", { name: "Begegnung", exact: true })).toHaveAttribute("data-active", "false");
    const [completed] = await pool.query<RowDataPacket[]>("SELECT s.status, s.bossHp, q.state FROM gameplaySessions s JOIN gameplayQuestProgress q ON q.completionSessionId=s.id WHERE s.id=?", [before[0].id]);
    expect(completed[0]).toMatchObject({ status: "completed", bossHp: 0, state: "ready_to_turn_in" });
    await hud.getByRole("button", { name: "Aufträge & Kontakte", exact: true }).click();
    await dialog.getByRole("button", { name: "Bei Lyra abgeben", exact: true }).click();
    await expect(dialog.getByText("Änderung vom Server bestätigt.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Bei Lyra abgeben", exact: true })).toHaveCount(0);
    const [reward] = await pool.query<RowDataPacket[]>("SELECT p.totalXp, p.aurionPoints, q.state FROM playerProfiles p JOIN gameplayQuestProgress q ON q.userId=p.userId WHERE p.userId=? AND q.questKey='astral_call'", [before[0].userId]);
    expect(reward[0]).toMatchObject({ totalXp: 122, aurionPoints: 20, state: "completed" });
    await dialog.getByRole("tab", { name: "Kontakte", exact: true }).click();
    await expect(dialog.getByTestId("npc-standing-panel").getByText("Neutral · Ansehen 5", { exact: true })).toBeVisible();
    await expect(dialog.getByTestId("npc-decision-panel").getByText("Noch keine bestätigten Verhaltensentscheidungen für Lyra und Orun.", { exact: true })).toBeVisible();
    const [relationships] = await pool.query<RowDataPacket[]>("SELECT scopeKey,eventJson,eventHash FROM aurionScopedMasteryEvents WHERE userId=?", [before[0].userId]);
    expect(relationships).toHaveLength(2);
    for (const row of relationships) expect(createHash("sha256").update(row.eventJson).digest("hex")).toBe(row.eventHash);
    expect(relationships.map(row => row.scopeKey).sort()).toEqual(["v1:npc_relation:lyra", "v1:social:friendship"]);
    expect(errors).toEqual([]);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await hud.getByRole("button", { name: "Charakter", exact: true }).click();
    await dialog.getByRole("button", { name: "Gilde öffnen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Gildenverwaltung", exact: true })).toBeVisible();
    await expect(page.getByLabel("Gildenname", { exact: true })).toBeVisible({timeout:10_000});
    await page.getByLabel("Gildenname", { exact: true }).fill("Sternwacht Regression");
    await page.getByLabel("Gildenkürzel", { exact: true }).fill("A269B");
    const firstBankRead = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/api/guild/bank" && response.request().method() === "GET"
    );
    await page.getByRole("button", { name: "Gilde gründen", exact: true }).click({timeout:10_000});
    const bankResponse = await firstBankRead;
    const bankBody = await bankResponse.json();
    expect(bankResponse.status(), JSON.stringify(bankBody)).toBe(200);
    expect(bankBody).toMatchObject({ success: true, bank: { actorUserId: before[0].userId, playerPointsExact: "20" } });
    const bank = page.getByTestId("guild-bank-panel");
    await expect(bank.getByText("20 AURION", { exact: true })).toBeVisible();
    await bank.locator("summary").filter({ hasText: "Rolle, Territorien & Königreich" }).click();
    const politics = bank.getByTestId("guild-governance-panel");
    await expect(politics.getByText("Gründer", { exact: true })).toBeVisible();
    await expect(politics.getByText("Keine bestätigten Territorien.", { exact: true })).toBeVisible();
    await expect(politics.getByText("Kein bestätigtes Königreich.", { exact: true })).toBeVisible();
    const [guildRows] = await pool.query<RowDataPacket[]>("SELECT guildId FROM guildMemberships WHERE userId=? AND status='active'", [before[0].userId]);
    expect(guildRows).toHaveLength(1); const guildId = guildRows[0].guildId;
    const balances = async () => {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT p.aurionPoints, COALESCE(a.balance,0) AS treasury FROM playerProfiles p LEFT JOIN aurionGuildTreasuryAccounts a ON a.guildId=? WHERE p.userId=?", [guildId,before[0].userId]);
      return { wallet: Number(rows[0].aurionPoints), treasury: Number(rows[0].treasury) };
    };
    const apply = async () => {
      const receipt = page.waitForResponse(response => response.url().endsWith("/api/guild/bank/apply") && response.status() === 200);
      await bank.getByRole("button", { name: "Verbindlich bestätigen", exact: true }).click(); await receipt;
      await expect(bank.getByText("Die Bankänderung ist bestätigt.", { exact: true })).toBeVisible();
    };
    await bank.getByLabel("Betrag in AURION", { exact: true }).fill("5");
    await bank.getByRole("button", { name: "AURION einzahlen prüfen", exact: true }).click();
    await expect(bank.getByText("Betrag: 5 AURION", { exact: true })).toBeVisible();
    expect(await balances()).toEqual({ wallet: 20, treasury: 0 });
    await apply(); expect(await balances()).toEqual({ wallet: 15, treasury: 5 });
    await bank.getByLabel("Betrag in AURION", { exact: true }).fill("2");
    await bank.getByRole("button", { name: "AURION entnehmen prüfen", exact: true }).click(); await apply();
    expect(await balances()).toEqual({ wallet: 17, treasury: 3 });
    await bank.getByRole("button", { name: "Einlagern prüfen", exact: true }).first().click(); await apply();
    const [custody] = await pool.query<RowDataPacket[]>("SELECT itemId,itemRecordVersion,status FROM aurionGuildItemCustody WHERE guildId=?", [guildId]);
    expect(custody).toHaveLength(1); expect(custody[0].status).toBe("held");
    await bank.getByRole("button", { name: "Entnehmen prüfen", exact: true }).click(); await apply();
    const [released] = await pool.query<RowDataPacket[]>("SELECT status FROM aurionGuildItemCustody WHERE guildId=?", [guildId]);
    expect(released[0].status).toBe("withdrawn");
    const [bankReceipts] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionGuildBankReceipts WHERE guildId=?", [guildId]); expect(Number(bankReceipts[0].count)).toBe(4);
    await page.getByRole("button", { name: "Community-Konsole schließen", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(1); expect(errors).toEqual([]);
    await testInfo.attach("guild-bank-readback", { body: JSON.stringify({guildId, balances:await balances(), receipts:4, custody:released[0].status}), contentType:"application/json" });
    await testInfo.attach("encounter-readback", { body: JSON.stringify({ sessionId: before[0].id, userId: before[0].userId, resumedWithoutReset: true, questCompleted: true, reward: reward[0] }), contentType: "application/json" });
  } finally { await page.close(); await pool.end(); }
});

test("explicit companion learning captures the visible world and stores a bounded human demonstration", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL ?? "");
  expect(target.hostname).toBe("127.0.0.1"); expect(target.pathname).toBe("/aurion_browser_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name"); expect(database[0].name).toBe("aurion_browser_test");
  try {
    await page.setViewportSize({ width: 800, height: 1280 }); await page.goto("/");
    await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
    await dialog.getByLabel("Rufname", { exact: true }).fill("aim239_companion");
    await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-companion-regression!");
    await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
    await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    await page.getByRole("button", { name: "IN DIE OPEN WORLD", exact: true }).click();
    const runtime = page.getByTestId("xaurion-open-world-runtime");
    await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("canvas")).toHaveCount(1);
    await runtime.getByRole("button", { name: "Weitere Menüs", exact: true }).click();
    await runtime.getByRole("button", { name: "Companion", exact: true }).click();
    const pairingResponse = page.waitForResponse(response => response.url().includes("gateway.createSession") && response.status() === 200);
    await dialog.getByRole("button", { name: "Companion verbinden", exact: true }).click();
    const pairBody = await (await pairingResponse).json();
    const pair = (Array.isArray(pairBody) ? pairBody[0] : pairBody).result.data.json;
    expect(pair.sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
    const [gateway] = await pool.query<RowDataPacket[]>("SELECT userId FROM gatewaySessions WHERE id=?", [pair.sessionId]);
    expect(gateway).toHaveLength(1); const userId = Number(gateway[0].userId);
    await expect(dialog.getByText("0 lokale Beobachtungszeilen", { exact: true })).toBeVisible();
    // Persist only bounded event metadata in CI diagnostics, never screenshots or pairing credentials.
    await page.evaluate(() => {
      const canvas = document.querySelector("#threejs-canvas") as HTMLCanvasElement;
      const events: Record<string, unknown>[] = [{ framebufferWidth: canvas.width, framebufferHeight: canvas.height }];
      (window as unknown as { captureDiagnostics: unknown }).captureDiagnostics = events;
      for (const name of ["aurion:world-demonstration", "aurion:companion-frame-request", "aurion:companion-frame-response", "aurion:companion-dataset-updated"]) {
        window.addEventListener(name, event => {
          const d = (event as CustomEvent).detail ?? {};
          events.push({ event: name, requestId: d.requestId, kind: d.kind, error: d.error, count: d.count, captureAgeMs: typeof d.capturedAt === "number" ? Date.now() - d.capturedAt : undefined, featureCount: d.featureVector?.length, frameLength: typeof d.frameDataUrl === "string" ? d.frameDataUrl.length : undefined });
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
      const diagnostics = await page.evaluate(() => (window as unknown as { captureDiagnostics: unknown }).captureDiagnostics);
      await testInfo.attach("capture-events", { body: JSON.stringify(diagnostics), contentType: "application/json" });
    }
    expect(receipt!.memoryHash).toMatch(/^[0-9a-f]{64}$/);
    const sessionId = `cmp_${pair.sessionId}`;
    const lines = (await readFile(`data/companion-memory/user-${userId}/${sessionId}.jsonl`, "utf8")).trim().split("\n");
    const line = lines.find(value => createHash("sha256").update(`${value}\n`).digest("hex") === receipt!.memoryHash)!;
    expect(line).toBeTruthy(); const observation = JSON.parse(line);
    expect(observation.userId).toBe(userId); expect(observation.sessionId).toBe(sessionId);
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
    await expect(runtime).toHaveCount(0);
    await testInfo.attach("visible-companion-readback", { body: JSON.stringify({ userId, sessionId, memoryHash: receipt!.memoryHash, featureCount: 16, unknownStateMasked: true, rendererCount: 1 }), contentType: "application/json" });
  } finally { await page.close(); await pool.end(); }
});
