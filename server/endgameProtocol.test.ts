import { describe, expect, it } from "vitest";
import { canChooseClass, canUseWeaponWithClass, CLASS_UNLOCK_LEVEL, isServerEvidenceDigest, isWeaponActionAllowed, levelFromTotalXp, resolveLoot, rollLootQuality, setBonusForOwnedPieces, xpRequiredForNextLevel } from "./endgameProtocol";

describe("endgame protocol", () => {
  it("keeps the XP requirement monotone through the class unlock", () => {
    expect(xpRequiredForNextLevel(35)).toBe(5630);
    expect(xpRequiredForNextLevel(CLASS_UNLOCK_LEVEL)).toBe(5932);
    expect(xpRequiredForNextLevel(36)).toBeGreaterThan(xpRequiredForNextLevel(35));
  });

  it("allows exactly one class selection only at the server unlock level", () => {
    expect(canChooseClass(35, "unbound")).toBe(false);
    expect(canChooseClass(36, "unbound")).toBe(true);
    expect(canChooseClass(36, "seer")).toBe(false);
  });

  it("maps only a bounded server roll to deterministic loot tiers", () => {
    expect(rollLootQuality(0)).toBe("unique");
    expect(rollLootQuality(9999)).toBe("normal");
    expect(rollLootQuality(20, 0)).toBe("set");
    expect(() => rollLootQuality(-1)).toThrow("Loot roll");
  });

  it("never decreases derived level as confirmed XP grows", () => {
    expect(levelFromTotalXp(0)).toBe(1);
    expect(levelFromTotalXp(10_000)).toBeGreaterThanOrEqual(levelFromTotalXp(5_000));
  });

  it("resolves server-owned treasure entries and affixes rather than accepting a browser payload", () => {
    const loot = resolveLoot("asterion_t2_weapons", 200, 31, 0);
    expect(["aurion_spear", "asterion_blade", "archive_staff", "warden_focus"]).toContain(loot.baseItemKey);
    expect(loot.affixes.every(affix => affix.slot === "prefix" || affix.slot === "suffix")).toBe(true);
  });

  it("keeps the archive and solarium treasure pools bounded to their canonical bases", () => {
    expect(["archive_staff", "warden_focus", "asterion_blade"]).toContain(resolveLoot("archive_t3_weapons", 200, 31, 0).baseItemKey);
    expect(["solarium_blade", "sunspike_spear", "ember_focus"]).toContain(resolveLoot("solarium_t4_weapons", 200, 31, 0).baseItemKey);
  });

  it("calculates a set bonus only when enough owned pieces are present", () => {
    expect(setBonusForOwnedPieces("asterion_regalia", ["aurion_spear"])).toEqual({});
    expect(setBonusForOwnedPieces("asterion_regalia", ["aurion_spear", "asterion_blade"])).toMatchObject({ resonance: 6, guard: 4 });
    expect(setBonusForOwnedPieces("archive_vigil", ["archive_staff", "warden_focus", "ember_focus"])).toMatchObject({ resonance: 12, guard: 8, echoPower: 6 });
  });

  it("enforces class weapon boundaries after specialization", () => {
    expect(canUseWeaponWithClass("vanguard", "spear")).toBe(true);
    expect(canUseWeaponWithClass("vanguard", "staff")).toBe(false);
    expect(canUseWeaponWithClass("unbound", "staff")).toBe(true);
  });

  it("accepts only digest-shaped server evidence for expedition reward authority", () => {
    expect(isServerEvidenceDigest("a".repeat(64))).toBe(true);
    expect(isServerEvidenceDigest("A".repeat(64))).toBe(true);
    expect(isServerEvidenceDigest("not-a-server-result")).toBe(false);
    expect(isServerEvidenceDigest("a".repeat(63))).toBe(false);
  });

  it("allows only canonical actions from the equipped weapon track", () => {
    expect(isWeaponActionAllowed("blade", "cleave")).toBe(true);
    expect(isWeaponActionAllowed("blade", "bolt")).toBe(false);
    expect(isWeaponActionAllowed("focus", "surge")).toBe(true);
  });
});
