import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { aurionItemInstancesV2, itemInstances, playerProfiles, users } from "../drizzle/schema";
import { getDb, issueZoneConnectionTicket } from "./db";
import { consumeZoneTicketWithCombatProfile } from "./zoneCombatPersistence";
import { ax1StarterItemId } from "./ax1StarterEquipmentPersistence";
import { equipPlayerItem, unequipPlayerItem } from "./playerUiPersistence";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { globalTickRecorder } from "./causality/tickRecorder";

const suite = process.env.DATABASE_URL?.endsWith("/aurion_combat_classless_test") ? describe : describe.skip;
const userId = 737002;
const starter = { id: ax1StarterItemId(userId), version: "ax1_starter" as const };
const legacy = { id: "combat_equipment_legacy", version: "legacy" as const };
const v2 = { id: "combat_equipment_v2", version: "aurion_v2" as const };

suite("real equipment to consumed zone ticket combat profile", () => {
  let pool: Pool;
  async function clean() {
    for (const [table, column] of [
      ["zoneConnectionTickets", "userId"], ["aurionEquipmentSlots", "userId"],
      ["aurionAx1StarterEquipmentStates", "userId"], ["aurionAx1StarterEquipmentReceipts", "userId"],
      ["aurionPlayerUiSettings", "userId"], ["weaponLoadouts", "userId"],
      ["itemInstances", "ownerUserId"], ["aurionItemInstancesV2", "ownerUserId"], ["aurionMasteryEvents", "userId"],
      ["playerProfiles", "userId"], ["users", "id"],
    ]) await pool.query(`DELETE FROM \`${table}\` WHERE \`${column}\`=?`, [userId]);
    await pool.query("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", ["observatory_threshold"]);
    await pool.query("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", ["observatory_threshold"]);
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_combat_classless_test") throw new Error("ISOLATED_COMBAT_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
  });
  beforeEach(async () => {
    await clean();
    const db = (await getDb())!;
    await db.insert(users).values({ id: userId, openId: `local:combat_equipment_${userId}` });
    await db.insert(playerProfiles).values({ userId, level: 1 });
    await db.insert(itemInstances).values({ id: legacy.id, ownerUserId: userId, lootReceiptId: "combat-equipment-legacy-loot", baseItemKey: "aurion_spear", quality: "normal", itemLevel: 1, affixesJson: "[]", status: "owned" });
    await db.insert(aurionItemInstancesV2).values({ id: v2.id, ownerUserId: userId, lootReceiptId: "combat-equipment-v2-loot", baseItemDefinitionId: "weapon-blade-v2", category: "weapon", equipmentSlot: "main_hand", quality: "normal", itemLevelExact: "1", affixesJson: "[]", itemPower: 9, deterministicHash: "a".repeat(64), status: "owned" });
  });
  afterAll(async () => { if (pool) { await globalTickRecorder.flushPersistence(); await clean(); await pool.end(); } });

  async function consume() {
    const issued = await issueZoneConnectionTicket({ userId, zoneId: "observatory_threshold", clientBuild: "combat-equipment-proof" });
    const consumed = await consumeZoneTicketWithCombatProfile(issued);
    expect(consumed?.userId).toBe(userId);
    expect(await consumeZoneTicketWithCombatProfile(issued)).toBeUndefined();
    return consumed!.combatProfile!;
  }

  it("classifies starter, unarmed, legacy and V2 main-hand equipment from durable state and confirms one-damage fist hits", async () => {
    expect(await consume()).toMatchObject({ weaponEquipped: true, weaponBonus: 15, combatLevel: 1 });
    await unequipPlayerItem(userId, starter);
    const unarmed = await consume();
    expect(unarmed).toMatchObject({ weaponEquipped: false, weaponBonus: 0, combatLevel: 1 });
    const [starterRows] = await pool.query("SELECT status FROM aurionAx1StarterEquipmentStates WHERE userId=?", [userId]);
    expect(starterRows).toEqual([expect.objectContaining({ status: "owned" })]);

    // Real consumed profile, without supplying or overriding any combat numbers.
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId, socket: socket as unknown as WebSocket, combatProfile: unarmed });
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    for (let i = 0; i < 5; i++) zone.tick();
    let seq = 2;
    for (let i = 0; i < 20; i++) {
      expect(zone.submitAttack(connectionId, { type: "attack", clientSeq: seq++, targetEntityId: "mob_12" })).toBe("accepted");
      zone.submitMovement(connectionId, { type: "move", clientSeq: seq++, input: { x: 0, z: 0 } });
      zone.tick();
    }
    const hits = socket.send.mock.calls.map(([payload]) => JSON.parse(payload)).filter(event => event.type === "combat" && event.attackerEntityId === `player:${userId}` && event.hit);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(event => event.damage === 1 && event.skillId === null)).toBe(true);
    await globalTickRecorder.flushPersistence();

    await equipPlayerItem(userId, legacy, null);
    expect(await consume()).toMatchObject({ weaponEquipped: true, weaponBonus: 0 });
    await equipPlayerItem(userId, v2, legacy);
    expect(await consume()).toMatchObject({ weaponEquipped: true, weaponBonus: 9 });
    const [slotRows] = await pool.query("SELECT itemId,itemRecordVersion FROM aurionEquipmentSlots WHERE userId=? AND slot='main_hand'", [userId]);
    expect(slotRows).toEqual([expect.objectContaining({ itemId: v2.id, itemRecordVersion: "aurion_v2" })]);
    const [confirmationRows] = await pool.query("SELECT id FROM aurionEquipmentSlots WHERE userId=? AND slot='main_hand'", [userId]);
    expect(confirmationRows).toEqual([expect.objectContaining({ id: expect.stringMatching(/^aceg:[a-f0-9]{59}$/) })]);
    await unequipPlayerItem(userId, v2);
    expect(await consume()).toMatchObject({ weaponEquipped: false, weaponBonus: 0 });
    await equipPlayerItem(userId, starter, null);
    expect(await consume()).toMatchObject({ weaponEquipped: true, weaponBonus: 15 });
  });
});
