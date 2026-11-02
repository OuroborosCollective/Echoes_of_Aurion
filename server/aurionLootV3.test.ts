import { parseStoredDeterministicLootResult } from "./aurionVisualItemAdapter";
import { describe, it, expect } from "vitest";
import { aurionLootCatalogV2, aurionLootCatalogV3 } from "./aurionLootCatalog";
import { resolveDeterministicLoot, validateLootCatalogV3, aurionItemCategories } from "./aurionLootProtocol";
const context = (index = 0) => ({ worldId: "echoes-of-aurion-global", zoneId: "windhollow", monsterArchetypeId: "ash-sentinel", encounterReceiptId: `v3-cause-${index}`, ruleSetVersion: aurionLootCatalogV3.ruleSetVersion, contentVersion: aurionLootCatalogV3.contentVersion, resolutionIndex: index, playerLevelExact: "100", zoneLevelExact: "100", monsterLevelExact: "100", luckBps: 400, serverSeedDigest: "f".repeat(64) });
const resolve = (index = 0) => resolveDeterministicLoot({ ...aurionLootCatalogV3, context: context(index) });
describe("canonical loot V3", () => {
  it("replays all reward categories with exact bounded effects and explicit source provenance", () => {
    const categories = new Set<string>();
    for (let index = 0; index < 600; index++) {
      const item = resolve(index);
      expect(resolve(index)).toEqual(item);
      categories.add(item.category);
      expect(item.contract?.source.encounterReceiptId).toBe(context(index).encounterReceiptId);
      expect(item.affixes.length).toBe(item.contract?.variantParameters.affixBudget);
      expect(item.itemPower).toBeLessThanOrEqual(2147483647);
      if (item.quality === "set") expect(item.setId).toBeDefined();
    }
    expect(categories).toEqual(new Set(aurionItemCategories));
  });
  it("is invariant to catalog and tag traversal but binds actual gameplay content", () => {
    const first = resolve();
    const shuffled = { baseItems: [...aurionLootCatalogV3.baseItems].reverse().map(base => ({ ...base, tags: [...base.tags].reverse(), affixSlots: [...base.affixSlots].reverse() })), affixes: [...aurionLootCatalogV3.affixes].reverse(), sets: [...aurionLootCatalogV3.sets].reverse() };
    expect(resolveDeterministicLoot({ ...shuffled, context: context() })).toEqual(first);
    const changed = { ...shuffled, baseItems: shuffled.baseItems.map(base => ({ ...base, effectTags: ["heat"] })) };
    const result = resolveDeterministicLoot({ ...changed, context: context() });
    expect(result.deterministicHash).not.toBe(first.deterministicHash);
    expect(result.contract?.effects.tags).toEqual(["heat"]);
    expect(result).not.toHaveProperty("visualIdentity");
  });
  it("verifies V3 gameplay provenance before visual projection and rejects tampered effects", () => {
    const item = resolve();
    expect(parseStoredDeterministicLootResult(JSON.stringify(item))).toEqual(item);
    const tampered = JSON.parse(JSON.stringify(item));
    tampered.contract.effects.tags.push("unearned-heat");
    expect(() => parseStoredDeterministicLootResult(JSON.stringify(tampered))).toThrow(/hash mismatch/);
  });
  it("validates even unselected content and fails closed on taxonomy, ranges, references and bounds", () => {
    for (const patch of [{ category: "utility" }, { equipmentSlot: "feet" }, { baseStats: { power: Infinity } }, { minItemLevelExact: "5", maxItemLevelExact: "2" }]) {
      expect(() => validateLootCatalogV3({ ...aurionLootCatalogV3, baseItems: [{ ...aurionLootCatalogV3.baseItems[0], ...patch }] } as any)).toThrow();
    }
    expect(() => validateLootCatalogV3({ ...aurionLootCatalogV3, sets: [{ id: "bad", pieceBaseItemIds: ["unknown"], bonusesByPieces: {} }] })).toThrow(/REFERENCE/);
    expect(() => validateLootCatalogV3({ ...aurionLootCatalogV3, affixes: Array(2049).fill(aurionLootCatalogV3.affixes[0]) })).toThrow(/BOUND/);
    expect(() => resolveDeterministicLoot({ ...aurionLootCatalogV3, context: { ...context(), encounterReceiptId: "" } })).toThrow();
    expect(aurionLootCatalogV2.ruleSetVersion).toBe("aurion-loot.v2");
  });
});
