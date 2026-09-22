import { describe, expect, it } from "vitest";
import { damageForMcpAction, dungeonCompletionReward, getEncounter, mayEnterDungeon, mcpActionFromCommand, resolveQuestState } from "./gameplayProtocol";

describe("Aurion quest and action protocol", () => {
  it("unlocks the three-step questline in order", () => {
    expect(resolveQuestState({ key: "astral_call", level: 1, completed: [], active: null })).toBe("available");
    expect(resolveQuestState({ key: "archive_of_echoes", level: 2, completed: [], active: null })).toBe("locked");
    expect(resolveQuestState({ key: "archive_of_echoes", level: 2, completed: ["astral_call"], active: null })).toBe("available");
    expect(resolveQuestState({ key: "ember_key", level: 3, completed: ["astral_call", "archive_of_echoes"], active: null })).toBe("available");
  });

  it("opens the first dungeon only with quest and key", () => {
    expect(mayEnterDungeon({ level: 3, completed: ["astral_call", "archive_of_echoes", "ember_key"], keys: ["ember_key"] })).toBe(true);
    expect(mayEnterDungeon({ level: 3, completed: ["astral_call", "archive_of_echoes"], keys: ["ember_key"] })).toBe(false);
  });

  it("normalizes action aliases without accepting prose", () => {
    expect(mcpActionFromCommand("w")).toBe("run");
    expect(mcpActionFromCommand("F")).toBe("attack");
    expect(mcpActionFromCommand("9")).toBe("skill_9");
    expect(mcpActionFromCommand("attack now")).toBeNull();
  });

  it("keeps boss health and damage calculation in the canonical encounter contract", () => {
    expect(getEncounter("asterion")).toMatchObject({ maxBossHp: 112, questKey: "astral_call" });
    expect(getEncounter("cinder_vault")).toMatchObject({ maxBossHp: 258, requiresDungeonKey: "ember_key" });
    expect(damageForMcpAction("run")).toBe(0);
    expect(damageForMcpAction("attack")).toBe(17);
    expect(damageForMcpAction("skill_9")).toBe(43);
  });

  it("defines a concrete final dungeon reward rather than leaving the boss end state empty", () => {
    expect(dungeonCompletionReward).toMatchObject({ xp: 480, points: 90, treasureTier: "first_cinder_vault" });
  });
});
