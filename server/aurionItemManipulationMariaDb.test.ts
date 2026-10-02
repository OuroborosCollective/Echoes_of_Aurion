import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aurionItemInstancesV2, craftingReceipts, playerProfiles } from "../drizzle/schema";
import { getDb } from "./db";
import { executeAurionItemManipulation, itemManipulationCommandSchema, readAurionItemManipulation } from "./aurionItemManipulationPersistence";
import { executeAurionInventoryTransaction, readAurionInventorySnapshot } from "./aurionInventoryBackendAdapter";
import { inventoryItemShapeHash, inventoryMaxQuantityExact, inventoryMergeKey } from "./aurionInventoryStackIdentity";
import { readPlayerUi, equipPlayerItem } from "./playerUiPersistence";
import { readConfirmedEquipmentVisuals } from "./confirmedEquipmentVisualReadback";

const suite = process.env.DATABASE_URL && process.env.AURION_MANIPULATION_DB_E2E === "1" ? describe : describe.skip;
const USER = 2_146_999_880;
const FOREIGN = USER - 1;
const prefix = `aim535-${process.env.AURION_TEST_SOURCE_SHA?.slice(0,8) ?? "local"}`;
function material(id: string, quantityExact = "20", ownerUserId = USER) {
  const definitionId = id.includes("clay") ? "component-shaping-echo-clay-v2" : "component-craft-star-iron-v2";
  const category = id.includes("clay") ? "shaping_component" as const : "crafting_component" as const;
  const shape = { definitionId, category, equipmentSlot: null, quality: "normal", levelExact: "1", affixesJson: "[]", setId: null, itemPower: 5 };
  return { id, ownerUserId, lootReceiptId: `loot-${id}`, baseItemDefinitionId: definitionId, category, quality: "normal" as const,
    itemLevelExact: "1", affixesJson: "[]", itemPower: 5, deterministicHash: "a".repeat(64), quantityExact,
    maxQuantityExact: inventoryMaxQuantityExact(shape), mergeKey: inventoryMergeKey(shape), provenanceHash: inventoryItemShapeHash(shape) };
}
async function command(recipeId: string, materialItemIds: string[], sourceItemId?: string, key = recipeId) {
  const snapshot = await readAurionInventorySnapshot(USER);
  return { recipeId, sourceItemId, materialItemIds, idempotencyKey: `${prefix}-${key}`, expectedRevisionExact: snapshot.revisionExact, expectedStateHash: snapshot.stateHash };
}

