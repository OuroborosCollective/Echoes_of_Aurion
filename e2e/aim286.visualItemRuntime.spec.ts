import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { AURION_LOOT_CONTENT_VERSION, aurionLootCatalogV2 } from "../server/aurionLootCatalog";
import { resolveDeterministicLoot } from "../server/aurionLootProtocol";
import { createValidatedAurionLootDropV2, recordValidatedExpeditionResult } from "../server/db";
import { collectPlayerLoot, equipPlayerItem, readPlayerUi } from "../server/playerUiPersistence";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable browser MariaDB");

type EquipmentEvidence = Readonly<{
  avatar: string | null;
  confirmed: number;
  rendered: number;
  pending: number;
  v2: readonly Readonly<{ slot: string; identity: string; source: "glb" | "procedural" }>[];
  slots: readonly Readonly<{ slot: string; source: string; receiptId: string | null }>[];
}>;

const viewports = [
  { name: "phone", width: 412, height: 915 },
  { name: "tablet", width: 800, height: 1280 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

async function equipRealV2Item(userId: number, key: string) {
  const serverSeedDigest = createHash("sha256").update(`aim286-browser-seed:${key}`).digest("hex");
  const accepted = await recordValidatedExpeditionResult({
    userId,
    expeditionKey: `aim286-browser:${key}:expedition`,
    seedDigest: serverSeedDigest,
    resultDigest: createHash("sha256").update(`aim286-browser-result:${key}`).digest("hex"),
    confirmedByUserId: userId,
    idempotencyKey: `aim286-browser:${key}:result`,
  });
  const baseContext = {
    worldId: "echoes-of-aurion-global",
    zoneId: "windhollow",
    monsterArchetypeId: "ash-sentinel",
    encounterReceiptId: accepted.receipt.id,
    ruleSetVersion: aurionLootCatalogV2.ruleSetVersion,
    contentVersion: AURION_LOOT_CONTENT_VERSION,
    playerLevelExact: "42",
    zoneLevelExact: "42",
    monsterLevelExact: "42",
    luckBps: 0,
    serverSeedDigest,
  } as const;
  let resolutionIndex = -1;
  for (let candidate = 0; candidate < 256; candidate += 1) {
    const resolved = resolveDeterministicLoot({ context: { ...baseContext, resolutionIndex: candidate }, ...aurionLootCatalogV2 });
    if (resolved.equipmentSlot === "main_hand") {
      resolutionIndex = candidate;
      break;
    }
  }
  if (resolutionIndex < 0) throw new Error("AIM286_BROWSER_MAIN_HAND_FIXTURE_NOT_FOUND");
  const drop = await createValidatedAurionLootDropV2({
    userId,
    context: { ...baseContext, resolutionIndex },
    idempotencyKey: `aim286-browser:${key}:drop`,
  });
  const ref = { id: drop.item.id, version: "aurion_v2" as const };
  let ui = await readPlayerUi(userId);
  const item = ui.items.find(candidate => candidate.id === ref.id && candidate.version === ref.version);
  if (item?.slot !== "main_hand") throw new Error("AIM286_BROWSER_MAIN_HAND_ITEM_MISSING");
  if (item.status === "pending_pickup") ui = await collectPlayerLoot(userId, ref);
  const current = ui.equipment.find(binding => binding.slot === "main_hand");
  await equipPlayerItem(userId, ref, current ? { id: current.id, version: current.version } : null);
  return drop;
}

for (const viewport of viewports) {
  test(`receipt-backed V2 item renders through compiler on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    expect(baseURL).toBe("http://127.0.0.1:3000");
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    expect(databaseUrl.hostname).toBe("127.0.0.1");
    expect(databaseUrl.pathname).toBe("/aurion_browser_test");
    const pool = createPool(process.env.DATABASE_URL!);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0]!.name).toBe("aurion_browser_test");
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /shader|WebGLProgram|render.*failed|EQUIPMENT_VISUAL/i.test(message.text())) browserErrors.push(message.text());
    });
    await page.addInitScript(() => {
      (window as typeof window & { __aim286EquipmentEvidence?: unknown }).__aim286EquipmentEvidence = null;
      window.addEventListener("aurion:xaurion-equipment-visual-evidence", event => {
        (window as typeof window & { __aim286EquipmentEvidence?: unknown }).__aim286EquipmentEvidence = (event as CustomEvent<unknown>).detail;
      });
    });

    try {
      await page.setViewportSize(viewport);
      const health = await page.request.get("/healthz");
      expect(await health.json()).toMatchObject({ status: "ok", revision: process.env.AURION_RELEASE_SHA });
      await page.goto("/");
      await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
      const handle = `aim286_${viewport.name}`;
      await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
      await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-aim286-browser-test-only!");
      await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
      await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible({ timeout: 30_000 });

      const [users] = await pool.query<RowDataPacket[]>("SELECT u.id FROM users u JOIN localCredentials c ON c.userId=u.id WHERE c.handle=?", [handle]);
      expect(users).toHaveLength(1);
      const userId = Number(users[0]!.id);
      expect(userId).toBeGreaterThan(0);

      // Publish the actual rig through the new player-public lane. The equipment
      // test must render against a confirmed selectable avatar, not starter_player.
      await pool.execute("UPDATE users SET role='admin' WHERE id=?", [userId]);
      await page.goto("/ops/glb-upload");
      await page.getByLabel("Kategorie / Verwendungszweck").selectOption("player-public");
      await page.getByLabel("Anzeigename (optional bei Einzeldatei)").fill(`AIM286 public avatar ${viewport.name}`);
      const bytes = await readFile("assets/characters/aurion-player-standard-animated.glb");
      const input = page.locator("#smartGlbFile");
      await expect(input).toBeEnabled();
      const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/admin/glb-smart-upload") && response.request().method() === "POST");
      await input.setInputFiles({ name: `aim286-public-${viewport.name}.glb`, mimeType: "model/gltf-binary", buffer: bytes });
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const playerReceipt = (await response.json()).receipt;
      expect(playerReceipt).toMatchObject({ targetKey: null, status: "catalog", sha256: createHash("sha256").update(bytes).digest("hex") });

      const drop = await equipRealV2Item(userId, viewport.name);
      const readbackBefore = await page.request.get("/api/game/confirmed-equipment-visuals-v2");
      expect(readbackBefore.status()).toBe(200);
      const confirmed = await readbackBefore.json();
      const entry = confirmed.equipment.find((value: { version?: string }) => value.version === "aurion_v2");
      expect(entry).toMatchObject({
        itemId: drop.item.id,
        receiptId: drop.receipt.id,
        visualDescriptor: {
          itemDefinitionId: drop.receipt.itemDefinitionId,
          source: { lootReceiptId: drop.receipt.id, contextHash: drop.receipt.contextHash, deterministicHash: drop.receipt.deterministicHash, visualEventIndex: 0 },
          visual: null,
        },
      });

      const [itemBefore] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionItemInstancesV2 WHERE id=?", [drop.item.id]);
      const [receiptBefore] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionLootDropReceiptsV2 WHERE id=?", [drop.receipt.id]);
      const [slotBefore] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionEquipmentSlots WHERE userId=? ORDER BY slot", [userId]);

      await page.goto("/");
      const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
      await expect(launch).toBeVisible({ timeout: 30_000 });
      await launch.click();
      await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
      const runtime = page.getByTestId("xaurion-open-world-runtime");
      const gate = page.getByTestId("player-character-selection-gate");
      await expect(gate).toBeVisible({ timeout: 15_000 });
      await gate.getByRole("radio", { name: new RegExp(`AIM286 public avatar ${viewport.name}`) }).click();
      const selectionReply = page.waitForResponse(value => value.url().endsWith("/api/game/public-player-characters/select") && value.request().method() === "POST");
      await gate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
      const selected = await selectionReply;
      expect(selected.status()).toBe(200);
      expect(await selected.json()).toMatchObject({ assetId: playerReceipt.assetId, storageUrl: playerReceipt.storageUrl, visibility: "public", immutable: true });

      await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId("glb-model-status")).toHaveText("active", { timeout: 45_000 });

      await expect.poll(async () => page.evaluate(() => (window as typeof window & { __aim286EquipmentEvidence?: EquipmentEvidence | null }).__aim286EquipmentEvidence ?? null), {
        timeout: 45_000,
        intervals: [250, 500, 1_000],
      }).toMatchObject({
        confirmed: 1,
        rendered: 1,
        v2: [expect.objectContaining({ source: "procedural" })],
        slots: [expect.objectContaining({ source: "visual-item-compiler", receiptId: drop.receipt.id })],
      });
      const runtimeEvidence = await page.evaluate(() => (window as typeof window & { __aim286EquipmentEvidence?: EquipmentEvidence | null }).__aim286EquipmentEvidence!);
      expect(runtimeEvidence.avatar).toBe(playerReceipt.storageUrl);
      expect(runtimeEvidence.pending).toBe(0);
      expect(runtimeEvidence.v2[0]!.identity).toContain(drop.receipt.id);

      const readbackAfter = await page.request.get("/api/game/confirmed-equipment-visuals-v2");
      expect(readbackAfter.status()).toBe(200);
      expect(await readbackAfter.json()).toEqual(confirmed);
      const [itemAfter] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionItemInstancesV2 WHERE id=?", [drop.item.id]);
      const [receiptAfter] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionLootDropReceiptsV2 WHERE id=?", [drop.receipt.id]);
      const [slotAfter] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionEquipmentSlots WHERE userId=? ORDER BY slot", [userId]);
      expect(itemAfter).toEqual(itemBefore);
      expect(receiptAfter).toEqual(receiptBefore);
      expect(slotAfter).toEqual(slotBefore);
      expect(browserErrors).toEqual([]);

      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-v2-equipment-runtime.png`), animations: "disabled" });
      await testInfo.attach("aim286-v2-equipment-runtime-readback", {
        contentType: "application/json",
        body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, viewport: viewport.name, userId, playerAssetId: playerReceipt.assetId, playerAssetSha256: playerReceipt.sha256, itemId: drop.item.id, receiptId: drop.receipt.id, runtimeEvidence, databaseMutation: false, publicSelectionReadback: true }),
      });
    } finally {
      await page.close();
      await pool.end();
    }
  });
}
