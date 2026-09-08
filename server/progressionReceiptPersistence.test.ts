import { describe, expect, it } from "vitest";
import { normalizeProgressionReceipt, projectConfirmedProgressionTracks } from "./progressionReceiptPersistence";

const base = {
  userId: 41,
  characterId: "char-41",
  actionKind: "weapon_use" as const,
  weaponTrack: "spear",
  skillId: "combat",
  resultReceiptId: "expedition-result-0001",
  sourceReceiptId: "expedition-result-0001",
  lootReceiptId: null,
  masteryEventId: "mastery-event-0001",
  xpGrantedExact: "1250",
  levelExact: "42",
  ruleSetVersion: "wasd-combat.v3",
  contentVersion: "aurion-content.v12",
  idempotencyKey: "progression-e2e:0001",
};

describe("AIM-236 canonical progression receipts", () => {
  it("binds account, character, action, result, mastery, XP and level deterministically", () => {
    const result = normalizeProgressionReceipt(base);
    expect(result.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.userId).toBe(41);
    expect(result.characterId).toBe("char-41");
  });

  it("rejects missing loot, weapon and skill identities for their action kinds", () => {
    expect(() => normalizeProgressionReceipt({ ...base, actionKind: "loot_claim", lootReceiptId: null })).toThrow("LOOT_RECEIPT_REQUIRED");
    expect(() => normalizeProgressionReceipt({ ...base, actionKind: "weapon_use", weaponTrack: "none" })).toThrow("WEAPON_TRACK_REQUIRED");
    expect(() => normalizeProgressionReceipt({ ...base, actionKind: "skill_use", skillId: "none" })).toThrow("SKILL_ID_REQUIRED");
  });

  it("changes its hash for result, XP, level or source revisions", () => {
    const original = normalizeProgressionReceipt(base);
    for (const change of [
      { resultReceiptId: "expedition-result-0002" },
      { xpGrantedExact: "1251" },
      { levelExact: "43" },
      { ruleSetVersion: "wasd-combat.v4" },
    ]) expect(normalizeProgressionReceipt({ ...base, ...change }).receiptHash).not.toBe(original.receiptHash);
  });

  it("accepts dynamic track identities within MariaDB column bounds and rejects truncation candidates", () => {
    expect(normalizeProgressionReceipt({ ...base, weaponTrack: "greatsword.two_handed.v3", skillId: "chronomancy.temporal_anchor.v17" }).weaponTrack).toBe("greatsword.two_handed.v3");
    expect(() => normalizeProgressionReceipt({ ...base, weaponTrack: "w".repeat(65) })).toThrow();
    expect(() => normalizeProgressionReceipt({ ...base, skillId: "s".repeat(97) })).toThrow();
    expect(() => normalizeProgressionReceipt({ ...base, ruleSetVersion: "r".repeat(97) })).toThrow();
    expect(() => normalizeProgressionReceipt({ ...base, levelExact: "9".repeat(129) })).toThrow();
  });

  it("projects out-of-order dynamic tracks by the greatest confirmed exact level", () => {
    const common = { id: "stored", characterId: "char-41", resultReceiptId: "result", sourceReceiptId: "source", receiptHash: "a".repeat(64) };
    const projected = projectConfirmedProgressionTracks([
      { ...common, id: "late-low", actionKind: "weapon_use", weaponTrack: "greatsword.two_handed.v3", skillId: "none", levelExact: "9", receiptHash: "f".repeat(64) },
      { ...common, id: "early-high", actionKind: "weapon_use", weaponTrack: "greatsword.two_handed.v3", skillId: "none", levelExact: "9007199254740993", receiptHash: "b".repeat(64) },
      { ...common, id: "skill", actionKind: "skill_use", weaponTrack: "none", skillId: "chronomancy.temporal_anchor.v17", levelExact: "17", receiptHash: "c".repeat(64) },
    ]);
    expect(projected.characterId).toBe("char-41");
    expect(projected.tracks).toEqual([
      expect.objectContaining({ trackKind: "skill", trackId: "chronomancy.temporal_anchor.v17", levelExact: "17" }),
      expect.objectContaining({ trackKind: "weapon", trackId: "greatsword.two_handed.v3", levelExact: "9007199254740993" }),
    ]);
  });

  it("fails closed when one account resolves to multiple progression characters", () => {
    const row = { id: "one", actionKind: "skill_use" as const, weaponTrack: "none", skillId: "combat", levelExact: "2", resultReceiptId: "result", sourceReceiptId: "source", receiptHash: "d".repeat(64) };
    expect(() => projectConfirmedProgressionTracks([{ ...row, characterId: "char-a" }, { ...row, id: "two", characterId: "char-b", receiptHash: "e".repeat(64) }])).toThrow("PROGRESSION_CHARACTER_CONFLICT");
  });

});
