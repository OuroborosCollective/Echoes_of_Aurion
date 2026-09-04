import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AURION_AX1_CONTENT_SOURCE_REVISION, AURION_AX1_CONTENT_VERSION, aurionAx1ContentDigest, validateAurionAx1ContentCatalog } from "./aurionAx1ContentCatalog";

const catalog = validateAurionAx1ContentCatalog(JSON.parse(readFileSync("shared/aurionAx1ContentCatalog.json", "utf8")));

describe("AIM-267 final -ax1 content catalog", () => {
  it("pins a deterministic definitions-only catalog", () => {
    expect(catalog.contentVersion).toBe(AURION_AX1_CONTENT_VERSION);
    expect(catalog.source[1]).toBe(AURION_AX1_CONTENT_SOURCE_REVISION);
    expect(catalog.authority).toEqual({ definitionsOnly: true, liveState: false, progressionCap: null, mutation: "wasd_aurion_receipts" });
    expect(aurionAx1ContentDigest(catalog)).toBe(catalog.catalogSha256);
  });

  it("normalizes all professions as cap-free scoped mastery", () => {
    expect(catalog.professions).toHaveLength(14);
    expect(catalog.professions.filter(entry => entry.category === "crafting")).toHaveLength(6);
    expect(catalog.professions.filter(entry => entry.category === "gathering")).toHaveLength(6);
    expect(catalog.professions.filter(entry => entry.category === "civic")).toHaveLength(2);
    expect(catalog.professions.find(entry => entry.sourceId === "enchanter")).toMatchObject({ id: "enchanting", category: "crafting", unbounded: true });
    const serialized = JSON.stringify(catalog);
    for (const key of ['"level":', '"xp":', '"maxXp":', '"unlocked":']) expect(serialized).not.toContain(key);
  });

  it("binds activities and recipes to coupled exact mastery scopes", () => {
    expect(catalog.activities).toHaveLength(9);
    expect(catalog.recipes).toHaveLength(11);
    expect(catalog.recipes.filter(entry => entry.professionId === "carpentry")).toHaveLength(5);
    expect(catalog.activities.find(entry => entry.id === "extract_aether_essence")).toMatchObject({ professionId: "enchanting", kind: "process" });
    for (const activity of catalog.activities) expect(activity.mastery.map(key => key[0])).toEqual(["profession", activity.kind === "gather" ? "gathering" : "action", "item"]);
    for (const recipe of catalog.recipes) expect(recipe.mastery.map(key => key[0])).toEqual(["profession", "recipe", "item"]);
  });

  it("keeps dungeon requirements capability-based and all live rewards server-owned", () => {
    expect(catalog.dungeons).toHaveLength(4);
    for (const dungeon of catalog.dungeons) {
      expect(dungeon.classLocked).toBe(false);
      expect(dungeon.partyCapabilities).toEqual([1, 1, 3]);
    }
  });

  it("includes the complete lore, boss, homestead and guild-building definitions without demo live state", () => {
    expect(catalog.lore.chapters).toHaveLength(4);
    expect(catalog.lore.entries).toHaveLength(4);
    expect(catalog.worldBosses).toHaveLength(4);
    expect(catalog.homesteadBlueprints).toHaveLength(4);
    expect(catalog.guildBuildingBlueprints).toHaveLength(6);
    const serialized = JSON.stringify(catalog);
    for (const key of ["lastDefeatedTimestamp", "lastSlayerName", "defeatCount", '"status":', '"treasuryGold":', '"isOnline":']) expect(serialized).not.toContain(key);
  });
});
