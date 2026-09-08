import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { aurionEquipmentSlots, aurionItemInstancesV2, aurionLootDropReceiptsV2, expeditionResultReceipts, playerProfiles, users } from "../drizzle/schema";
import { AURION_LOOT_CONTENT_VERSION, aurionLootCatalogV2 } from "./aurionLootCatalog";
import { resolveDeterministicLoot } from "./aurionLootProtocol";
import { createValidatedAurionLootDropV2, getDb, recordValidatedExpeditionResult } from "./db";
import { collectPlayerLoot, equipPlayerItem, readPlayerUi } from "./playerUiPersistence";
import { readConfirmedEquipmentVisuals } from "./confirmedEquipmentVisualReadback";

const suite = process.env.AURION_UI_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const USER_ID = 9_336_101;
const PREFIX = "aim286-visual-runtime";

suite("AIM-286 real MariaDB visual item runtime readback", () => {
  let pool: Pool;
  let isolated = false;

  async function clean() {
    if (!isolated) throw new Error("ISOLATED_UI_DATABASE_REQUIRED");
    for (const [table, column] of [
      ["aurionEquipmentSlots", "userId"],
      ["aurionItemInstancesV2", "ownerUserId"],
      ["aurionLootDropReceiptsV2", "userId"],
      ["expeditionResultReceipts", "userId"],
      ["playerProfiles", "userId"],
      ["users", "id"],
    ]) await pool.query(`DELETE FROM \`${table}\` WHERE \`${column}\`=?`, [USER_ID]);
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !["/aurion_ui_test", "/aurion_group_test"].includes(url.pathname)) throw new Error("ISOLATED_UI_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (`/${rows[0]!.name}` !== url.pathname) throw new Error("ISOLATED_UI_DATABASE_REQUIRED");
    isolated = true;
  });

  beforeEach(async () => {
    await clean();
    const db = (await getDb())!;
    await db.insert(users).values({ id: USER_ID, openId: `local:${PREFIX}`, name: "AIM-286 fixture" });
    await db.insert(playerProfiles).values({ userId: USER_ID });
  });

  afterAll(async () => { if (pool) { if (isolated) await clean(); await pool.end(); } });

  async function createEquippedV2Item() {
    const accepted = await recordValidatedExpeditionResult({
      userId: USER_ID,
      expeditionKey: `${PREFIX}:expedition`,
      seedDigest: "f".repeat(64),
      resultDigest: "e".repeat(64),
      confirmedByUserId: USER_ID,
      idempotencyKey: `${PREFIX}:result`,
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
      serverSeedDigest: "f".repeat(64),
    } as const;
    let resolutionIndex = -1;
    for (let candidate = 0; candidate < 256; candidate += 1) {
      const result = resolveDeterministicLoot({ context: { ...baseContext, resolutionIndex: candidate }, ...aurionLootCatalogV2 });
      if (["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet"].includes(result.equipmentSlot ?? "")) { resolutionIndex = candidate; break; }
    }
    if (resolutionIndex < 0) throw new Error("AIM286_EQUIPMENT_FIXTURE_NOT_FOUND");
    const drop = await createValidatedAurionLootDropV2({
      userId: USER_ID,
      context: { ...baseContext, resolutionIndex },
      idempotencyKey: `${PREFIX}:drop`,
    });
    const ref = { id: drop.item.id, version: "aurion_v2" as const };
    const ui = await readPlayerUi(USER_ID);
    const item = ui.items.find(candidate => candidate.id === ref.id && candidate.version === ref.version);
    if (!item) throw new Error("AIM286_ITEM_UI_MISSING");
    if (item.status === "pending_pickup") await collectPlayerLoot(USER_ID, ref);
    await equipPlayerItem(USER_ID, ref, null);
    return drop;
  }

  it("reads a receipt-derived descriptor from a real equipped V2 item without mutating gameplay truth", async () => {
    const drop = await createEquippedV2Item();
    const db = (await getDb())!;
    const beforeItem = (await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, drop.item.id)))[0]!;
    const beforeReceipt = (await db.select().from(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.id, drop.receipt.id)))[0]!;
    const beforeSlots = await db.select().from(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.userId, USER_ID));

    const readback = await readConfirmedEquipmentVisuals(USER_ID);
    expect(readback.equipment).toHaveLength(1);
    const visual = readback.equipment[0]!;
    expect(visual.version).toBe("aurion_v2");
    if (visual.version !== "aurion_v2") throw new Error("AIM286_EXPECTED_V2");
    expect(visual.itemId).toBe(drop.item.id);
    expect(visual.receiptId).toBe(drop.receipt.id);
    expect(visual.visualDescriptor.source).toEqual({
      lootReceiptId: drop.receipt.id,
      contextHash: drop.receipt.contextHash,
      deterministicHash: drop.receipt.deterministicHash,
      visualEventIndex: 0,
    });
    expect(visual.visualDescriptor).not.toHaveProperty("itemPower");

    expect((await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, drop.item.id)))[0]).toEqual(beforeItem);
    expect((await db.select().from(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.id, drop.receipt.id)))[0]).toEqual(beforeReceipt);
    expect(await db.select().from(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.userId, USER_ID))).toEqual(beforeSlots);
  });

  it("fails closed when the real item row drifts from its immutable receipt hash", async () => {
    const drop = await createEquippedV2Item();
    const db = (await getDb())!;
    await db.update(aurionItemInstancesV2).set({ deterministicHash: "0".repeat(64) }).where(eq(aurionItemInstancesV2.id, drop.item.id));
    await expect(readConfirmedEquipmentVisuals(USER_ID)).rejects.toThrow("EQUIPMENT_VISUAL_V2_RECEIPT_MISMATCH");
  });
});
