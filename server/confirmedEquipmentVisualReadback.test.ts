import { describe, expect, it } from "vitest";
import type { PlayerUiReadback } from "../shared/playerUiProtocol";
import { projectConfirmedEquipmentVisualReadback } from "./confirmedEquipmentVisualReadback";
import { rederiveStoredDeterministicLootHash } from "./aurionVisualItemAdapter";
import type { DeterministicLootResult } from "./aurionLootProtocol";

const contextHash = "a".repeat(64);

function resolved(overrides: Partial<DeterministicLootResult> = {}): DeterministicLootResult {
  const base = {
    itemDefinitionId: "weapon-spear-v2",
    category: "weapon" as const,
    equipmentSlot: "main_hand" as const,
    quality: "normal" as const,
    itemLevelExact: "1",
    affixes: [] as const,
    itemPower: 7,
    contextHash,
    ...overrides,
  };
  const deterministicHash = rederiveStoredDeterministicLootHash(base);
  return Object.freeze({ ...base, deterministicHash });
}

function ui(readback = resolved()): PlayerUiReadback {
  return {
    version: "aurion-ax1-ui.v1",
    userId: 17,
    settings: { revision: 0, autoLoot: true, analyticsConsent: false, hotbar: ["1", "2", "3", "4", "5"] },
    items: [
      { id: "v2-item-00000001", version: "aurion_v2", name: "weapon spear", definition: readback.itemDefinitionId, levelExact: readback.itemLevelExact, quality: readback.quality, slot: "main_hand", status: "equipped", stats: {}, receiptId: "v2-receipt-0001" },
      { id: "legacy-item-0001", version: "legacy", name: "Legacy Helm", definition: "legacy_helm", levelExact: "1", quality: "normal", slot: "head", status: "equipped", stats: {}, receiptId: "legacy-receipt" },
    ],
    equipment: [
      { slot: "main_hand", id: "v2-item-00000001", version: "aurion_v2" },
      { slot: "head", id: "legacy-item-0001", version: "legacy" },
    ],
  };
}

function itemRow(readback = resolved()) {
  return {
    id: "v2-item-00000001",
    ownerUserId: 17,
    lootReceiptId: "v2-receipt-0001",
    baseItemDefinitionId: readback.itemDefinitionId,
    category: readback.category,
    equipmentSlot: readback.equipmentSlot ?? null,
    quality: readback.quality,
    itemLevelExact: readback.itemLevelExact,
    affixesJson: JSON.stringify(readback.affixes),
    setId: readback.setId ?? null,
    itemPower: readback.itemPower,
    deterministicHash: readback.deterministicHash,
    status: "equipped",
  } as any;
}

function receiptRow(readback = resolved()) {
  return {
    id: "v2-receipt-0001",
    userId: 17,
    encounterReceiptId: "encounter-0001",
    itemDefinitionId: readback.itemDefinitionId,
    category: readback.category,
    quality: readback.quality,
    itemLevelExact: readback.itemLevelExact,
    setId: readback.setId ?? null,
    resolvedJson: JSON.stringify(readback),
    contextHash: readback.contextHash,
    deterministicHash: readback.deterministicHash,
    ruleSetVersion: "aurion-loot.v2",
    contentVersion: "aurion-loot-content.v2",
    idempotencyKey: "visual-readback-test",
  } as any;
}

describe("confirmed V2 equipment visual readback", () => {
  it("projects an equipped V2 item from its immutable receipt and keeps legacy explicitly separate", () => {
    const loot = resolved();
    const readback = projectConfirmedEquipmentVisualReadback(ui(loot), [itemRow(loot)], [receiptRow(loot)]);
    expect(readback.version).toBe("aurion-equipment-visuals.v2");
    expect(readback.equipment).toHaveLength(2);
    const v2 = readback.equipment.find(entry => entry.version === "aurion_v2");
    expect(v2?.visualDescriptor).toMatchObject({
      itemDefinitionId: "weapon-spear-v2",
      familyId: "spear",
      category: "weapon",
      equipmentSlot: "main_hand",
      source: { lootReceiptId: "v2-receipt-0001", contextHash, deterministicHash: loot.deterministicHash, visualEventIndex: 0 },
    });
    expect(v2?.visualDescriptor).not.toHaveProperty("itemPower");
    expect(v2?.visualDescriptor).not.toHaveProperty("baseStats");
    const legacy = readback.equipment.find(entry => entry.version === "legacy");
    expect(legacy?.visualDescriptor).toBeNull();
  });

  it("fails closed when item, UI or receipt identity disagrees", () => {
    const loot = resolved();
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [{ ...itemRow(loot), ownerUserId: 99 }], [receiptRow(loot)])).toThrow(/ITEM_MISSING/);
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [{ ...itemRow(loot), lootReceiptId: "wrong-receipt" }], [receiptRow(loot)])).toThrow(/UI_MISMATCH/);
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [{ ...itemRow(loot), quality: "rare" }], [receiptRow(loot)])).toThrow(/UI_MISMATCH/);
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [itemRow(loot)], [{ ...receiptRow(loot), userId: 99 }])).toThrow(/RECEIPT_MISSING/);
  });

  it("rejects independently tampered resolvedJson even when the stored hash field still looks valid", () => {
    const loot = resolved();
    const tampered = { ...loot, itemPower: loot.itemPower + 100 };
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [itemRow(loot)], [{ ...receiptRow(loot), resolvedJson: JSON.stringify(tampered) }])).toThrow(/deterministic hash mismatch/i);
  });

  it("rejects row/receipt affix and deterministic-hash drift", () => {
    const loot = resolved({
      quality: "magic",
      affixes: [{ id: "affix-common-might-v2", slot: "prefix", groupId: "common-might", stats: { power: 3 } }],
      itemPower: 10,
    });
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [{ ...itemRow(loot), affixesJson: "[]" }], [receiptRow(loot)])).toThrow(/AFFIX_MISMATCH/);
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [{ ...itemRow(loot), deterministicHash: "f".repeat(64) }], [receiptRow(loot)])).toThrow(/RECEIPT_MISMATCH/);
  });

  it("rejects duplicate item or receipt identities instead of accepting map overwrite order", () => {
    const loot = resolved();
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [itemRow(loot), itemRow(loot)], [receiptRow(loot)])).toThrow(/ITEM_DUPLICATE/);
    expect(() => projectConfirmedEquipmentVisualReadback(ui(loot), [itemRow(loot)], [receiptRow(loot), receiptRow(loot)])).toThrow(/RECEIPT_DUPLICATE/);
  });
});
