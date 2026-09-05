import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guildBankViewSchema } from "../shared/guildBankView";
import { GuildBankStore } from "./guildBankStore";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("AIM-269 MariaDB guild bank and custody transaction", () => {
  const guildId = "guild_aim269_integration";
  const founderUserId = 9269001;
  const memberUserId = 9269002;
  const legacyItemId = "aim269_legacy_item";
  const v2ResourceItemId = "aim269_v2_wood_item";
  let pool: Pool;
  let store: GuildBankStore;
  let isolated = false;

  async function clean(): Promise<void> {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    for (const statement of [
      "DELETE FROM aurionGuildResourceLedger WHERE guildId = ?",
      "DELETE FROM aurionGuildItemCustodyLedger WHERE guildId = ?",
      "DELETE FROM aurionGuildTreasuryLedger WHERE guildId = ?",
      "DELETE FROM aurionGuildBankReceipts WHERE guildId = ?",
      "DELETE FROM aurionGuildBankPlans WHERE guildId = ?",
      "DELETE FROM aurionGuildBuildings WHERE guildId = ?",
      "DELETE FROM aurionGuildResourceAccounts WHERE guildId = ?",
      "DELETE FROM aurionGuildItemCustody WHERE guildId = ?",
      "DELETE FROM aurionGuildTreasuryAccounts WHERE guildId = ?",
      "DELETE FROM aurionGuildCapabilityGrants WHERE guildId = ?",
      "DELETE FROM aurionGuildDiplomacyPacts WHERE sourceGuildId = ? OR targetGuildId = ?",
      "DELETE FROM aurionGuildKingdoms WHERE guildId = ?",
      "DELETE FROM aurionGuildTerritories WHERE guildId = ?",
      "DELETE FROM aurionGuildGovernanceReceipts WHERE guildId = ?",
      "DELETE FROM aurionGuildMutationPlans WHERE guildId = ?",
      "DELETE FROM aurionGuildGovernanceStates WHERE guildId = ?",
    ]) {
      await pool.query(statement, statement.includes("OR targetGuildId") ? [guildId, guildId] : [guildId]);
    }
    await pool.query("DELETE FROM aurionEquipmentSlots WHERE itemId IN (?, ?)", [legacyItemId, v2ResourceItemId]);
    await pool.query("DELETE FROM itemInstances WHERE id = ?", [legacyItemId]);
    await pool.query("DELETE FROM aurionItemInstancesV2 WHERE id = ?", [v2ResourceItemId]);
    await pool.query("DELETE FROM guildMemberships WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM guilds WHERE id = ?", [guildId]);
    await pool.query("DELETE FROM playerProfiles WHERE userId IN (?, ?)", [founderUserId, memberUserId]);
  }

  beforeAll(async () => {
    if (!databaseUrl) return;
    const target = new URL(databaseUrl);
    if(target.hostname!=="127.0.0.1"||!target.pathname.endsWith("_test"))throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(databaseUrl);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if(database[0]?.name!==target.pathname.slice(1))throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated=true;
    store = GuildBankStore.fromDatabaseUrl(databaseUrl);
    await clean();
    await pool.query("INSERT INTO playerProfiles (userId, aurionPoints) VALUES (?, 50000), (?, 50000)", [founderUserId, memberUserId]);
    await pool.query("INSERT INTO guilds (id, name, tag, founderUserId) VALUES (?, 'AIM 269 Integration', 'A269', ?)", [guildId, founderUserId]);
    await pool.query("INSERT INTO guildMemberships (id, guildId, userId, role, status) VALUES ('gm_aim269_founder', ?, ?, 'founder', 'active'), ('gm_aim269_member', ?, ?, 'member', 'active')", [guildId, founderUserId, guildId, memberUserId]);
    await pool.query("INSERT INTO itemInstances (id, ownerUserId, sourceKind, lootReceiptId, craftingReceiptId, baseItemKey, quality, itemLevel, affixesJson, status) VALUES (?, ?, 'loot', 'aim269_loot_receipt_legacy', NULL, 'asterion_blade', 'rare', 10, '[]', 'owned')", [legacyItemId, memberUserId]);
    await pool.query("INSERT INTO aurionItemInstancesV2 (id, ownerUserId, lootReceiptId, baseItemDefinitionId, category, equipmentSlot, quality, itemLevelExact, affixesJson, setId, itemPower, deterministicHash, status) VALUES (?, ?, 'aim269_loot_receipt_v2', 'mat_wood_oak', 'crafting_component', NULL, 'normal', '1', '[]', NULL, 1, ?, 'owned')", [v2ResourceItemId, memberUserId, "a".repeat(64)]);
  });

  afterAll(async () => {
    if (!pool) return;
    if(isolated) await clean();
    if(store) await store.close();
    await pool.end();
  });

  it("applies one member deposit exactly once under concurrent replay", async () => {
    const planned = await store.plan(memberUserId, { operation: "deposit_points", expectedRevisionExact: "0", idempotencyKey: "aim269-points-deposit", payload: { amountExact: "1000" } });
    const [left, right] = await Promise.all([
      store.apply(memberUserId, planned.plan.confirmationHash),
      store.apply(memberUserId, planned.plan.confirmationHash),
    ]);
    expect([left.replay, right.replay].filter(Boolean)).toHaveLength(1);
    expect(left.receipt.receiptId).toBe(right.receipt.receiptId);
    const readback = await store.read(memberUserId, guildId);
    const view=guildBankViewSchema.parse(readback);
    expect(view.actorUserId).toBe(memberUserId);
    expect(view.planningRevisionExact).toBe("1");
    expect(view.allowedOperations).toContain("deposit_points");
    expect(view.allowedOperations).not.toContain("withdraw_points");
    expect(view.availableItems.map(item=>item.itemId).sort()).toEqual([legacyItemId,v2ResourceItemId].sort());
    expect(view.buildingOptions).toHaveLength(6);
    expect(view.buildingOptions.every(building=>!building.canUpgrade)).toBe(true);
    expect(readback.playerPointsExact).toBe("49000");
    expect(readback.treasuryBalanceExact).toBe("1000");
    expect(readback.revisionExact).toBe("1");
    const [ledger] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS rowCount, SUM(amount) AS amount FROM aurionGuildTreasuryLedger WHERE guildId = ? AND reason = 'player_deposit'", [guildId]);
    expect(Number(ledger[0]?.rowCount)).toBe(1);
    expect(String(ledger[0]?.amount)).toBe("1000");
  });

  it("denies withdrawal to a normal member and permits the founder atomically", async () => {
    await expect(store.plan(memberUserId, { operation: "withdraw_points", expectedRevisionExact: "1", idempotencyKey: "aim269-member-withdraw", payload: { amountExact: "1" } })).rejects.toThrow("GUILD_CAPABILITY_REQUIRED");
    const planned = await store.plan(founderUserId, { operation: "withdraw_points", expectedRevisionExact: "1", idempotencyKey: "aim269-founder-withdraw", payload: { amountExact: "250" } });
    const applied = await store.apply(founderUserId, planned.plan.confirmationHash);
    expect(applied.readback.treasuryBalanceExact).toBe("750");
    expect(applied.readback.playerPointsExact).toBe("50250");
    expect(applied.readback.revisionExact).toBe("2");
  });

  it("moves a real legacy item into exclusive guild custody and then to an authorized recipient", async () => {
    const deposit = await store.plan(memberUserId, { operation: "deposit_item", expectedRevisionExact: "2", idempotencyKey: "aim269-item-deposit", payload: { itemRecordVersion: "legacy", itemId: legacyItemId } });
    const deposited = await store.apply(memberUserId, deposit.plan.confirmationHash);
    expect(deposited.readback.heldItems).toHaveLength(1);
    const [heldItem] = await pool.query<RowDataPacket[]>("SELECT ownerUserId, status FROM itemInstances WHERE id = ?", [legacyItemId]);
    expect(heldItem[0]).toMatchObject({ ownerUserId: memberUserId, status: "guild_custody" });

    const withdrawal = await store.plan(founderUserId, { operation: "withdraw_item", expectedRevisionExact: "3", idempotencyKey: "aim269-item-withdraw", payload: { itemRecordVersion: "legacy", itemId: legacyItemId } });
    const withdrawn = await store.apply(founderUserId, withdrawal.plan.confirmationHash);
    expect(withdrawn.readback.heldItems).toHaveLength(0);
    const [ownedItem] = await pool.query<RowDataPacket[]>("SELECT ownerUserId, status FROM itemInstances WHERE id = ?", [legacyItemId]);
    expect(ownedItem[0]).toMatchObject({ ownerUserId: founderUserId, status: "owned" });
    const [custodyEvents] = await pool.query<RowDataPacket[]>("SELECT eventType, previousOwnerUserId, resultingOwnerUserId FROM aurionGuildItemCustodyLedger WHERE guildId = ? ORDER BY createdAt, eventType", [guildId]);
    expect(custodyEvents.map(row => row.eventType).sort()).toEqual(["deposit", "withdrawal"]);
  });

  it("consumes a real V2 material instance into one exact guild resource unit", async () => {
    const planned = await store.plan(memberUserId, { operation: "donate_resource_item", expectedRevisionExact: "4", idempotencyKey: "aim269-resource-donation", payload: { itemRecordVersion: "aurion_v2", itemId: v2ResourceItemId, expectedResourceKey: "wood" } });
    const applied = await store.apply(memberUserId, planned.plan.confirmationHash);
    expect(applied.readback.resourceBalancesExact.wood).toBe("1");
    const [itemRows] = await pool.query<RowDataPacket[]>("SELECT ownerUserId, status FROM aurionItemInstancesV2 WHERE id = ?", [v2ResourceItemId]);
    expect(itemRows[0]).toMatchObject({ ownerUserId: memberUserId, status: "consumed" });
    const [resourceRows] = await pool.query<RowDataPacket[]>("SELECT amount, balanceBefore, balanceAfter, sourceItemId FROM aurionGuildResourceLedger WHERE guildId = ? AND resourceKey = 'wood'", [guildId]);
    expect(resourceRows).toHaveLength(1);
    expect(resourceRows[0]).toMatchObject({ sourceItemId: v2ResourceItemId });
    expect(String(resourceRows[0]?.amount)).toBe("1");
  });

  it("upgrades one building by atomically consuming points and all exact resource accounts", async () => {
    await pool.query("UPDATE aurionGuildTreasuryAccounts SET balance = 20000 WHERE guildId = ?", [guildId]);
    await pool.query("UPDATE aurionGuildResourceAccounts SET balance = 5000 WHERE guildId = ?", [guildId]);
    const planned = await store.plan(founderUserId, { operation: "upgrade_building", expectedRevisionExact: "5", idempotencyKey: "aim269-building-upgrade", payload: { buildingId: "bld_sovereign_academy", expectedLevelExact: "0" } });
    const applied = await store.apply(founderUserId, planned.plan.confirmationHash);
    expect(applied.readback.revisionExact).toBe("6");
    expect(applied.readback.treasuryBalanceExact).toBe("17800");
    expect(applied.readback.resourceBalancesExact).toEqual({ wood: "4500", stone: "4550", aether: "4650" });
    expect(applied.readback.buildings).toEqual([expect.objectContaining({ buildingId: "bld_sovereign_academy", levelExact: "1", projection: expect.objectContaining({ bonusesBps: expect.objectContaining({ validatedMasteryXpBps: 200 }) }) })]);
    const [ledger] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS rowCount FROM aurionGuildResourceLedger WHERE guildId = ? AND direction = 'debit'", [guildId]);
    expect(Number(ledger[0]?.rowCount)).toBe(3);
  });
  it("enforces the exact injected deadline and still reads consumed receipts after expiry", async () => {
    let timestamp = 1_800_000_000_000;
    const timed = GuildBankStore.fromDatabaseUrl(databaseUrl, { now: () => timestamp });
    try {
      const initial = await timed.read(founderUserId,guildId);
      const expired = await timed.plan(founderUserId,{operation:"deposit_points",expectedRevisionExact:initial.revisionExact,idempotencyKey:"aim269-exact-expiry",payload:{amountExact:"1"}});
      expect(new Date(expired.expiresAt).getTime()).toBe(timestamp + 600_000);
      timestamp += 600_000;
      await expect(timed.apply(founderUserId,expired.plan.confirmationHash)).rejects.toThrow("GUILD_BANK_PLAN_EXPIRED");
      expect((await timed.read(founderUserId,guildId)).revisionExact).toBe(initial.revisionExact);
      const valid = await timed.plan(founderUserId,{operation:"deposit_points",expectedRevisionExact:initial.revisionExact,idempotencyKey:"aim269-before-expiry",payload:{amountExact:"1"}});
      timestamp += 599_999;
      const applied = await timed.apply(founderUserId,valid.plan.confirmationHash);
      timestamp += 1;
      const replay = await timed.apply(founderUserId,valid.plan.confirmationHash);
      expect(replay.replay).toBe(true); expect(replay.receipt).toEqual(applied.receipt);
      expect(replay.readback.playerPointsExact).toBe(applied.readback.playerPointsExact);
    } finally { await timed.close(); }
  });

});
