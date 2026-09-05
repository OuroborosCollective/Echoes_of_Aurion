import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { craftItemForUser, getCraftingReadmodel, getDb, materializeCraftingBonusForUser } from "./db";
import { craftingReceipts, itemInstances, playerProfiles, skillProgressionEvents } from "../drizzle/schema";
import { aurionProfessionOutputBatches, aurionProfessionReceipts, aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import { canonicalScopedMasteryKey, masteryKeys, SCOPED_MASTERY_RULESET_VERSION, type ScopedMasteryEvent } from "./scopedMasteryProtocol";
import { xpRequiredForNextSkillLevelExact } from "./wasdAurionSkillProgressionProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";

const enabled = Boolean(process.env.DATABASE_URL) && process.env.AURION_PROFESSION_E2E === "1";
const suite = enabled ? describe : describe.skip;
const userId = 9251001;
const foreignUserId = 9251002;
const inputId = "aim251_owned_input";

suite("AIM-251 production crafting transaction in isolated MariaDB", () => {
  let pool: Pool;
  let isolated = false;
  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    const db = (await getDb())!;
    await pool.query("DROP TRIGGER IF EXISTS aim251_abort_scoped_mastery");
    await db.delete(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.userId, userId));
    await db.delete(aurionProfessionOutputBatches).where(eq(aurionProfessionOutputBatches.ownerUserId, userId));
    await db.delete(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, userId));
    await db.delete(skillProgressionEvents).where(eq(skillProgressionEvents.userId, userId));
    await db.delete(itemInstances).where(sql`${itemInstances.ownerUserId} IN (${userId}, ${foreignUserId})`);
    await db.delete(craftingReceipts).where(eq(craftingReceipts.userId, userId));
    await db.delete(playerProfiles).where(sql`${playerProfiles.userId} IN (${userId}, ${foreignUserId})`);
  }
  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query("SELECT DATABASE() AS name");
    const name = (rows as Array<{ name: string }>)[0]?.name;
    if (!name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(async () => {
    await cleanup();
    const db = (await getDb())!;
    await db.insert(playerProfiles).values([{ userId }, { userId: foreignUserId }]);
    await db.insert(itemInstances).values([
      { id: inputId, ownerUserId: userId, sourceKind: "loot", lootReceiptId: "aim251_source_loot", baseItemKey: "aurion_spear", quality: "normal", itemLevel: 2, affixesJson: "[]" },
      { id: "aim251_foreign_input", ownerUserId: foreignUserId, sourceKind: "loot", lootReceiptId: "aim251_foreign_loot", baseItemKey: "aurion_spear", quality: "normal", itemLevel: 2, affixesJson: "[]" },
    ]);
  });
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });

  it("commits receipt, input, output and three mastery scopes once under parallel retry", async () => {
    const [first, retry] = await Promise.all([0, 1].map(() => craftItemForUser({ userId, recipeKey: "temper_aurion_spear", inputItemId: inputId })));
    expect([first.applied, retry.applied].filter(Boolean)).toHaveLength(1);
    expect(first.receipt.id).toBe(retry.receipt.id);
    expect(first.profession?.envelope.commitHash).toBe(retry.profession?.envelope.commitHash);
    const readback = await getCraftingReadmodel(userId);
    expect(readback.scopedMastery).toHaveLength(3);
    for (const mastery of readback.scopedMastery) expect(mastery).toMatchObject({ lifetimeUsesExact: "1", progression: { totalXpExact: "6" } });
    const [rows] = await pool.query("SELECT (SELECT COUNT(*) FROM aurionProfessionReceipts WHERE userId=?) AS receipts, (SELECT COUNT(*) FROM aurionScopedMasteryEvents WHERE userId=?) AS events, (SELECT status FROM itemInstances WHERE id=?) AS inputStatus", [userId, userId, inputId]);
    expect(rows).toEqual([expect.objectContaining({ receipts: 1, events: 3, inputStatus: "consumed" })]);
    await expect(craftItemForUser({ userId, recipeKey: "temper_aurion_spear", inputItemId: "aim251_foreign_input" })).rejects.toThrow("gehört dir nicht");
  }, 30_000);

  it("keeps guaranteed bonus quantity exact and materializes each origin without additional XP", async () => {
    // Explicit isolated fixture: set historical item mastery to level 1049.
    let xp = 0n;
    for (let level = 1; level < 1049; level++) xp += BigInt(xpRequiredForNextSkillLevelExact(String(level)));
    const seedEvent: ScopedMasteryEvent = { receiptId: "aim251_historical_fixture", idempotencyKey: "aim251_fixture_item_mastery", resolutionIndex: 0, key: masteryKeys.item("aurion_spear"), amountExact: xp.toString(), serverValidated: true, activeDurationTicks: 1, repetitionStreak: 0, distinctContextCount: 1, ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION, contentVersion: "aim251-test-fixture-v1" };
    const db = (await getDb())!;
    await db.insert(aurionScopedMasteryEvents).values({ id: seedEvent.idempotencyKey, userId, scopeKey: canonicalScopedMasteryKey(seedEvent.key), professionReceiptId: seedEvent.receiptId, eventJson: stableCatalogStringify(seedEvent), eventHash: createHash("sha256").update(stableCatalogStringify(seedEvent)).digest("hex") });
    const craft = await craftItemForUser({ userId, recipeKey: "temper_aurion_spear", inputItemId: inputId });
    expect(craft.profession?.envelope.yield).toMatchObject({ totalQuantityExact: "2", guaranteedBonusBatchesExact: "1" });
    const request = { userId, receiptId: craft.receipt.id, expectedOutputIndexExact: "1", count: 1 };
    const [first, retry] = await Promise.all([materializeCraftingBonusForUser(request), materializeCraftingBonusForUser(request)]);
    expect([first.applied, retry.applied].filter(Boolean)).toHaveLength(1);
    expect(first.outputs[0].id).toBe(retry.outputs[0].id);
    expect(first.outputs[0].id).not.toBe(craft.output.id);
    const outputs = await db.select().from(itemInstances).where(and(eq(itemInstances.craftingReceiptId, craft.receipt.id), eq(itemInstances.sourceKind, "crafting")));
    expect(outputs).toHaveLength(2);
    expect(new Set(outputs.map(output => output.craftingOutputKey)).size).toBe(2);
    expect(await db.select().from(skillProgressionEvents).where(eq(skillProgressionEvents.userId, userId))).toHaveLength(1);
    expect(await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.userId, userId))).toHaveLength(4);
    expect((await getCraftingReadmodel(userId)).bonusOutputs).toEqual([]);
    await expect(materializeCraftingBonusForUser({ ...request, expectedOutputIndexExact: "2" })).rejects.toThrow("CRAFT_OUTPUT_RANGE_CONFLICT");
    await expect(materializeCraftingBonusForUser({ ...request, userId: foreignUserId })).rejects.toThrow("CRAFT_PROFESSION_RECEIPT_REQUIRED");
  }, 30_000);

  it("rolls back consumed input, base item, receipt and XP when a late mastery insert fails", async () => {
    await pool.query(`CREATE TRIGGER aim251_abort_scoped_mastery BEFORE INSERT ON aurionScopedMasteryEvents FOR EACH ROW BEGIN IF NEW.userId = ${userId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AIM251_FORCED_ROLLBACK'; END IF; END`);
    try {
      await expect(craftItemForUser({ userId, recipeKey: "temper_aurion_spear", inputItemId: inputId })).rejects.toMatchObject({ cause: { code: "ER_SIGNAL_EXCEPTION" } });
      const [rows] = await pool.query("SELECT (SELECT status FROM itemInstances WHERE id=?) AS inputStatus, (SELECT COUNT(*) FROM craftingReceipts WHERE userId=?) AS receipts, (SELECT COUNT(*) FROM itemInstances WHERE ownerUserId=? AND sourceKind='crafting') AS outputs, (SELECT COUNT(*) FROM skillProgressionEvents WHERE userId=?) AS xp, (SELECT COUNT(*) FROM aurionProfessionReceipts WHERE userId=?) AS professions", [inputId, userId, userId, userId, userId]);
      expect(rows).toEqual([expect.objectContaining({ inputStatus: "owned", receipts: 0, outputs: 0, xp: 0, professions: 0 })]);
    } finally { await pool.query("DROP TRIGGER aim251_abort_scoped_mastery"); }
    const recovered = await craftItemForUser({ userId, recipeKey: "temper_aurion_spear", inputItemId: inputId });
    expect(recovered).toMatchObject({ applied: true, receipt: { resolutionIndex: 1 } });
  }, 30_000);
});
