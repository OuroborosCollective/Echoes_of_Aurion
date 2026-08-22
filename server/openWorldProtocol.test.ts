import { describe, expect, it } from "vitest";
import { buildOpenWorldSnapshot, encounterBudget, maximumVisibleEnemies, zoneForOpenWorldProgress } from "./openWorldProtocol";

describe("open-world protocol", () => {
  it("uses the bounded mobile encounter formulas", () => {
    expect(encounterBudget(1, 0)).toBe(6);
    expect(encounterBudget(50, 3)).toBe(24);
    expect(maximumVisibleEnemies(1)).toBe(10);
    expect(maximumVisibleEnemies(99)).toBe(18);
  });

  it("derives the deepest permitted zone only from confirmed progress", () => {
    expect(zoneForOpenWorldProgress({ level: 1, completed: [], activeQuest: null, canEnterDungeon: false })).toBe("observatory_threshold");
    expect(zoneForOpenWorldProgress({ level: 2, completed: ["astral_call"], activeQuest: null, canEnterDungeon: false })).toBe("windhollow");
    expect(zoneForOpenWorldProgress({ level: 3, completed: ["astral_call", "archive_of_echoes"], activeQuest: "ember_key", canEnterDungeon: false })).toBe("emberfall");
    expect(zoneForOpenWorldProgress({ level: 4, completed: ["astral_call", "archive_of_echoes", "ember_key"], activeQuest: null, canEnterDungeon: true })).toBe("cinder_vault");
  });

  it("returns an immutable display snapshot without reward fields", () => {
    const snapshot = buildOpenWorldSnapshot({ level: 12, completed: ["astral_call"], activeQuest: "archive_of_echoes", canEnterDungeon: false });
    expect(snapshot.zoneId).toBe("windhollow");
    expect(snapshot.encounter.activeCount).toBeLessThanOrEqual(snapshot.encounter.maximumVisible);
    expect(snapshot.allowedCommands).toEqual(["move", "attack", "interact", "return_to_tower"]);
    expect(snapshot.npcs.find(npc => npc.id === "orun")?.memory.quest[0]).toContain("versunkene Halle");
    expect(snapshot.primaryEncounter).toMatchObject({ id: "archive-warden", encounterKey: "archive" });
    expect(JSON.stringify(snapshot)).not.toContain("reward");
  });

  it("exposes only the encounter unlocked by confirmed active quest or dungeon access", () => {
    expect(buildOpenWorldSnapshot({ level: 1, completed: [], activeQuest: null, canEnterDungeon: false }).primaryEncounter).toBeNull();
    expect(buildOpenWorldSnapshot({ level: 3, completed: ["astral_call", "archive_of_echoes", "ember_key"], activeQuest: null, canEnterDungeon: true }).primaryEncounter).toMatchObject({ encounterKey: "cinder_vault" });
  });
});
