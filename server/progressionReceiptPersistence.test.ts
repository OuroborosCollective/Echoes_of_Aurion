import { describe, expect, it } from "vitest";
import { normalizeProgressionReceipt, projectConfirmedProgressionTracks, type ProgressionReceiptInput } from "./progressionReceiptPersistence";

const base: ProgressionReceiptInput = {
  userId: 41,
  characterId: "char-41",
  actionKind: "weapon_use",
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

function stored(overrides: Partial<ProgressionReceiptInput> = {}) {
  const normalized = normalizeProgressionReceipt({ ...base, ...overrides });
  return { id: `progression_${normalized.receiptHash.slice(0, 52)}`, ...normalized };
}

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
    const projected = projectConfirmedProgressionTracks([
      stored({ weaponTrack: "greatsword.two_handed.v3", skillId: "none", levelExact: "9", idempotencyKey: "projection:weapon:low" }),
      stored({ weaponTrack: "greatsword.two_handed.v3", skillId: "none", levelExact: "9007199254740993", idempotencyKey: "projection:weapon:high" }),
      stored({ actionKind: "skill_use", weaponTrack: "none", skillId: "chronomancy.temporal_anchor.v17", levelExact: "17", idempotencyKey: "projection:skill:17" }),
    ]);
    expect(projected.characterId).toBe("char-41");
    expect(projected.tracks).toEqual([
      expect.objectContaining({ trackKind: "skill", trackId: "chronomancy.temporal_anchor.v17", levelExact: "17" }),
      expect.objectContaining({ trackKind: "weapon", trackId: "greatsword.two_handed.v3", levelExact: "9007199254740993" }),
    ]);
  });

  it("rejects a stored row whose hashed bytes were modified after persistence", () => {
    const valid = stored({ actionKind: "skill_use", weaponTrack: "none", skillId: "combat", idempotencyKey: "projection:tamper" });
    expect(() => projectConfirmedProgressionTracks([{ ...valid, levelExact: "43" }])).toThrow("PROGRESSION_RECEIPT_CORRUPT");
  });

  it("fails closed when one account resolves to multiple valid progression characters", () => {
    expect(() => projectConfirmedProgressionTracks([
      stored({ characterId: "char-a", actionKind: "skill_use", weaponTrack: "none", skillId: "combat", idempotencyKey: "projection:char:a" }),
      stored({ characterId: "char-b", actionKind: "skill_use", weaponTrack: "none", skillId: "combat", idempotencyKey: "projection:char:b" }),
    ])).toThrow("PROGRESSION_CHARACTER_CONFLICT");
  });
});
