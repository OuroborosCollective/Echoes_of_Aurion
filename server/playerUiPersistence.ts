import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { aurionAx1StarterEquipmentReceipts, aurionAx1StarterEquipmentStates } from "../drizzle/ax1StarterEquipmentSchema";
import { aurionEquipmentSlots, aurionItemInstancesV2, itemInstances, playerProfiles } from "../drizzle/schema";
import { aurionPlayerUiSettings } from "../drizzle/playerUiSchema";
import { PLAYER_UI_VERSION, controlSettingsSchema, defaultHotbar, playerUiReadbackSchema, uiItemSchema, type ControlSettings, type UiItem } from "../shared/playerUiProtocol";
import {
  AX1_STARTER_BLADE_ATTACK_BONUS,
  AX1_STARTER_BLADE_ITEM_ID,
  AX1_STARTER_BLADE_MAX_HP_BONUS,
  AX1_STARTER_BLADE_NAME,
} from "./ax1CombatProjection";
import {
  AX1_STARTER_ITEM_LEVEL_EXACT,
  AX1_STARTER_ITEM_QUALITY,
  AX1_STARTER_ITEM_RECORD_VERSION,
  AX1_STARTER_ITEM_SLOT,
  assertCurrentAx1StarterReceipt,
  ax1StarterItemId,
} from "./ax1StarterEquipmentPersistence";
import { aurionLootBaseCatalog } from "./aurionLootCatalog";
import { getDb } from "./db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type UiTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ItemRef = Pick<UiItem, "id" | "version">;
const visibleStates = ["owned", "equipped", "pending_pickup"] as const;
const legacyWeapons: Record<string, string> = { aurion_spear: "Aurionspeer", asterion_blade: "Asterionklinge", archive_staff: "Archivstab", warden_focus: "Hüterfokus", solarium_blade: "Solariumklinge", sunspike_spear: "Sonnenspitzenspeer", ember_focus: "Glutfokus" };
const affixesSchema = z.array(z.object({ stats: z.record(z.string(), z.number().finite()) }));
const statsFrom = (json: string, base: Readonly<Record<string, number>> = {}) => affixesSchema.parse(JSON.parse(json)).reduce((stats, affix) => {
  for (const [key, value] of Object.entries(affix.stats)) stats[key] = (stats[key] ?? 0) + value;
  return stats;
}, { ...base });

