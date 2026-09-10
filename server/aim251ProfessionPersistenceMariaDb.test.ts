import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { craftItemForUser, getCraftingReadmodel, getDb, materializeCraftingBonusForUser } from "./db";
import {
  aurionProgressionReceipts,
  aurionTradeCraftingReceipts,
  craftingReceipts,
  itemInstances,
  playerProfiles,
  skillProgressionEvents,
} from "../drizzle/schema";
import { aurionProfessionOutputBatches, aurionProfessionReceipts, aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import { canonicalScopedMasteryKey, masteryKeys, SCOPED_MASTERY_RULESET_VERSION, type ScopedMasteryEvent } from "./scopedMasteryProtocol";
import { xpRequiredForNextSkillLevelExact } from "./wasdAurionSkillProgressionProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { craftAx1RecipeForUser } from "./ax1CraftingPersistence";
import { getAx1CraftingRecipe } from "../shared/ax1CraftingCatalog";
import { recordProgressionReceipt } from "./progressionReceiptPersistence";

const enabled = Boolean(process.env.DATABASE_URL) && process.env.AURION_PROFESSION_E2E === "1";
const suite = enabled ? describe : describe.skip;
const userId = 9251001;
const foreignUserId = 9251002;
const inputId = "aim251_owned_input";
const ax1CharacterId = "aim251_ax1_character";

suite("AIM-251 production crafting transaction in isolated MariaDB", () => {
  let pool: Pool;
  let isolated = false;
  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    const db = (await getDb())!;
    await pool.query("DROP TRIGGER IF EXISTS aim251_abort_scoped_mastery");
    await pool.query("DROP TRIGGER IF EXISTS aim251_abort_ax1_mastery");
    await db.delete(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.userId, userId));
    await db.delete(aurionProfessionOutputBatches).where(eq(aurionProfessionOutputBatches.ownerUserId, userId));
    await db.delete(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, userId));
    await db.delete(skillProgressionEvents).where(eq(skillProgressionEvents.userId, userId));
    await db.delete(itemInstances).where(sql`${itemInstances.ownerUserId} IN (${userId}, ${foreignUserId})`);
    await db.delete(craftingReceipts).where(eq(craftingReceipts.userId, userId));
    await db.delete(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.userId, userId));
    await db.delete(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.userId, userId));
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
    await recordProgressionReceipt({
      userId,
      characterId: ax1CharacterId,
      actionKind: "weapon_use",
      weaponTrack: "blade",
      skillId: "none",
      resultReceiptId: "aim251_ax1_character_result",
      sourceReceiptId: "aim251_ax1_character_source",
      lootReceiptId: null,
      masteryEventId: null,
      xpGrantedExact: "0",
      levelExact: "1",
      ruleSetVersion: "aim251-character-rule-v1",
      contentVersion: "aim251-character-content-v1",
      idempotencyKey: "aim251-ax1-character-idempotency",
    });
  });
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });

  async function insertAx1Inputs(recipeId: string, prefix: string, ownerUserId = userId): Promise<string[]> {
    const recipe = getAx1CraftingRecipe(recipeId);
    if (!recipe) throw new Error(`missing AX1 recipe fixture: ${recipeId}`);
    const inputs = recipe.ingredients.flatMap((ingredient, ingredientIndex) =>
      Array.from({ length: ingredient.quantity }, (_, quantityIndex) => ({
        id: `${prefix}_${ingredientIndex}_${quantityIndex}`,
        baseItemKey: ingredient.itemId,
      })),
    );
    const db = (await getDb())!;
    await db.insert(itemInstances).values(inputs.map(input => ({
      id: input.id,
      ownerUserId,
      sourceKind: "loot" as const,
      lootReceiptId: `${input.id}_loot`,
      baseItemKey: input.baseItemKey,
      quality: "normal" as const,
      itemLevel: 1,
      affixesJson: "[]",
    })));
    return inputs.map(input => input.id);
  }

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

  it("rejects modified receipt bytes and output templates before replay or materialization", async () => {
    const request = { userId, recipeKey: "temper_aurion_spear", inputItemId: inputId };
    const craft = await craftItemForUser(request);
    const db = (await getDb())!;
    const id = craft.profession!.envelope.receiptId;
    const [receipt] = await db.select().from(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.id, id));
    const [batch] = await db.select().from(aurionProfessionOutputBatches).where(eq(aurionProfessionOutputBatches.professionReceiptId, id));
    const envelope = JSON.parse(receipt.envelopeJson);
    envelope.modifiers.qualityPowerBps += 1;
    await db.update(aurionProfessionReceipts).set({ envelopeJson: stableCatalogStringify(envelope) }).where(eq(aurionProfessionReceipts.id, id));
    await expect(craftItemForUser(request)).rejects.toThrow("PROFESSION_STORED_CONTENT_CORRUPT");
    await db.update(aurionProfessionReceipts).set({ envelopeJson: receipt.envelopeJson }).where(eq(aurionProfessionReceipts.id, id));
    const template = JSON.parse(batch.templateJson);
    template.affixes[0].stats.power += 999;
    await db.update(aurionProfessionOutputBatches).set({ templateJson: stableCatalogStringify(template) }).where(eq(aurionProfessionOutputBatches.professionReceiptId, id));
    await expect(materializeCraftingBonusForUser({ userId, receiptId: craft.receipt.id, expectedOutputIndexExact: "1", count: 1 })).rejects.toThrow("PROFESSION_STORED_CONTENT_CORRUPT");
    expect(await db.select().from(itemInstances).where(eq(itemInstances.craftingReceiptId, craft.receipt.id))).toHaveLength(1);
    expect(await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.userId, userId))).toHaveLength(3);
    await db.update(aurionProfessionOutputBatches).set({ templateJson: batch.templateJson }).where(eq(aurionProfessionOutputBatches.professionReceiptId, id));
    expect((await craftItemForUser(request)).applied).toBe(false);
  }, 30_000);

  it("atomically crafts the AX1 Holzkiste from five concrete material origins and replays regardless of input order", async () => {
    const inputItemIds = await insertAx1Inputs("recipe_carpenter_holzkiste", "aim251_ax1_crate");
    expect(inputItemIds).toHaveLength(5);
    const request = { userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds: [...inputItemIds].reverse() };
    const [first, retry] = await Promise.all([craftAx1RecipeForUser(request), craftAx1RecipeForUser(request)]);
    expect([first.applied, retry.applied].filter(Boolean)).toHaveLength(1);
    expect(first.receiptId).toBe(retry.receiptId);
    expect(first.receiptHash).toBe(retry.receiptHash);
    expect(first.outputs).toHaveLength(1);
    expect(first.outputs[0]).toMatchObject({ ownerUserId: userId, baseItemKey: "item_carpenter_holzkiste", status: "owned" });

    const db = (await getDb())!;
    const inputs = await db.select({ id: itemInstances.id, status: itemInstances.status }).from(itemInstances).where(sql`${itemInstances.id} IN (${sql.join(inputItemIds.map(id => sql`${id}`), sql`, `)})`);
    expect(inputs).toHaveLength(5);
    expect(inputs.every(input => input.status === "consumed")).toBe(true);
    const [receipt] = await db.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.id, first.receiptId));
    const deltas = JSON.parse(receipt.resourceDeltasJson) as Array<{ resourceId: string; quantityExact: string }>;
    expect(deltas).toHaveLength(5);
    expect(deltas.map(delta => delta.resourceId)).toEqual([...inputItemIds].sort());
    expect(deltas.every(delta => delta.quantityExact === "-1")).toBe(true);
    expect(receipt).toMatchObject({ characterId: ax1CharacterId, professionContext: "carpentry" });
    expect(await db.select().from(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, userId))).toHaveLength(1);
    expect(await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.userId, userId))).toHaveLength(3);
  }, 30_000);

  it("materializes the AX1 Heiltrank base quantity of two as two distinct inventory origins", async () => {
    const inputItemIds = await insertAx1Inputs("recipe_alchemist_heiltrank", "aim251_ax1_heal");
    expect(inputItemIds).toHaveLength(3);
    const craft = await craftAx1RecipeForUser({ userId, recipeId: "recipe_alchemist_heiltrank", inputItemIds });
    expect(craft.applied).toBe(true);
    expect(craft.outputs).toHaveLength(2);
    expect(craft.outputs.every(output => output.baseItemKey === "item_alch_heiltrank" && output.ownerUserId === userId)).toBe(true);
    expect(new Set(craft.outputs.map(output => output.craftingOutputKey)).size).toBe(2);

    const db = (await getDb())!;
    const [receipt] = await db.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.id, craft.receiptId));
    const result = JSON.parse(receipt.resultJson) as { baseOutputQuantityExact?: string };
    expect(result.baseOutputQuantityExact).toBe("2");
    const [batch] = await db.select().from(aurionProfessionOutputBatches).where(eq(aurionProfessionOutputBatches.sourceCraftingReceiptId, craft.receiptId));
    expect(batch.nextOutputIndexExact).toBe("2");
    expect(BigInt(batch.totalQuantityExact)).toBeGreaterThanOrEqual(2n);
  }, 30_000);

  it("serializes overlapping AX1 bundles so only one craft can consume the shared material", async () => {
    const db = (await getDb())!;
    const shared = "aim251_shared_oak";
    const entries = [
      { id: shared, baseItemKey: "mat_wood_oak" },
      { id: "aim251_a_oak_1", baseItemKey: "mat_wood_oak" },
      { id: "aim251_a_oak_2", baseItemKey: "mat_wood_oak" },
      { id: "aim251_a_oak_3", baseItemKey: "mat_wood_oak" },
      { id: "aim251_b_oak_1", baseItemKey: "mat_wood_oak" },
      { id: "aim251_b_oak_2", baseItemKey: "mat_wood_oak" },
      { id: "aim251_b_oak_3", baseItemKey: "mat_wood_oak" },
      { id: "aim251_a_copper", baseItemKey: "mat_ore_copper" },
      { id: "aim251_b_copper", baseItemKey: "mat_ore_copper" },
    ];
    await db.insert(itemInstances).values(entries.map(entry => ({ id: entry.id, ownerUserId: userId, sourceKind: "loot" as const, lootReceiptId: `${entry.id}_loot`, baseItemKey: entry.baseItemKey, quality: "normal" as const, itemLevel: 1, affixesJson: "[]" })));
    const a = [shared, "aim251_a_oak_1", "aim251_a_oak_2", "aim251_a_oak_3", "aim251_a_copper"];
    const b = [shared, "aim251_b_oak_1", "aim251_b_oak_2", "aim251_b_oak_3", "aim251_b_copper"];
    const settled = await Promise.allSettled([
      craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds: a }),
      craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds: b }),
    ]);
    expect(settled.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(result => result.status === "rejected")).toHaveLength(1);
    const rejected = settled.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("AX1_CRAFTING_INPUT_UNAVAILABLE");

    const statuses = await db.select({ status: itemInstances.status }).from(itemInstances).where(sql`${itemInstances.id} IN (${sql.join(entries.map(entry => sql`${entry.id}`), sql`, `)})`);
    expect(statuses.filter(row => row.status === "consumed")).toHaveLength(5);
    expect(statuses.filter(row => row.status === "owned")).toHaveLength(4);
    expect(await db.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.userId, userId))).toHaveLength(1);
    expect(await db.select().from(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, userId))).toHaveLength(1);
  }, 30_000);

  it("rejects duplicate, missing and foreign AX1 material origins without persistence effects", async () => {
    const inputItemIds = await insertAx1Inputs("recipe_carpenter_holzkiste", "aim251_ax1_invalid");
    const foreignIds = await insertAx1Inputs("recipe_carpenter_holzkiste", "aim251_ax1_foreign", foreignUserId);
    await expect(craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds: [...inputItemIds, inputItemIds[0]] })).rejects.toThrow("AX1_CRAFTING_INPUT_DUPLICATE");
    await expect(craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds: [...inputItemIds.slice(0, -1), "aim251_missing_material"] })).rejects.toThrow("AX1_CRAFTING_INPUT_UNAVAILABLE");
    await expect(craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds: [...inputItemIds.slice(0, -1), foreignIds.at(-1)!] })).rejects.toThrow("AX1_CRAFTING_INPUT_UNAVAILABLE");
    const db = (await getDb())!;
    expect(await db.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.userId, userId))).toHaveLength(0);
    expect(await db.select().from(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, userId))).toHaveLength(0);
    const owned = await db.select().from(itemInstances).where(and(eq(itemInstances.ownerUserId, userId), eq(itemInstances.status, "owned")));
    expect(owned.filter(item => inputItemIds.includes(item.id))).toHaveLength(inputItemIds.length);
  }, 30_000);

  it("rolls back the complete AX1 multi-input transaction when the late mastery commit fails", async () => {
    const inputItemIds = await insertAx1Inputs("recipe_carpenter_holzkiste", "aim251_ax1_rollback");
    await pool.query(`CREATE TRIGGER aim251_abort_ax1_mastery BEFORE INSERT ON aurionScopedMasteryEvents FOR EACH ROW BEGIN IF NEW.userId = ${userId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AIM251_AX1_FORCED_ROLLBACK'; END IF; END`);
    try {
      await expect(craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds })).rejects.toMatchObject({ cause: { code: "ER_SIGNAL_EXCEPTION" } });
      const db = (await getDb())!;
      const inputs = await db.select({ status: itemInstances.status }).from(itemInstances).where(sql`${itemInstances.id} IN (${sql.join(inputItemIds.map(id => sql`${id}`), sql`, `)})`);
      expect(inputs).toHaveLength(5);
      expect(inputs.every(input => input.status === "owned")).toBe(true);
      expect(await db.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.userId, userId))).toHaveLength(0);
      expect(await db.select().from(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, userId))).toHaveLength(0);
      expect((await db.select().from(itemInstances).where(and(eq(itemInstances.ownerUserId, userId), eq(itemInstances.sourceKind, "crafting")))).length).toBe(0);
    } finally { await pool.query("DROP TRIGGER aim251_abort_ax1_mastery"); }
    const recovered = await craftAx1RecipeForUser({ userId, recipeId: "recipe_carpenter_holzkiste", inputItemIds });
    expect(recovered.applied).toBe(true);
    expect(recovered.outputs).toHaveLength(1);
  }, 30_000);
});
