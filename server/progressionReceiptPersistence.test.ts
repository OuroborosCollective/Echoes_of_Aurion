import { describe, expect, it } from "vitest";
import { normalizeProgressionReceipt } from "./progressionReceiptPersistence";

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
});
