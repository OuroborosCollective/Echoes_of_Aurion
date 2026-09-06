import { eq } from "drizzle-orm";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionAx1StarterEquipmentReceipts, aurionAx1StarterEquipmentStates } from "../drizzle/ax1StarterEquipmentSchema";
import { aurionEquipmentSlots, itemInstances, playerProfiles, users } from "../drizzle/schema";
import {
  AX1_GAME_SOURCE_REVISION,
  AX1_STARTER_BLADE_ATTACK_BONUS,
  AX1_STARTER_BLADE_ITEM_ID,
  AX1_STARTER_BLADE_MAX_HP_BONUS,
  AX1_STARTER_BLADE_NAME,
  AX1_STARTER_SOURCE_GIT_BLOB_SHA,
  AX1_STARTER_SOURCE_PATH,
} from "./ax1CombatProjection";
import {
  AX1_STARTER_BLADE_CONTENT_SHA256,
  ax1StarterItemId,
  ensureAx1StarterEquipment,
} from "./ax1StarterEquipmentPersistence";
import { getDb } from "./db";
import { equipPlayerItem, readPlayerUi, unequipPlayerItem } from "./playerUiPersistence";

const suite = process.env.AURION_UI_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const ids = [9330101, 9330102];
const owner = ids[0]!;
const starterRef = () => ({ id: ax1StarterItemId(owner), version: "ax1_starter" as const });
const legacyRef = { id: "starter_replace_legacy", version: "legacy" as const };

suite("AX1 starter equipment receipt and paperdoll projection", () => {
  let pool: Pool;
  let isolated = false;

  async function clean() {
    if (!isolated) throw new Error("ISOLATED_UI_DATABASE_REQUIRED");
    for (const [table, column] of [
      ["aurionEquipmentSlots", "userId"],
      ["aurionAx1StarterEquipmentStates", "userId"],
      ["aurionAx1StarterEquipmentReceipts", "userId"],
      ["itemInstances", "ownerUserId"],
      ["playerProfiles", "userId"],
      ["users", "id"],
    ]) await pool.query(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (?)`, [ids]);
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
    await db.insert(users).values(ids.map(id => ({ id, openId: `local:ax1_starter_fixture_${id}`, name: `AX1 starter fixture ${id}` })));
    await db.insert(playerProfiles).values(ids.map(userId => ({ userId })));
  });

  afterAll(async () => { if (pool) { if (isolated) await clean(); await pool.end(); } });

  it("materializes one immutable source receipt and projects the starter into main_hand", async () => {
    const first = await ensureAx1StarterEquipment(owner);
    const second = await ensureAx1StarterEquipment(owner);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ itemId: ax1StarterItemId(owner), status: "equipped" });

    const state = await readPlayerUi(owner);
    const starter = state.items.find(item => item.version === "ax1_starter");
    expect(starter).toEqual({
      id: ax1StarterItemId(owner),
      version: "ax1_starter",
      name: AX1_STARTER_BLADE_NAME,
      definition: AX1_STARTER_BLADE_ITEM_ID,
      levelExact: "1",
      quality: "normal",
      slot: "main_hand",
      status: "equipped",
      stats: { attack: AX1_STARTER_BLADE_ATTACK_BONUS, maxHealth: AX1_STARTER_BLADE_MAX_HP_BONUS },
      receiptId: first.receiptId,
    });
    expect(state.equipment).toEqual([{ ...starterRef(), slot: "main_hand" }]);

    const db = (await getDb())!;
    const receipts = await db.select().from(aurionAx1StarterEquipmentReceipts).where(eq(aurionAx1StarterEquipmentReceipts.userId, owner));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      id: first.receiptId,
      definitionId: AX1_STARTER_BLADE_ITEM_ID,
      sourceRevision: AX1_GAME_SOURCE_REVISION,
      sourceBlobSha: AX1_STARTER_SOURCE_GIT_BLOB_SHA,
      sourcePath: AX1_STARTER_SOURCE_PATH,
      contentSha256: AX1_STARTER_BLADE_CONTENT_SHA256,
    });
  });

  it("never overwrites an already equipped real main-hand item", async () => {
    const db = (await getDb())!;
    await db.insert(itemInstances).values({
      id: legacyRef.id,
      ownerUserId: owner,
      lootReceiptId: "starter_existing_weapon_receipt",
      baseItemKey: "aurion_spear",
      quality: "normal",
      itemLevel: 1,
      affixesJson: "[]",
      status: "equipped",
    });
    await db.insert(aurionEquipmentSlots).values({
      id: `equipment:${owner}:main_hand`,
      userId: owner,
      slot: "main_hand",
      itemId: legacyRef.id,
      itemRecordVersion: "legacy",
    });

    const starter = await ensureAx1StarterEquipment(owner);
    expect(starter.status).toBe("owned");
    const state = await readPlayerUi(owner);
    expect(state.equipment).toEqual([{ ...legacyRef, slot: "main_hand" }]);
    expect(state.items.find(item => item.version === "ax1_starter")?.status).toBe("owned");
  });

  it("unequips, re-equips and swaps the starter through the same paperdoll contract", async () => {
    await ensureAx1StarterEquipment(owner);
    await unequipPlayerItem(owner, starterRef());
    let state = await readPlayerUi(owner);
    expect(state.equipment).toEqual([]);
    expect(state.items.find(item => item.version === "ax1_starter")?.status).toBe("owned");

    await equipPlayerItem(owner, starterRef(), null);
    state = await readPlayerUi(owner);
    expect(state.equipment).toEqual([{ ...starterRef(), slot: "main_hand" }]);

    const db = (await getDb())!;
    await db.insert(itemInstances).values({
      id: legacyRef.id,
      ownerUserId: owner,
      lootReceiptId: "starter_swap_weapon_receipt",
      baseItemKey: "aurion_spear",
      quality: "normal",
      itemLevel: 1,
      affixesJson: "[]",
      status: "owned",
    });
    await equipPlayerItem(owner, legacyRef, starterRef());
    state = await readPlayerUi(owner);
    expect(state.equipment).toEqual([{ ...legacyRef, slot: "main_hand" }]);
    expect(state.items.find(item => item.version === "ax1_starter")?.status).toBe("owned");

    await equipPlayerItem(owner, starterRef(), legacyRef);
    state = await readPlayerUi(owner);
    expect(state.equipment).toEqual([{ ...starterRef(), slot: "main_hand" }]);
    expect(state.items.find(item => item.id === legacyRef.id)?.status).toBe("owned");
    expect((await db.select().from(aurionAx1StarterEquipmentStates).where(eq(aurionAx1StarterEquipmentStates.userId, owner)))[0]?.status).toBe("equipped");
  });

  it("rejects another user's starter reference instead of fabricating ownership", async () => {
    await ensureAx1StarterEquipment(owner);
    await expect(equipPlayerItem(ids[1]!, starterRef(), null)).rejects.toThrow("OWNED_ITEM_REQUIRED");
  });
});
