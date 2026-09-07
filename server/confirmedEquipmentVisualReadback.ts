import { and, eq, inArray } from "drizzle-orm";
import { aurionItemInstancesV2, aurionLootDropReceiptsV2 } from "../drizzle/schema";
import {
  CONFIRMED_EQUIPMENT_VISUAL_VERSION,
  confirmedEquipmentVisualReadbackSchema,
  uiEquipmentVisualSlot,
  type ConfirmedEquipmentVisualReadback,
} from "../shared/confirmedEquipmentVisualProtocol";
import { aurionLootBaseCatalog } from "./aurionLootCatalog";
import { parseStoredDeterministicLootResult, projectConfirmedLootToVisualItem } from "./aurionVisualItemAdapter";
import { getDb } from "./db";
import { readPlayerUi } from "./playerUiPersistence";

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson(value: string, code: string): unknown {
  try { return JSON.parse(value); }
  catch { throw new Error(code); }
}

/**
 * Server-only readback. V2 visuals are projected exclusively from immutable loot
 * receipt + item-instance truth. Legacy/AX1 entries remain explicitly compatible
 * and do not receive invented V2 hashes or descriptors.
 */
export async function readConfirmedEquipmentVisuals(userId: number): Promise<ConfirmedEquipmentVisualReadback> {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("EQUIPMENT_VISUAL_USER_INVALID");
  const ui = await readPlayerUi(userId);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const v2Bindings = ui.equipment.filter(binding => binding.version === "aurion_v2");
  const v2Ids = v2Bindings.map(binding => binding.id);
  const v2Rows = v2Ids.length
    ? await db.select().from(aurionItemInstancesV2).where(and(
        eq(aurionItemInstancesV2.ownerUserId, userId),
        eq(aurionItemInstancesV2.status, "equipped"),
        inArray(aurionItemInstancesV2.id, v2Ids),
      ))
    : [];
  const rowsById = new Map(v2Rows.map(row => [row.id, row] as const));
  const receiptIds = v2Rows.map(row => row.lootReceiptId);
  const receipts = receiptIds.length
    ? await db.select().from(aurionLootDropReceiptsV2).where(and(
        eq(aurionLootDropReceiptsV2.userId, userId),
        inArray(aurionLootDropReceiptsV2.id, receiptIds),
      ))
    : [];
  const receiptsById = new Map(receipts.map(receipt => [receipt.id, receipt] as const));
  const uiItems = new Map(ui.items.map(item => [`${item.version}:${item.id}`, item] as const));

  const equipment = ui.equipment.flatMap(binding => {
    const equipmentSlot = uiEquipmentVisualSlot[binding.slot as keyof typeof uiEquipmentVisualSlot] ?? null;
    const uiItem = uiItems.get(`${binding.version}:${binding.id}`);
    if (!equipmentSlot || !uiItem || uiItem.status !== "equipped") return [];

    if (binding.version !== "aurion_v2") {
      return [Object.freeze({
        uiSlot: binding.slot,
        equipmentSlot,
        itemId: binding.id,
        version: binding.version,
        definition: uiItem.definition,
        receiptId: uiItem.receiptId,
        visualDescriptor: null,
      })];
    }

    const row = rowsById.get(binding.id);
    if (!row || row.ownerUserId !== userId || row.status !== "equipped") throw new Error("EQUIPMENT_VISUAL_V2_ITEM_MISSING");
    if (row.lootReceiptId !== uiItem.receiptId || row.baseItemDefinitionId !== uiItem.definition || row.equipmentSlot !== binding.slot || row.quality !== uiItem.quality) {
      throw new Error("EQUIPMENT_VISUAL_V2_UI_MISMATCH");
    }

    const receipt = receiptsById.get(row.lootReceiptId);
    if (!receipt || receipt.userId !== userId || receipt.id !== row.lootReceiptId) throw new Error("EQUIPMENT_VISUAL_V2_RECEIPT_MISSING");
    const resolved = parseStoredDeterministicLootResult(receipt.resolvedJson);
    const definition = aurionLootBaseCatalog.find(candidate => candidate.id === row.baseItemDefinitionId);
    if (!definition) throw new Error("EQUIPMENT_VISUAL_V2_DEFINITION_MISSING");

    if (
      receipt.itemDefinitionId !== resolved.itemDefinitionId
      || receipt.itemDefinitionId !== row.baseItemDefinitionId
      || receipt.category !== resolved.category
      || receipt.category !== row.category
      || receipt.quality !== resolved.quality
      || receipt.quality !== row.quality
      || receipt.itemLevelExact !== resolved.itemLevelExact
      || receipt.itemLevelExact !== row.itemLevelExact
      || (receipt.setId ?? null) !== (resolved.setId ?? null)
      || (receipt.setId ?? null) !== (row.setId ?? null)
      || receipt.contextHash !== resolved.contextHash
      || receipt.deterministicHash !== resolved.deterministicHash
      || row.deterministicHash !== resolved.deterministicHash
      || (resolved.equipmentSlot ?? null) !== (row.equipmentSlot ?? null)
      || resolved.itemPower !== row.itemPower
    ) throw new Error("EQUIPMENT_VISUAL_V2_RECEIPT_MISMATCH");

    const rowAffixes = parseJson(row.affixesJson, "EQUIPMENT_VISUAL_V2_AFFIX_JSON_INVALID");
    if (canonicalJson(rowAffixes) !== canonicalJson(resolved.affixes)) throw new Error("EQUIPMENT_VISUAL_V2_AFFIX_MISMATCH");

    const visualDescriptor = projectConfirmedLootToVisualItem({
      loot: resolved,
      baseDefinition: definition,
      lootReceiptId: receipt.id,
      visualEventIndex: 0,
      visual: null,
    });

    return [Object.freeze({
      uiSlot: binding.slot,
      equipmentSlot,
      itemId: binding.id,
      version: "aurion_v2" as const,
      definition: uiItem.definition,
      receiptId: uiItem.receiptId,
      visualDescriptor,
    })];
  }).sort((left, right) => left.equipmentSlot.localeCompare(right.equipmentSlot) || left.itemId.localeCompare(right.itemId));

  return confirmedEquipmentVisualReadbackSchema.parse({
    version: CONFIRMED_EQUIPMENT_VISUAL_VERSION,
    userId,
    equipment,
  });
}