export async function readControlSettings(tx: Database | UiTransaction, userId: number): Promise<ControlSettings> {
  const row = (await tx.select().from(aurionPlayerUiSettings).where(eq(aurionPlayerUiSettings.userId, userId)))[0];
  if (row && ((row.autoLoot !== 0 && row.autoLoot !== 1) || (row.analyticsConsent !== 0 && row.analyticsConsent !== 1))) throw new Error("UI_SETTINGS_CORRUPT");
  return row ? controlSettingsSchema.parse({ revision: row.revision, autoLoot: row.autoLoot === 1, analyticsConsent: row.analyticsConsent === 1, hotbar: JSON.parse(row.hotbarJson) }) : { revision: 0, autoLoot: true, analyticsConsent: false, hotbar: [...defaultHotbar] };
}
function legacyView(row: typeof itemInstances.$inferSelect): UiItem {
  return uiItemSchema.parse({ id: row.id, version: "legacy", name: legacyWeapons[row.baseItemKey] ?? row.baseItemKey.replaceAll("_", " "), definition: row.baseItemKey,
    levelExact: String(row.itemLevel), quality: row.quality, slot: legacyWeapons[row.baseItemKey] ? "main_hand" : null,
    status: row.status, stats: statsFrom(row.affixesJson), receiptId: row.lootReceiptId ?? row.craftingReceiptId });
}
function v2View(row: typeof aurionItemInstancesV2.$inferSelect): UiItem {
  const definition = aurionLootBaseCatalog.find(d => d.id === row.baseItemDefinitionId);
  if (!definition || (definition.equipmentSlot ?? null) !== row.equipmentSlot) throw new Error("UI_ITEM_CATALOG_MISMATCH");
  return uiItemSchema.parse({ id: row.id, version: "aurion_v2", name: row.baseItemDefinitionId.replace(/-v2$/, "").replaceAll("-", " "), definition: row.baseItemDefinitionId,
    levelExact: row.itemLevelExact, quality: row.quality, slot: row.equipmentSlot, status: row.status,
    stats: statsFrom(row.affixesJson, definition.baseStats), receiptId: row.lootReceiptId });
}
async function starterView(tx: UiTransaction, userId: number, lock = false): Promise<UiItem | null> {
  const stateRows = lock
    ? await tx.select().from(aurionAx1StarterEquipmentStates).where(eq(aurionAx1StarterEquipmentStates.userId, userId)).for("update")
    : await tx.select().from(aurionAx1StarterEquipmentStates).where(eq(aurionAx1StarterEquipmentStates.userId, userId));
  const state = stateRows[0];
  if (!state) return null;
  const receipt = (await tx.select().from(aurionAx1StarterEquipmentReceipts).where(eq(aurionAx1StarterEquipmentReceipts.id, state.receiptId)).limit(1))[0];
  if (!receipt || receipt.userId !== userId) throw new Error("AX1_STARTER_RECEIPT_MISSING");
  assertCurrentAx1StarterReceipt(receipt);
  return uiItemSchema.parse({
    id: ax1StarterItemId(userId),
    version: AX1_STARTER_ITEM_RECORD_VERSION,
    name: AX1_STARTER_BLADE_NAME,
    definition: AX1_STARTER_BLADE_ITEM_ID,
    levelExact: AX1_STARTER_ITEM_LEVEL_EXACT,
    quality: AX1_STARTER_ITEM_QUALITY,
    slot: AX1_STARTER_ITEM_SLOT,
    status: state.status,
    stats: { attack: AX1_STARTER_BLADE_ATTACK_BONUS, maxHealth: AX1_STARTER_BLADE_MAX_HP_BONUS },
    receiptId: receipt.id,
  });
}
async function readUi(tx: UiTransaction, userId: number) {
  // A repeatable-read transaction binds settings, bag and all paperdoll slots together.
  const settings = await readControlSettings(tx, userId);
  const legacy = await tx.select().from(itemInstances).where(and(eq(itemInstances.ownerUserId, userId), inArray(itemInstances.status, [...visibleStates]))).limit(501);
  const v2 = await tx.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.status, [...visibleStates]))).limit(501);
  const starter = await starterView(tx, userId);
  const equipment = await tx.select().from(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.userId, userId));
  if (starter?.status === "equipped" && equipment.some(e => e.slot === AX1_STARTER_ITEM_SLOT)) throw new Error("AX1_STARTER_EQUIPMENT_CONFLICT");
  const projectedEquipment = equipment.map(e => ({ slot: e.slot, id: e.itemId, version: e.itemRecordVersion as "legacy" | "aurion_v2" | "ax1_starter" }));
  if (starter?.status === "equipped") projectedEquipment.push({ slot: AX1_STARTER_ITEM_SLOT, id: starter.id, version: AX1_STARTER_ITEM_RECORD_VERSION });
  return playerUiReadbackSchema.parse({ version: PLAYER_UI_VERSION, userId, settings, items: [...legacy.map(legacyView), ...v2.map(v2View), ...(starter ? [starter] : [])], equipment: projectedEquipment });
}
export async function readPlayerUi(userId: number) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(tx => readUi(tx, userId));
}
async function lockPlayer(tx: UiTransaction, userId: number) {
  const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).for("update"))[0];
  if (!profile) throw new Error("PLAYER_PROFILE_REQUIRED");
  return profile;
}
async function ownedItem(tx: UiTransaction, userId: number, ref: ItemRef): Promise<UiItem> {
  if (ref.version === AX1_STARTER_ITEM_RECORD_VERSION) {
    if (ref.id !== ax1StarterItemId(userId)) throw new Error("OWNED_ITEM_REQUIRED");
    const starter = await starterView(tx, userId, true);
    if (!starter) throw new Error("OWNED_ITEM_REQUIRED");
    return starter;
  }
  if (ref.version === "legacy") {
    const row = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, ref.id), eq(itemInstances.ownerUserId, userId), inArray(itemInstances.status, [...visibleStates]))).for("update"))[0];
    if (!row) throw new Error("OWNED_ITEM_REQUIRED"); return legacyView(row);
  }
  const row = (await tx.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.id, ref.id), eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.status, [...visibleStates]))).for("update"))[0];
  if (!row) throw new Error("OWNED_ITEM_REQUIRED"); return v2View(row);
}
async function setStatus(tx: UiTransaction, userId: number, ref: UiItem, status: UiItem["status"]) {
  if (ref.version === AX1_STARTER_ITEM_RECORD_VERSION) {
    if (status === "pending_pickup") throw new Error("AX1_STARTER_STATUS_INVALID");
    const result = await tx.update(aurionAx1StarterEquipmentStates).set({ status }).where(and(
      eq(aurionAx1StarterEquipmentStates.userId, userId),
      eq(aurionAx1StarterEquipmentStates.receiptId, ref.receiptId),
      eq(aurionAx1StarterEquipmentStates.status, ref.status as "owned" | "equipped"),
    ));
    if (result[0].affectedRows !== 1) throw new Error("ITEM_STATE_CONFLICT");
    return;
  }
  const result = ref.version === "legacy"
    ? await tx.update(itemInstances).set({ status }).where(and(eq(itemInstances.id, ref.id), eq(itemInstances.ownerUserId, userId), eq(itemInstances.status, ref.status)))
    : await tx.update(aurionItemInstancesV2).set({ status }).where(and(eq(aurionItemInstancesV2.id, ref.id), eq(aurionItemInstancesV2.ownerUserId, userId), eq(aurionItemInstancesV2.status, ref.status)));
  if (result[0].affectedRows !== 1) throw new Error("ITEM_STATE_CONFLICT");
}
export async function savePlayerControls(userId: number, expected: ControlSettings) {
  const input = controlSettingsSchema.parse(expected);
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    await lockPlayer(tx, userId);
    const previous = await readControlSettings(tx, userId);
    if (previous.revision !== input.revision) throw new Error("UI_SETTINGS_STALE");
    if (input.revision >= 2_000_000_000) throw new Error("UI_SETTINGS_REVISION_EXHAUSTED");
    const row = { userId, revision: input.revision + 1, autoLoot: input.autoLoot ? 1 : 0, analyticsConsent: input.analyticsConsent ? 1 : 0, hotbarJson: JSON.stringify(input.hotbar) };
    await tx.insert(aurionPlayerUiSettings).values(row).onDuplicateKeyUpdate({ set: row });
    return readUi(tx, userId);
  });
}
export async function collectPlayerLoot(userId: number, ref: ItemRef) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    await lockPlayer(tx, userId);
    const item = await ownedItem(tx, userId, ref);
    // Replay of a confirmed pickup cannot generate another item or another reward.
    if (item.status === "pending_pickup") await setStatus(tx, userId, item, "owned");
    return readUi(tx, userId);
  });
}
export async function equipPlayerItem(userId: number, ref: ItemRef, expectedItem: ItemRef | null) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    await lockPlayer(tx, userId);
    const item = await ownedItem(tx, userId, ref);
    if (!item.slot || item.status === "pending_pickup") throw new Error("COLLECTED_EQUIPMENT_REQUIRED");
    const prior = (await tx.select().from(aurionEquipmentSlots).where(and(eq(aurionEquipmentSlots.userId, userId), eq(aurionEquipmentSlots.slot, item.slot))).for("update"))[0];
    const starter = item.slot === AX1_STARTER_ITEM_SLOT ? await starterView(tx, userId, true) : null;
    const equippedStarter = starter?.status === "equipped" ? starter : null;
    if (prior && equippedStarter) throw new Error("AX1_STARTER_EQUIPMENT_CONFLICT");
    const current = prior ? { id: prior.itemId, version: prior.itemRecordVersion as ItemRef["version"] } : equippedStarter ? { id: equippedStarter.id, version: equippedStarter.version } : null;
    if (current?.id === item.id && current.version === item.version) return readUi(tx, userId);
    if ((current?.id ?? null) !== (expectedItem?.id ?? null) || (current?.version ?? null) !== (expectedItem?.version ?? null)) throw new Error("EQUIPMENT_SLOT_STALE");
    if (prior) {
      const previous = await ownedItem(tx, userId, { id: prior.itemId, version: prior.itemRecordVersion });
      if (previous.status !== "equipped" || previous.slot !== item.slot) throw new Error("EQUIPMENT_SLOT_CORRUPT");
      await setStatus(tx, userId, previous, "owned");
    }
    if (equippedStarter && equippedStarter.id !== item.id) await setStatus(tx, userId, equippedStarter, "owned");
    await setStatus(tx, userId, item, "equipped");
    if (item.version === AX1_STARTER_ITEM_RECORD_VERSION) {
      if (prior) await tx.delete(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.id, prior.id));
    } else {
      const row = { id: `equipment:${userId}:${item.slot}`, userId, slot: item.slot, itemId: item.id, itemRecordVersion: item.version };
      await tx.insert(aurionEquipmentSlots).values(row).onDuplicateKeyUpdate({ set: { itemId: item.id, itemRecordVersion: item.version } });
    }
    return readUi(tx, userId);
  });
}
export async function unequipPlayerItem(userId: number, ref: ItemRef) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    await lockPlayer(tx, userId);
    const item = await ownedItem(tx, userId, ref);
    if (item.version === AX1_STARTER_ITEM_RECORD_VERSION) {
      if (item.status !== "equipped") throw new Error("EQUIPMENT_SLOT_STALE");
      await setStatus(tx, userId, item, "owned");
      return readUi(tx, userId);
    }
    const prior = (await tx.select().from(aurionEquipmentSlots).where(and(eq(aurionEquipmentSlots.userId, userId), eq(aurionEquipmentSlots.itemId, item.id), eq(aurionEquipmentSlots.itemRecordVersion, item.version))).for("update"))[0];
    if (!prior || item.status !== "equipped") throw new Error("EQUIPMENT_SLOT_STALE");
    await tx.delete(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.id, prior.id));
    await setStatus(tx, userId, item, "owned");
    return readUi(tx, userId);
  });
}
