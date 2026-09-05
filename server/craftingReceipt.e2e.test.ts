import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AURION_CRAFTING_CONTENT_VERSION, AURION_CRAFTING_RULESET_VERSION } from "./craftingProtocol";
import { craftItemForUser, createMarketListing, getCraftingReadmodel, getDb, getGameplayProgress, listInventoryForUser } from "./db";
import { craftingReceipts, itemInstances, marketListings, playerProfiles, skillProgressionEvents } from "../drizzle/schema";
import { aurionProfessionReceipts, aurionProfessionOutputBatches, aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";

const describeWithCraftingDatabase = process.env.DATABASE_URL && process.env.AURION_CRAFTING_E2E === "1" ? describe : describe.skip;
const CRAFT_USER_ID = 2_146_999_990;
const FOREIGN_USER_ID = 2_146_999_989;

async function cleanupCraftingState() {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async tx => {
    await tx.delete(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.userId, CRAFT_USER_ID));
    await tx.delete(aurionProfessionOutputBatches).where(eq(aurionProfessionOutputBatches.ownerUserId, CRAFT_USER_ID));
    await tx.delete(aurionProfessionReceipts).where(eq(aurionProfessionReceipts.userId, CRAFT_USER_ID));
    await tx.delete(marketListings).where(eq(marketListings.sellerUserId, CRAFT_USER_ID));
    await tx.delete(skillProgressionEvents).where(and(eq(skillProgressionEvents.userId, CRAFT_USER_ID), eq(skillProgressionEvents.skillId, "crafting")));
    await tx.delete(craftingReceipts).where(eq(craftingReceipts.userId, CRAFT_USER_ID));
    await tx.delete(itemInstances).where(eq(itemInstances.ownerUserId, CRAFT_USER_ID));
    await tx.delete(itemInstances).where(eq(itemInstances.ownerUserId, FOREIGN_USER_ID));
    await tx.delete(playerProfiles).where(eq(playerProfiles.userId, CRAFT_USER_ID));
    await tx.delete(playerProfiles).where(eq(playerProfiles.userId, FOREIGN_USER_ID));
  });
}

function normalSpear(id: string, ownerUserId = CRAFT_USER_ID) {
  return { id, ownerUserId, sourceKind: "loot" as const, lootReceiptId: `loot_${id}`, baseItemKey: "aurion_spear", quality: "normal" as const, itemLevel: 2, affixesJson: "[]" };
}

