import { aurionLootCatalogV2 } from "./aurionLootCatalog";
import { describe, expect, it } from "vitest";
import { resolveAurionItemManipulation, type ItemManipulationItem, type ItemManipulationRecipe } from "./aurionItemManipulationProtocol";

const hash = "a".repeat(64);
const source: ItemManipulationItem = {
  id: "loot-item-1", deterministicHash: hash, baseItemDefinitionId: "weapon-blade-v2", category: "weapon", quality: "rare", itemLevelExact: "10", itemPower: 40,
  affixes: [{ id: "affix-common-might-v2", slot: "prefix", groupId: "common-might", stats: { power: 4 } }], socketCount: 0, durabilityBps: 4_200,
};
const recipe = (operation: ItemManipulationRecipe["operation"], overrides: Partial<ItemManipulationRecipe> = {}): ItemManipulationRecipe => ({
  id: `recipe-${operation}`, version: "catalog-v2", operation, outputItemDefinitionId: "weapon-blade-v2", allowedCategories: ["weapon"], allowedAffixIds: ["affix-common-warding-v2", "affix-common-might-v2"], maxAffixSlots: 3,
  requiredCapability: "forge", materialRequirements: { ember: 2 }, salvageYield: { scrap: 3 }, ...overrides,
});
const request = (operation: ItemManipulationRecipe["operation"], overrides: Partial<Parameters<typeof resolveAurionItemManipulation>[0]> = {}) => ({
  operation, receiptId: "crafting-receipt-1", inputItemHashes: operation === "craft" ? [] : [hash], recipe: recipe(operation), sourceItem: operation === "craft" ? undefined : source,
  materials: { ember: 2 }, stationCapability: "forge", operationIndex: 7, ...overrides,
});

