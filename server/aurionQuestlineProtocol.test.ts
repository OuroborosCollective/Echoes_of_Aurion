import { describe, expect, it } from "vitest";
import { aurionFactionStories, getFactionStory, getQuestlineNode, getWarfrontBosses, resolveQuestDecision, resolveQuestline, resolveQuestObjective } from "./aurionQuestlineProtocol";

const base = {
  playerId: "player-quest-001",
  faction: "sunward_concord" as const,
  completedQuestIds: ["concord.gate-seal", "concord.oath"],
  decisions: [],
  resolutionIndex: 12,
};

describe("aurion questline protocol", () => {
  it("replays the same questline readmodel deterministically", () => {
    const input = { ...base, approachScores: { craft: 9, combat: 2, trade: 4 } };
    expect(resolveQuestline(input)).toEqual(resolveQuestline(input));
    expect(resolveQuestline(input).preferredApproach).toBe("craft");
    expect(resolveQuestline(input).availableMainQuestIds).toEqual(["concord.mainline"]);
    expect(resolveQuestline(input).availableSideQuestIds).toEqual(["concord.side-ledger", "concord.supply"]);
  });

  it("uses a stable tie-break and exposes the selected authored objective", () => {
    const readmodel = resolveQuestline({ ...base, approachScores: { combat: 5, craft: 5, espionage: 5 } });
    expect(readmodel.preferredApproach).toBe("craft");
    expect(resolveQuestObjective("concord.mainline", "craft")).toMatch(/Tor fertig/);
    expect(resolveQuestObjective("concord.mainline", "combat")).toMatch(/Baustelle/);
  });

  it("keeps faction routes isolated and supports the neutral oath route", () => {
    const neutral = resolveQuestline({ ...base, faction: "free_haven", completedQuestIds: ["free_haven.oath"], approachScores: { espionage: 8 } });
    expect(neutral.faction).toBe("free_haven");
    expect(neutral.availableMainQuestIds).toEqual(["free_haven.mainline"]);
    expect(neutral.oathStatus).toBe("pledged");
    expect(neutral.route).toContain("free_haven.mainline");
    expect(neutral.route.some(id => id.startsWith("concord."))).toBe(false);
  });

  it("rejects unauthored decisions and binds valid decisions to a receipt", () => {
    expect(() => resolveQuestDecision({ playerId: "p", nodeId: "concord.mainline", decisionKey: "teleport", approach: "craft", receiptId: "r-1", resolutionIndex: 1 })).toThrow(/not authored/);
    expect(resolveQuestDecision({ playerId: "p", nodeId: "concord.mainline", decisionKey: "fortify", approach: "craft", receiptId: "receipt-7", resolutionIndex: 3 })).toMatchObject({ questId: "concord.mainline", key: "fortify", approach: "craft", receiptId: "receipt-7" });
  });

  it("keeps one authored human story for every faction with a hidden personal truth", () => {
    expect(aurionFactionStories).toHaveLength(5);
    for (const faction of ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"] as const) {
      const story = getFactionStory(faction);
      expect(story.faction).toBe(faction);
      expect(story.protagonist.length).toBeGreaterThan(8);
      expect(story.privateWound.length).toBeGreaterThan(24);
      expect(story.humanTruth.length).toBeGreaterThan(24);
      expect(story.coreQuestline.length).toBeGreaterThan(24);
      expect(story.signatureMotifs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("converges every faction on exactly one authored Warfront boss", () => {
    const bosses = getWarfrontBosses();
    expect(bosses).toHaveLength(5);
    expect(new Set(bosses.map(row => row.faction)).size).toBe(5);
    expect(bosses.map(row => row.bossKey)).toEqual(["boss.the_oathless", "boss.bannerbreaker", "boss.wallheart_colossus", "boss.mother_of_masks", "boss.stormwalker"]);
    expect(getQuestlineNode("warfront.free_haven").kind).toBe("warfront");
  });
});
