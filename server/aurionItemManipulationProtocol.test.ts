import { describe, expect, it } from "vitest";
import { resolveAurionItemManipulation, type ItemManipulationItem, type ItemManipulationRecipe } from "./aurionItemManipulationProtocol";

const hash = "a".repeat(64);
const source: ItemManipulationItem = {
  id: "loot-item-1", deterministicHash: hash, baseItemDefinitionId: "aurion_blade", category: "weapon", quality: "rare", itemLevelExact: "10", itemPower: 40,
  affixes: [{ id: "old-affix", slot: "prefix", groupId: "old-group", stats: { power: 4 } }], socketCount: 0, durabilityBps: 4_200,
};
const recipe = (operation: ItemManipulationRecipe["operation"], overrides: Partial<ItemManipulationRecipe> = {}): ItemManipulationRecipe => ({
  id: `recipe-${operation}`, version: "catalog-v2", operation, outputItemDefinitionId: "aurion_blade", allowedCategories: ["weapon"], allowedAffixIds: ["affix-z", "affix-a"], maxAffixSlots: 3,
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
    expect(result.output?.affixes.every(affix => ["affix-a", "affix-z"].includes(affix.id))).toBe(true);
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
    expect(() => resolveAurionItemManipulation(request("socket", { recipe: recipe("socket", { maxAffixSlots: 0 }) }))).toThrow("AURION_ITEM_SOCKET_CAP");
  });

  it("returns only the configured salvage yield and binds the source", () => {
    const result = resolveAurionItemManipulation(request("salvage"));
    expect(result.output).toBeUndefined();
    expect(result.salvageYield).toEqual({ scrap: 3 });
    expect(() => resolveAurionItemManipulation(request("salvage", { inputItemHashes: ["b".repeat(64)] }))).toThrow("AURION_ITEM_SOURCE_HASH_MISMATCH");
  });
});
