import { describe, expect, it } from "vitest";
import { aurionLootAffixCatalog, aurionLootBaseCatalog, aurionLootCatalogV2, aurionLootSetCatalog } from "./aurionLootCatalog";
import { resolveDeterministicLoot } from "./aurionLootProtocol";

describe("aurionLootCatalogV2", () => {
  it("covers 48 stable base families across equipment and world-content categories", () => {
    expect(aurionLootBaseCatalog).toHaveLength(48);
    expect(new Set(aurionLootBaseCatalog.map(item => item.id)).size).toBe(48);
    expect(new Set(aurionLootBaseCatalog.map(item => item.category))).toEqual(new Set(["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"]));
    expect(aurionLootBaseCatalog.filter(item => item.category === "armor")).toHaveLength(18);
    expect(aurionLootBaseCatalog.filter(item => item.category === "accessory")).toHaveLength(8);
  });

  it("provides 72 stable affix groups and three equipped-piece sets", () => {
    expect(aurionLootAffixCatalog).toHaveLength(72);
    expect(new Set(aurionLootAffixCatalog.map(affix => affix.groupId)).size).toBe(72);
    expect(aurionLootSetCatalog).toHaveLength(3);
    expect(aurionLootSetCatalog.every(set => Object.keys(set.bonusesByPieces).includes("2") && Object.keys(set.bonusesByPieces).includes("3"))).toBe(true);
  });

  it("resolves the same versioned catalog and server-confirmed context identically at high exact level", () => {
    const input = {
      context: {
        worldId: "echoes-of-aurion-global", zoneId: "windhollow", monsterArchetypeId: "ash-sentinel", encounterReceiptId: "encounter-v2-001",
        ruleSetVersion: aurionLootCatalogV2.ruleSetVersion, contentVersion: aurionLootCatalogV2.contentVersion, resolutionIndex: 81,
        playerLevelExact: "1000000", zoneLevelExact: "1000002", monsterLevelExact: "1000005", luckBps: 750, serverSeedDigest: "e".repeat(64),
      },
      baseItems: aurionLootCatalogV2.baseItems,
      affixes: aurionLootCatalogV2.affixes,
      sets: aurionLootCatalogV2.sets,
    };
    expect(resolveDeterministicLoot(input)).toEqual(resolveDeterministicLoot(input));
    expect(resolveDeterministicLoot(input).itemLevelExact).toBe("1000005");
  });
});
