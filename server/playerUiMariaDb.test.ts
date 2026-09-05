import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionEquipmentSlots, aurionItemInstancesV2, itemInstances, playerProfiles, users } from "../drizzle/schema";
import { aurionPlayerUiSettings } from "../drizzle/playerUiSchema";
import { defaultHotbar } from "../shared/playerUiProtocol";
import { craftItemForUser, createMarketListing, getDb, sellItemToSystem } from "./db";
import { collectPlayerLoot, equipPlayerItem, readPlayerUi, savePlayerControls, unequipPlayerItem } from "./playerUiPersistence";

const suite = process.env.AURION_UI_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const ids = [9330001, 9330002];
const owner = ids[0]!;
const ref = (id = "ui_fixture_legacy") => ({ id, version: "legacy" as const });
const v2ref = { id: "ui_fixture_v2", version: "aurion_v2" as const };
suite("AX1 real MariaDB item ownership, equipment and controls", () => {
  let pool: Pool;
  let isolated = false;
  async function clean() {
    if (!isolated) throw new Error("ISOLATED_UI_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS ui_abort_equip");
    for (const [table, column] of [["aurionEquipmentSlots", "userId"], ["aurionPlayerUiSettings", "userId"], ["systemSaleReceipts", "sellerUserId"], ["marketListings", "sellerUserId"], ["itemInstances", "ownerUserId"], ["aurionItemInstancesV2", "ownerUserId"], ["playerProfiles", "userId"], ["users", "id"]]) await pool.query(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (?)`, [ids]);
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
    await db.insert(users).values(ids.map(id => ({ id, openId: `local:ui_database_fixture_${id}`, name: `UI fixture ${id}` })));
    await db.insert(playerProfiles).values(ids.map(userId => ({ userId })));
    await db.insert(itemInstances).values({ id: ref().id, ownerUserId: owner, lootReceiptId: "ui_fixture_drop", baseItemKey: "aurion_spear", quality: "normal", itemLevel: 1, affixesJson: "[]", status: "pending_pickup" });
    await db.insert(aurionItemInstancesV2).values({ id: v2ref.id, ownerUserId: owner, lootReceiptId: "ui_fixture_drop_v2", baseItemDefinitionId: "weapon-blade-v2", category: "weapon", equipmentSlot: "main_hand", quality: "rare", itemLevelExact: "10000000000000000001", affixesJson: "[]", itemPower: 9, deterministicHash: "a".repeat(64), status: "pending_pickup" });
  });
  afterAll(async () => { if (pool) { if (isolated) await clean(); await pool.end(); } });
  it("persists optimistic-revision controls and rejects a competing stale save", async () => {
    const settings = (await readPlayerUi(owner)).settings;
    expect(settings).toEqual({ revision: 0, autoLoot: true, analyticsConsent: false, hotbar: defaultHotbar });
    const outcomes = await Promise.allSettled([savePlayerControls(owner, { ...settings, autoLoot: false }), savePlayerControls(owner, { ...settings, hotbar: ["9", "8", "7", "6", "5"] })]);
    expect(outcomes.filter(v => v.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(v => v.status === "rejected")).toHaveLength(1);
    expect((await readPlayerUi(owner)).settings.revision).toBe(1);
    expect((await (await getDb())!.select().from(aurionPlayerUiSettings).where(eq(aurionPlayerUiSettings.userId, owner)))).toHaveLength(1);
  });
  it("collects each legacy and V2 item exactly once without changing its reward provenance", async () => {
    const initial = await readPlayerUi(owner);
    await Promise.all([collectPlayerLoot(owner, ref()), collectPlayerLoot(owner, ref()), collectPlayerLoot(owner, v2ref)]);
    const state = await readPlayerUi(owner);
    expect(state.items).toHaveLength(2);
    expect(state.items.every(i => i.status === "owned")).toBe(true);
    expect(state.items.map(i => [i.id, i.receiptId, i.stats, i.levelExact])).toEqual(initial.items.map(i => [i.id, i.receiptId, i.stats, i.levelExact]));
    await expect(collectPlayerLoot(ids[1]!, ref())).rejects.toThrow("OWNED_ITEM_REQUIRED");
  });
  it("requires pickup before equipping and preserves a versioned paperdoll across fresh reads", async () => {
    await expect(equipPlayerItem(owner, ref(), null)).rejects.toThrow("COLLECTED_EQUIPMENT_REQUIRED");
    await collectPlayerLoot(owner, ref());
    await equipPlayerItem(owner, ref(), null);
    expect((await readPlayerUi(owner)).equipment).toEqual([{ ...ref(), slot: "main_hand" }]);
    await expect(equipPlayerItem(ids[1]!, ref(), null)).rejects.toThrow("OWNED_ITEM_REQUIRED");
    await collectPlayerLoot(owner, v2ref);
    await expect(equipPlayerItem(owner, v2ref, { ...ref(), version: "aurion_v2" })).rejects.toThrow("EQUIPMENT_SLOT_STALE");
    await equipPlayerItem(owner, v2ref, ref());
    const replaced = await readPlayerUi(owner);
    expect(replaced.equipment).toEqual([{ ...v2ref, slot: "main_hand" }]);
    expect(replaced.items.find(i => i.id === ref().id)!.status).toBe("owned");
    await expect(unequipPlayerItem(owner, ref())).rejects.toThrow("EQUIPMENT_SLOT_STALE");
    await unequipPlayerItem(owner, v2ref);
    expect((await readPlayerUi(owner)).equipment).toEqual([]);
  });
  it("serializes repeated equip requests without duplicating slots", async () => {
    await collectPlayerLoot(owner, ref());
    await Promise.all([equipPlayerItem(owner, ref(), null), equipPlayerItem(owner, ref(), null)]);
    const state = await readPlayerUi(owner);
    expect(state.equipment).toHaveLength(1);
    expect(state.items.filter(i => i.status === "equipped")).toHaveLength(1);
  });
  it.each(["listed", "sold", "consumed", "guild_custody"] as const)("does not expose, collect or equip an item in %s custody", async status => {
    const db = (await getDb())!;
    await db.update(itemInstances).set({ status }).where(eq(itemInstances.id, ref().id));
    await db.update(aurionItemInstancesV2).set({ status }).where(eq(aurionItemInstancesV2.id, v2ref.id));
    expect((await readPlayerUi(owner)).items).toHaveLength(0);
    for (const item of [ref(), v2ref]) {
      await expect(collectPlayerLoot(owner, item)).rejects.toThrow("OWNED_ITEM_REQUIRED");
      await expect(equipPlayerItem(owner, item, null)).rejects.toThrow("OWNED_ITEM_REQUIRED");
    }
  });
  it("allows only one of concurrent equip and sale, and credits no failed sale", async () => {
    await collectPlayerLoot(owner, ref());
    const outcomes = await Promise.allSettled([equipPlayerItem(owner, ref(), null), sellItemToSystem({ itemId: ref().id, sellerUserId: owner })]);
    expect(outcomes.filter(v => v.status === "fulfilled")).toHaveLength(1);
    const [items] = await pool.query<RowDataPacket[]>("SELECT status FROM itemInstances WHERE id=?", [ref().id]);
    const [receipts] = await pool.query<RowDataPacket[]>("SELECT aurionGranted FROM systemSaleReceipts WHERE sellerUserId=?", [owner]);
    const [profile] = await pool.query<RowDataPacket[]>("SELECT aurionPoints FROM playerProfiles WHERE userId=?", [owner]);
    const state = await readPlayerUi(owner);
    expect(receipts.length).toBe(items[0]!.status === "sold" ? 1 : 0);
    expect(profile[0]!.aurionPoints).toBe(receipts[0]?.aurionGranted ?? 0);
    expect(state.equipment.length).toBe(items[0]!.status === "equipped" ? 1 : 0);
  });
  it("allows only one of concurrent equip and market listing", async () => {
    await collectPlayerLoot(owner, ref());
    const outcomes = await Promise.allSettled([equipPlayerItem(owner, ref(), null), createMarketListing({ itemId: ref().id, sellerUserId: owner, askingPrice: 25 })]);
    expect(outcomes.filter(v => v.status === "fulfilled")).toHaveLength(1);
    const state = await readPlayerUi(owner);
    const [listings] = await pool.query<RowDataPacket[]>("SELECT id FROM marketListings WHERE sellerUserId=?", [owner]);
    expect(state.equipment.length + listings.length).toBe(1);
  });
  it("rejects market and crafting operations on already equipped or uncollected items", async () => {
    for (const equipped of [false, true]) {
      if (equipped) { await collectPlayerLoot(owner, ref()); await equipPlayerItem(owner, ref(), null); }
      await expect(sellItemToSystem({ itemId: ref().id, sellerUserId: owner })).rejects.toThrow();
      await expect(createMarketListing({ itemId: ref().id, sellerUserId: owner, askingPrice: 25 })).rejects.toThrow();
      await expect(craftItemForUser({ userId: owner, inputItemId: ref().id, recipeKey: "temper_aurion_spear" })).rejects.toThrow();
    }
  });
  it("rolls back the item transition when the real slot write fails", async () => {
    await collectPlayerLoot(owner, ref());
    const before = await readPlayerUi(owner);
    await pool.query("CREATE TRIGGER ui_abort_equip BEFORE INSERT ON aurionEquipmentSlots FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='UI_FORCED_ROLLBACK'");
    await expect(equipPlayerItem(owner, ref(), null)).rejects.toMatchObject({ cause: { code: "ER_SIGNAL_EXCEPTION" } });
    expect(await readPlayerUi(owner)).toEqual(before);
    await pool.query("DROP TRIGGER ui_abort_equip");
  });
  it("backfills only owner-, version- and slot-matched historical equipment", async () => {
    const db = (await getDb())!;
    await db.update(itemInstances).set({ status: "owned" }).where(eq(itemInstances.id, ref().id));
    await db.update(aurionItemInstancesV2).set({ status: "owned" }).where(eq(aurionItemInstancesV2.id, v2ref.id));
    await db.insert(aurionEquipmentSlots).values([
      { id: "ui_slot_legacy", userId: owner, slot: "main_hand", itemId: ref().id, itemRecordVersion: "legacy" },
      { id: "ui_slot_foreign", userId: ids[1]!, slot: "main_hand", itemId: v2ref.id, itemRecordVersion: "aurion_v2" },
    ]);
    const sql = await readFile("drizzle/0033_aurion_ax1_ui_controls.sql", "utf8");
    for (const statement of sql.split("--> statement-breakpoint").filter(s => /UPDATE `/.test(s))) await pool.query(statement);
    expect((await readPlayerUi(owner)).equipment).toHaveLength(1);
    const [v2] = await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, v2ref.id));
    expect(v2!.status).toBe("owned");
    await expect(readPlayerUi(ids[1]!)).rejects.toThrow();
  });
  it("rejects corrupt settings and cross-version catalog slots instead of inventing a display", async () => {
    const db = (await getDb())!;
    await db.insert(aurionPlayerUiSettings).values({ userId: owner, autoLoot: 7, hotbarJson: JSON.stringify(defaultHotbar) });
    await expect(readPlayerUi(owner)).rejects.toThrow("UI_SETTINGS_CORRUPT");
    await db.delete(aurionPlayerUiSettings).where(eq(aurionPlayerUiSettings.userId, owner));
    await db.update(aurionItemInstancesV2).set({ equipmentSlot: "head" }).where(and(eq(aurionItemInstancesV2.id, v2ref.id), eq(aurionItemInstancesV2.ownerUserId, owner)));
    await expect(readPlayerUi(owner)).rejects.toThrow("UI_ITEM_CATALOG_MISMATCH");
  });
});