describeWithCraftingDatabase("Crafting receipt E2E", () => {
  beforeEach(cleanupCraftingState);
  afterEach(cleanupCraftingState);

  it("verbraucht einen bestätigten eigenen Gegenstand genau einmal und projiziert Receipt, allgemeines Inventar, Marktpfad und Crafting-XP", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    await Promise.all([getGameplayProgress(CRAFT_USER_ID), getGameplayProgress(FOREIGN_USER_ID)]);
    await db.insert(itemInstances).values([
      normalSpear("craft_input_aurion_spear"),
      normalSpear("craft_foreign_aurion_spear", FOREIGN_USER_ID),
    ]);

    const first = await craftItemForUser({ userId: CRAFT_USER_ID, recipeKey: "temper_aurion_spear", inputItemId: "craft_input_aurion_spear" });
    expect(first).toMatchObject({
      applied: true,
      receipt: { ruleSetVersion: AURION_CRAFTING_RULESET_VERSION, contentVersion: AURION_CRAFTING_CONTENT_VERSION, resolutionIndex: 1 },
      output: { baseItemKey: "aurion_spear", quality: "magic", itemLevel: 2, affixes: [{ key: "tempered", slot: "prefix", stats: { power: 2 } }] },
      skillEvent: { skillId: "crafting", amountExact: "6", source: "crafting", receiptKind: "crafting", resolutionIndex: 1 },
    });
    const consumedInput = (await db.select().from(itemInstances).where(eq(itemInstances.id, "craft_input_aurion_spear")).limit(1))[0];
    expect(consumedInput).toMatchObject({ status: "consumed", sourceKind: "loot" });

    const inventory = await listInventoryForUser(CRAFT_USER_ID);
    expect(inventory).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.output.id, sourceKind: "crafting", craftingReceiptId: first.receipt.id, lootReceiptId: null, quality: "magic" })]));
    const readback = await getCraftingReadmodel(CRAFT_USER_ID);
    expect(readback).toMatchObject({
      receipts: [{ id: first.receipt.id, recipeKey: "temper_aurion_spear", resolutionIndex: 1 }],
      outputs: [{ id: first.output.id, quality: "magic" }],
      progression: { skillId: "crafting", progression: { totalXpExact: "6", levelExact: "1" }, appliedReceiptIds: [first.receipt.id] },
    });

    const replay = await craftItemForUser({ userId: CRAFT_USER_ID, recipeKey: "temper_aurion_spear", inputItemId: "craft_input_aurion_spear" });
    expect(replay).toMatchObject({ applied: false, receipt: { id: first.receipt.id }, output: { id: first.output.id }, skillEvent: { id: first.skillEvent.id } });
    expect(await db.select().from(craftingReceipts).where(eq(craftingReceipts.userId, CRAFT_USER_ID))).toHaveLength(1);
    expect(await db.select().from(skillProgressionEvents).where(and(eq(skillProgressionEvents.userId, CRAFT_USER_ID), eq(skillProgressionEvents.skillId, "crafting")))).toHaveLength(1);

    const listing = await createMarketListing({ itemId: first.output.id, sellerUserId: CRAFT_USER_ID, askingPrice: 40 });
    expect(listing).toMatchObject({ askingPrice: 40 });
    const listedOutput = (await db.select().from(itemInstances).where(eq(itemInstances.id, first.output.id)).limit(1))[0];
    expect(listedOutput).toMatchObject({ status: "listed", sourceKind: "crafting", craftingReceiptId: first.receipt.id, lootReceiptId: null });
    await expect(craftItemForUser({ userId: CRAFT_USER_ID, recipeKey: "temper_aurion_spear", inputItemId: "craft_foreign_aurion_spear" })).rejects.toThrow("nicht verfügbar oder gehört dir nicht");
  }, 30_000);

  it("serialisiert parallele Wiederholungen und weist Mischprovenienz auf Datenbankebene ab", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    await getGameplayProgress(CRAFT_USER_ID);
    await db.insert(itemInstances).values(normalSpear("craft_parallel_aurion_spear"));
    const [first, second] = await Promise.all([
      craftItemForUser({ userId: CRAFT_USER_ID, recipeKey: "temper_aurion_spear", inputItemId: "craft_parallel_aurion_spear" }),
      craftItemForUser({ userId: CRAFT_USER_ID, recipeKey: "temper_aurion_spear", inputItemId: "craft_parallel_aurion_spear" }),
    ]);
    expect([first.applied, second.applied].filter(Boolean)).toHaveLength(1);
    expect(first.receipt.id).toBe(second.receipt.id);
    expect(first.output.id).toBe(second.output.id);
    expect(await db.select().from(craftingReceipts).where(eq(craftingReceipts.userId, CRAFT_USER_ID))).toHaveLength(1);
    expect(await db.select().from(skillProgressionEvents).where(and(eq(skillProgressionEvents.userId, CRAFT_USER_ID), eq(skillProgressionEvents.skillId, "crafting")))).toHaveLength(1);

    await expect(db.insert(itemInstances).values({
      id: "invalid_mixed_provenance",
      ownerUserId: CRAFT_USER_ID,
      sourceKind: "crafting",
      lootReceiptId: "must_not_be_a_craft_source",
      baseItemKey: "aurion_spear",
      quality: "magic",
      itemLevel: 2,
      affixesJson: "[]",
    })).rejects.toThrow();
  }, 30_000);
});