suite("AIM-535 real MariaDB atomic manipulation", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER));
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, FOREIGN));
    await db.delete(craftingReceipts).where(eq(craftingReceipts.userId, USER));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId, USER));
    await db.insert(playerProfiles).values({ userId: USER, level: 1 });
    await db.insert(aurionItemInstancesV2).values([material(`${prefix}-iron`), material(`${prefix}-clay`), material(`${prefix}-foreign`, "10", FOREIGN)]);
  });
  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, USER));
    await db.delete(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.ownerUserId, FOREIGN));
    await db.delete(craftingReceipts).where(eq(craftingReceipts.userId, USER));
    await db.delete(playerProfiles).where(eq(playerProfiles.userId, USER));
  });
  let sourceId: string;
  it("crafts concurrently exactly once and independently reads receipt, inventory and revision", async () => {
    const intent = await command("aurion-craft-v2", [`${prefix}-iron`]);
    const pair = await Promise.all([executeAurionItemManipulation(USER, intent), executeAurionItemManipulation(USER, intent)]);
    expect(pair.filter(result => result.applied)).toHaveLength(1);
    expect(pair[0].result).toEqual(pair[1].result);
    sourceId = pair[0].outputs[0]!.id;
    const db = (await getDb())!;
    const input = (await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, `${prefix}-iron`)))[0]!;
    expect(input.quantityExact).toBe("18");
    expect(pair[0].result.consumedItemHashes).toEqual(["a".repeat(64)]);
    expect((await readAurionInventorySnapshot(USER)).stateHash).toBe(pair[0].afterStateHash);
    expect((await readAurionItemManipulation(USER)).receipts).toHaveLength(1);
    expect((await readPlayerUi(USER)).items.find(item => item.id === sourceId)?.receiptId).toBe(pair[0].receipt.id);
    await expect(executeAurionItemManipulation(USER, { ...intent, recipeId: "aurion-upgrade-v2", sourceItemId: sourceId })).rejects.toThrow("AURION_ITEM_IDEMPOTENCY_CONFLICT");
    await expect(executeAurionItemManipulation(USER, { ...intent, idempotencyKey: `${prefix}-stale` })).rejects.toThrow("INVENTORY_STALE_STATE");
  });
  it("fails insufficient materials, foreign ownership and client-authored capability without partial effects", async () => {
    const db = (await getDb())!;
    await db.insert(aurionItemInstancesV2).values(material(`${prefix}-small`, "1"));
    const before = await readAurionInventorySnapshot(USER);
    await expect(executeAurionItemManipulation(USER, await command("aurion-craft-v2", [`${prefix}-small`], undefined, "insufficient"))).rejects.toThrow("AURION_ITEM_INSUFFICIENT_MATERIALS");
    await expect(executeAurionItemManipulation(USER, await command("aurion-craft-v2", [`${prefix}-foreign`], undefined, "foreign"))).rejects.toThrow("AURION_ITEM_OWNED_INPUT_REQUIRED");
    expect(await readAurionInventorySnapshot(USER)).toEqual(before);
    expect(() => itemManipulationCommandSchema.parse({ ...before, stationCapability: "forge" })).toThrow();
  });
  it("rolls back item writes when receipt persistence really fails", async () => {
    const db = (await getDb())!;
    const before = await readAurionInventorySnapshot(USER);
    const intent = await command("aurion-upgrade-v2", [`${prefix}-iron`], sourceId, "rollback");
    await db.execute(sql.raw(`CREATE TRIGGER aim535_test_receipt_failure BEFORE INSERT ON craftingReceipts FOR EACH ROW BEGIN IF NEW.userId = ${USER} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AIM535_RECEIPT_FAILURE'; END IF; END`));
    try { await expect(executeAurionItemManipulation(USER, intent)).rejects.toThrow(); }
    finally { await db.execute(sql.raw("DROP TRIGGER aim535_test_receipt_failure")); }
    expect(await readAurionInventorySnapshot(USER)).toEqual(before);
    expect((await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, sourceId)))[0]?.status).toBe("owned");
    expect((await readAurionItemManipulation(USER)).receipts).toHaveLength(1);
  });
  it("applies all remaining operations, projects crafted equipment and salvages back into the same inventory kernel", async () => {
    for (const operation of ["reforge", "augment", "upgrade", "socket", "shaping", "repair"] as const) {
      if (operation === "repair") {
        const db = (await getDb())!;
        await db.update(aurionItemInstancesV2).set({ durabilityBps: 4200 }).where(eq(aurionItemInstancesV2.id, sourceId));
      }
      const materialId = `${prefix}-${operation === "socket" || operation === "shaping" ? "clay" : "iron"}`;
      const intent = await command(`aurion-${operation}-v2`, [materialId], sourceId);
      const result = await executeAurionItemManipulation(USER, intent);
      expect(result.applied).toBe(true);
      expect(await executeAurionItemManipulation(USER, intent)).toMatchObject({ applied: false, result: result.result });
      const previous = (await (await getDb())!.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, sourceId)))[0]!;
      expect(previous).toMatchObject({ status: "consumed", quantityExact: "0" });
      sourceId = result.outputs[0]!.id;
      if (operation === "upgrade") expect(result.outputs[0]?.itemLevelExact).toBe("2");
      if (operation === "socket") expect(result.outputs[0]?.socketCount).toBe(1);
      if (operation === "repair") {
        expect(result.outputs[0]?.durabilityBps).toBe(10000);
        expect((await readPlayerUi(USER)).items.find(item => item.id === sourceId)).toMatchObject({ durabilityBps: 10000, socketCount: 1 });
        const beforeNoop = await readAurionInventorySnapshot(USER);
        await expect(executeAurionItemManipulation(USER, await command("aurion-repair-v2", [`${prefix}-iron`], sourceId, "no-op"))).rejects.toThrow("AURION_ITEM_REPAIR_NOT_REQUIRED");
        expect(await readAurionInventorySnapshot(USER)).toEqual(beforeNoop);
      }
    }
    await equipPlayerItem(USER, { id: sourceId, version: "aurion_v2" }, null);
    expect((await readConfirmedEquipmentVisuals(USER)).equipment.find(item => item.itemId === sourceId)?.visualDescriptor?.source.deterministicHash).toMatch(/^[a-f0-9]{64}$/);
    const { unequipPlayerItem } = await import("./playerUiPersistence");
    await unequipPlayerItem(USER, { id: sourceId, version: "aurion_v2" });
    const salvage = await executeAurionItemManipulation(USER, await command("aurion-salvage-v2", [], sourceId));
    expect(salvage.result.salvageYield).toEqual({ "component-craft-star-iron-v2": 1 });
    const row = salvage.outputs[0]!;
    expect(row).toMatchObject({ category: "crafting_component", quantityExact: "1", craftingReceiptId: salvage.receipt.id });
    const snapshot = await readAurionInventorySnapshot(USER);
    expect(snapshot.stateHash).toBe(salvage.afterStateHash);
    const consumed = await executeAurionInventoryTransaction({ userId: USER, command: { operation: "consume", sourceStackId: row.id, quantityExact: "1" }, idempotencyKey: `${prefix}-consume-salvage`, expectedRevisionExact: snapshot.revisionExact, expectedStateHash: snapshot.stateHash });
    expect(consumed.status).toBe("applied");
    console.log(JSON.stringify({ recordType: "aurion.aim535.mariadb-readback.v2", sourceRevision: process.env.AURION_TEST_SOURCE_SHA ?? "local", operations: 8, receiptId: salvage.receipt.id, receiptHash: salvage.receipt.receiptDigest, afterStateHash: consumed.receipt.afterStateHash }));
  });
  it("leaves unused surplus untouched and records only paid material identities", async () => {
    const db = (await getDb())!;
    const extra = { ...material(`${prefix}-zz-unused`, "20"), deterministicHash: "b".repeat(64) };
    await db.insert(aurionItemInstancesV2).values(extra);
    const result = await executeAurionItemManipulation(USER, await command("aurion-craft-v2", [extra.id, `${prefix}-iron`], undefined, "surplus"));
    expect(result.result.consumedItemHashes).toEqual(["a".repeat(64)]);
    expect((await db.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.id, extra.id)))[0]?.quantityExact).toBe("20");
  });
  it("returns the most recent 100 receipts after the bounded window fills", async () => {
    const db = (await getDb())!;
    await db.insert(craftingReceipts).values(Array.from({ length: 101 }, (_, index) => ({
      id: `${prefix}-window-${index}`, userId: USER, recipeKey: "aurion-craft-v2", recipeDigest: "b".repeat(64), ruleSetVersion: "aurion-item-manipulation.v2", contentVersion: "test-only", inputItemId: `${prefix}-iron`, receiptDigest: "b".repeat(64), resolutionIndex: 1000 + index, idempotencyKey: `${prefix}-window-${index}`,
    })));
    const receipts = (await readAurionItemManipulation(USER)).receipts;
    expect(receipts).toHaveLength(100);
    expect(receipts[0]?.resolutionIndex).toBe(1100);
    expect(receipts.at(-1)?.resolutionIndex).toBe(1001);
  });
});
