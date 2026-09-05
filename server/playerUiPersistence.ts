import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { aurionEquipmentSlots, aurionItemInstancesV2, itemInstances, playerProfiles } from "../drizzle/schema";
import { aurionPlayerUiSettings } from "../drizzle/playerUiSchema";
import { aurionLootBaseCatalog } from "./aurionLootCatalog";
import { PLAYER_UI_VERSION, controlSettingsSchema, defaultHotbar, playerUiReadbackSchema, uiItemSchema, type ControlSettings, type UiItem } from "../shared/playerUiProtocol";

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
  if (row && row.autoLoot !== 0 && row.autoLoot !== 1) throw new Error("UI_SETTINGS_CORRUPT");
  return row ? controlSettingsSchema.parse({ revision: row.revision, autoLoot: row.autoLoot === 1, hotbar: JSON.parse(row.hotbarJson) }) : { revision: 0, autoLoot: true, hotbar: [...defaultHotbar] };
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
async function readUi(tx: UiTransaction, userId: number) {
  // A repeatable-read transaction binds settings, bag and all paperdoll slots together.
  const settings = await readControlSettings(tx, userId);
  const legacy = await tx.select().from(itemInstances).where(and(eq(itemInstances.ownerUserId, userId), inArray(itemInstances.status, [...visibleStates]))).limit(501);
  const v2 = await tx.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.status, [...visibleStates]))).limit(501);
  const equipment = await tx.select().from(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.userId, userId));
  return playerUiReadbackSchema.parse({ version: PLAYER_UI_VERSION, userId, settings, items: [...legacy.map(legacyView), ...v2.map(v2View)],
    equipment: equipment.map(e => ({ slot: e.slot, id: e.itemId, version: e.itemRecordVersion })) });
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
  if (ref.version === "legacy") {
    const row = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, ref.id), eq(itemInstances.ownerUserId, userId), inArray(itemInstances.status, [...visibleStates]))).for("update"))[0];
    if (!row) throw new Error("OWNED_ITEM_REQUIRED"); return legacyView(row);
  }
  const row = (await tx.select().from(aurionItemInstancesV2).where(and(eq(aurionItemInstancesV2.id, ref.id), eq(aurionItemInstancesV2.ownerUserId, userId), inArray(aurionItemInstancesV2.status, [...visibleStates]))).for("update"))[0];
  if (!row) throw new Error("OWNED_ITEM_REQUIRED"); return v2View(row);
}
async function setStatus(tx: UiTransaction, userId: number, ref: UiItem, status: UiItem["status"]) {
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
    const row = { userId, revision: input.revision + 1, autoLoot: input.autoLoot ? 1 : 0, hotbarJson: JSON.stringify(input.hotbar) };
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
    if (prior?.itemId === item.id && prior.itemRecordVersion === item.version) return readUi(tx, userId);
    if ((prior?.itemId ?? null) !== (expectedItem?.id ?? null) || (prior?.itemRecordVersion ?? null) !== (expectedItem?.version ?? null)) throw new Error("EQUIPMENT_SLOT_STALE");
    if (prior) {
      const previous = await ownedItem(tx, userId, { id: prior.itemId, version: prior.itemRecordVersion });
      if (previous.status !== "equipped" || previous.slot !== item.slot) throw new Error("EQUIPMENT_SLOT_CORRUPT");
      await setStatus(tx, userId, previous, "owned");
    }
    await setStatus(tx, userId, item, "equipped");
    const row = { id: `equipment:${userId}:${item.slot}`, userId, slot: item.slot, itemId: item.id, itemRecordVersion: item.version };
    await tx.insert(aurionEquipmentSlots).values(row).onDuplicateKeyUpdate({ set: { itemId: item.id, itemRecordVersion: item.version } });
    return readUi(tx, userId);
  });
}
export async function unequipPlayerItem(userId: number, ref: ItemRef) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async tx => {
    await lockPlayer(tx, userId);
    const item = await ownedItem(tx, userId, ref);
    const prior = (await tx.select().from(aurionEquipmentSlots).where(and(eq(aurionEquipmentSlots.userId, userId), eq(aurionEquipmentSlots.itemId, item.id), eq(aurionEquipmentSlots.itemRecordVersion, item.version))).for("update"))[0];
    if (!prior || item.status !== "equipped") throw new Error("EQUIPMENT_SLOT_STALE");
    await tx.delete(aurionEquipmentSlots).where(eq(aurionEquipmentSlots.id, prior.id));
    await setStatus(tx, userId, item, "owned");
    return readUi(tx, userId);
  });
}
