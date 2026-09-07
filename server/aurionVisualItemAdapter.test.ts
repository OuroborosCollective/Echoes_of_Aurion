import { describe, expect, it } from "vitest";
import { visualAffixSlots, visualEquipmentSlots, visualItemCategories, visualItemDescriptorSchema, visualItemQualities, type CanonicalVisualMetadata } from "../shared/visualItemProtocol";
import { aurionLootBaseCatalog } from "./aurionLootCatalog";
import { aurionAffixSlots, aurionEquipmentSlots, aurionItemCategories, aurionLootQualities, type DeterministicLootResult, type LootBaseDefinition } from "./aurionLootProtocol";
import { projectConfirmedLootToVisualItem } from "./aurionVisualItemAdapter";

const hash = (value: number) => value.toString(16).padStart(64, "0");
const base = aurionLootBaseCatalog.find(definition => definition.id === "weapon-spear-v2")!;

function lootFor(definition: LootBaseDefinition, index = 1): DeterministicLootResult {
  return Object.freeze({
    itemDefinitionId: definition.id,
    category: definition.category,
    equipmentSlot: definition.equipmentSlot,
    quality: "rare",
    itemLevelExact: "42",
    affixes: Object.freeze([
      Object.freeze({ id: "affix-refined-reach-v2", slot: "suffix", groupId: "refined-reach", stats: Object.freeze({ reach: 6 }) }),
      Object.freeze({ id: "affix-common-might-v2", slot: "prefix", groupId: "common-might", stats: Object.freeze({ power: 3 }) }),
    ]),
    itemPower: 26,
    contextHash: hash(index),
    deterministicHash: hash(index + 100),
  });
}

const confirmedVisual: CanonicalVisualMetadata = Object.freeze({
  itemDefinitionId: base.id,
  materialId: "star_iron",
  appearanceId: "spear_starforged_03",
  materialVariant: "star_iron_polished",
  variantTheme: "starforged",
  glbAssetId: null,
});

describe("aurionVisualItemAdapter", () => {
  it("stays source-parity aligned with the current Aurion V2 taxonomy", () => {
    expect(visualItemCategories).toEqual(aurionItemCategories);
    expect(visualEquipmentSlots).toEqual(aurionEquipmentSlots);
    expect(visualItemQualities).toEqual(aurionLootQualities);
    expect(visualAffixSlots).toEqual(aurionAffixSlots);
  });

  it("projects every current base definition without inventing gameplay fields", () => {
    for (const [index, definition] of aurionLootBaseCatalog.entries()) {
      const descriptor = projectConfirmedLootToVisualItem({
        loot: lootFor(definition, index + 1),
        baseDefinition: definition,
        lootReceiptId: `visual-receipt-${String(index + 1).padStart(3, "0")}`,
      });
      expect(descriptor.itemDefinitionId).toBe(definition.id);
      expect(descriptor.familyId).toBe(definition.familyId);
      expect(descriptor.category).toBe(definition.category);
      expect(descriptor.equipmentSlot).toBe(definition.equipmentSlot ?? null);
      expect(descriptor).not.toHaveProperty("itemPower");
      expect(descriptor).not.toHaveProperty("itemLevelExact");
      expect(descriptor).not.toHaveProperty("baseStats");
      expect(descriptor.affixes.every(affix => !("stats" in affix))).toBe(true);
    }
  });

  it("binds a deterministic visual seed to confirmed hash, receipt and explicit visual event index", () => {
    const loot = lootFor(base, 77);
    const first = projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: "loot-receipt-77", visualEventIndex: 2, visual: confirmedVisual });
    const replay = projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: "loot-receipt-77", visualEventIndex: 2, visual: confirmedVisual });
    const nextEvent = projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: "loot-receipt-77", visualEventIndex: 3, visual: confirmedVisual });
    const nextReceipt = projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: "loot-receipt-78", visualEventIndex: 2, visual: confirmedVisual });

    expect(replay).toEqual(first);
    expect(replay.visualSeed).toBe(first.visualSeed);
    expect(nextEvent.visualSeed).not.toBe(first.visualSeed);
    expect(nextReceipt.visualSeed).not.toBe(first.visualSeed);
    expect(first.visual).toEqual(confirmedVisual);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.affixes)).toBe(true);
    expect(Object.isFrozen(first.source)).toBe(true);
  });

  it("fails closed when confirmed loot, catalog identity or canonical visual metadata disagree", () => {
    const loot = lootFor(base, 9);
    expect(() => projectConfirmedLootToVisualItem({ loot, baseDefinition: { ...base, id: "weapon-other-v2" }, lootReceiptId: "receipt-9" })).toThrow(/base definition/i);
    expect(() => projectConfirmedLootToVisualItem({ loot: { ...loot, category: "armor" }, baseDefinition: base, lootReceiptId: "receipt-9" })).toThrow(/category/i);
    expect(() => projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: " receipt-9 " })).toThrow(/canonical loot receipt/i);
    expect(() => projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: "receipt-9", visualEventIndex: Number.NaN })).toThrow(/safe integer/i);
    expect(() => projectConfirmedLootToVisualItem({ loot, baseDefinition: base, lootReceiptId: "receipt-9", visual: { ...confirmedVisual, itemDefinitionId: "weapon-axe-v2" } })).toThrow(/visual metadata/i);
  });

  it("keeps the descriptor schema strict so gameplay authority cannot be smuggled into the visual contract", () => {
    const descriptor = projectConfirmedLootToVisualItem({ loot: lootFor(base, 12), baseDefinition: base, lootReceiptId: "receipt-12" });
    expect(() => visualItemDescriptorSchema.parse({ ...descriptor, itemPower: 999 })).toThrow();
    expect(() => visualItemDescriptorSchema.parse({ ...descriptor, baseStats: { power: 999 } })).toThrow();
    expect(() => visualItemDescriptorSchema.parse({ ...descriptor, affixes: [{ ...descriptor.affixes[0], stats: { power: 999 } }] })).toThrow();
  });
});