describe("Aurion item manipulation contract", () => {
  it("replays identical craft inputs byte-for-byte", () => {
    const first = resolveAurionItemManipulation(request("craft"));
    expect(resolveAurionItemManipulation(request("craft"))).toEqual(first);
    expect(first.output?.deterministicHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sourceEvidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("binds rolls to receipt, input hashes, recipe version and operation index", () => {
    const base = resolveAurionItemManipulation(request("reforge"));
    expect(resolveAurionItemManipulation(request("reforge", { operationIndex: 8 })).deterministicHash).not.toBe(base.deterministicHash);
    expect(resolveAurionItemManipulation(request("reforge", { receiptId: "crafting-receipt-2" })).deterministicHash).not.toBe(base.deterministicHash);
    expect(resolveAurionItemManipulation(request("reforge", { recipe: recipe("reforge", { version: "catalog-v3" }) })).deterministicHash).not.toBe(base.deterministicHash);
  });

  it("keeps reforge results inside the recipe affix pool", () => {
    const result = resolveAurionItemManipulation(request("reforge"));
    expect(result.output?.affixes.every(affix => ["affix-common-might-v2", "affix-common-warding-v2"].includes(affix.id))).toBe(true);
  });

  it("fails closed before producing an output when materials are insufficient", () => {
    expect(() => resolveAurionItemManipulation(request("upgrade", { materials: { ember: 1 } }))).toThrow("AURION_ITEM_INSUFFICIENT_MATERIALS");
    expect(() => resolveAurionItemManipulation(request("craft", { materials: { ember: 2, dust: 1 } }))).toThrow("AURION_ITEM_UNEXPECTED_MATERIAL");
  });

  it("supports upgrade, socket and repair with explicit caps", () => {
    const upgraded = resolveAurionItemManipulation(request("upgrade"));
    expect(upgraded.output?.itemLevelExact).toBe("11");
    const socketed = resolveAurionItemManipulation(request("socket", { recipe: recipe("socket", { maxAffixSlots: 1 }) }));
    expect(socketed.output?.socketCount).toBe(1);
    expect(resolveAurionItemManipulation(request("repair")).output?.durabilityBps).toBe(10_000);
    expect(() => resolveAurionItemManipulation(request("socket", { recipe: recipe("socket", { maxAffixSlots: 0 }), sourceItem: { ...source, affixes: [] } }))).toThrow("AURION_ITEM_SOCKET_CAP");
  });

  it("returns material identities and rejects full-durability repairs", () => {
    const materialItemHashes = ["b".repeat(64)];
    expect(resolveAurionItemManipulation(request("craft", { materialItemHashes })).consumedItemHashes).toEqual(materialItemHashes);
    expect(() => resolveAurionItemManipulation(request("repair", { sourceItem: { ...source, durabilityBps: 10000 } }))).toThrow("AURION_ITEM_REPAIR_NOT_REQUIRED");
  });

  it("returns only the configured salvage yield and binds the source", () => {
    const result = resolveAurionItemManipulation(request("salvage"));
    expect(result.output).toBeUndefined();
    expect(result.salvageYield).toEqual({ scrap: 3 });
    expect(() => resolveAurionItemManipulation(request("salvage", { inputItemHashes: ["b".repeat(64)] }))).toThrow("AURION_ITEM_SOURCE_HASH_MISMATCH");
  });
  it("uses Loot V2 ranges and groups for 256 reforge causes and canonical catalog order", () => {
    for (let operationIndex = 0; operationIndex < 256; operationIndex++) {
      const result = resolveAurionItemManipulation(request("reforge", { operationIndex }));
      for (const affix of result.output!.affixes) {
        const definition = aurionLootCatalogV2.affixes.find(d => d.id === affix.id)!;
        expect(affix.groupId).toBe(definition.groupId);
        expect(affix.slot).toBe(definition.slot);
        for (const [stat, range] of Object.entries(definition.statRanges)) expect(affix.stats[stat]).toBeGreaterThanOrEqual(range.min);
        for (const [stat, range] of Object.entries(definition.statRanges)) expect(affix.stats[stat]).toBeLessThanOrEqual(range.max);
      }
      const reversed = recipe("reforge", { allowedAffixIds: [...recipe("reforge").allowedAffixIds].reverse() });
      expect(resolveAurionItemManipulation(request("reforge", { operationIndex, recipe: reversed })).output).toEqual(result.output);
    }
  });

  it("rejects forged definitions, stats, malformed state, level overflow and full slots", () => {
    expect(() => resolveAurionItemManipulation(request("craft", { recipe: recipe("craft", { outputItemDefinitionId: "forged" }) }))).toThrow("AURION_ITEM_DEFINITION_INVALID");
    expect(() => resolveAurionItemManipulation(request("repair", { sourceItem: { ...source, affixes: [{ ...source.affixes[0]!, stats: { power: 999 } }] } }))).toThrow("AURION_ITEM_RETAINED_STAT_INVALID");
    expect(() => resolveAurionItemManipulation(request("upgrade", { recipe: recipe("upgrade", { maxItemLevelExact: "10" }) }))).toThrow("AURION_ITEM_LEVEL_CAP");
    expect(() => resolveAurionItemManipulation(request("socket", { sourceItem: { ...source, socketCount: -1 } }))).toThrow("AURION_ITEM_SOURCE_STATE_INVALID");
    expect(() => resolveAurionItemManipulation(request("augment", { recipe: recipe("augment", { maxAffixSlots: 1 }) }))).toThrow("AURION_ITEM_AFFIX_SLOTS_FULL");
  });

  it("binds confirmed material hashes and shapes only to a catalog-approved base", () => {
    const first = resolveAurionItemManipulation(request("craft", { materialItemHashes: [hash] }));
    expect(resolveAurionItemManipulation(request("craft", { materialItemHashes: ["b".repeat(64)] })).output?.deterministicHash).not.toBe(first.output?.deterministicHash);
    expect(resolveAurionItemManipulation(request("shaping", { recipe: recipe("shaping", { outputItemDefinitionId: "weapon-spear-v2" }) })).output?.baseItemDefinitionId).toBe("weapon-spear-v2");
  });

});
