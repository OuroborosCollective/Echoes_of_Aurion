import { describe, expect, it } from "vitest";
import { advanceAscension, advanceWeaponMastery, canTrainWeaponTrack, classlessSetBonus, diminishingMasteryPowerBps, itemQualityScoreExact, resolveClasslessLoot } from "./ax1ClasslessItemization";

const zero = { totalXpExact: "0", levelExact: "1", xpIntoLevelExact: "0" } as const;

describe("AIM-246 classless weapon mastery and itemization", () => {
  it("keeps weapon and ascension mastery unbounded with exact decimal state", () => {
    const weapon = advanceWeaponMastery(zero, "100000000000000000000000");
    const ascension = advanceAscension(zero, "100000000000000000000000");
    expect(BigInt(weapon.levelExact)).toBeGreaterThan(50n);
    expect(BigInt(ascension.levelExact)).toBeGreaterThan(50n);
    expect(weapon.totalXpExact).toBe("100000000000000000000000");
  });

  it("never uses starter class as a hard weapon gate", () => {
    expect(canTrainWeaponTrack("blade")).toBe(true);
    expect(canTrainWeaponTrack("arcane")).toBe(true);
    expect(canTrainWeaponTrack("marksmanship")).toBe(true);
    expect(canTrainWeaponTrack("heavy_tech")).toBe(true);
  });

  it("keeps infinite mastery visible while combat power has diminishing returns", () => {
    expect(diminishingMasteryPowerBps("1")).toBeLessThan(diminishingMasteryPowerBps("1000"));
    expect(diminishingMasteryPowerBps("1000000000000000000000")).toBeLessThanOrEqual(12_500);
    expect(itemQualityScoreExact({ itemLevelExact: "999999999999999999", craftMasteryLevelExact: "123456789012345678", ascensionLevelExact: "987654321" })).toMatch(/^[0-9]+$/);
  });

  it("reproduces server-seeded Diablo-style loot and scales source power budget", () => {
    const a = resolveClasslessLoot({ serverSeed: "receipt:abc", source: "dungeon", regionKey: "cinder_vault", progressionLevelExact: "742", magicFind: 20 });
    const b = resolveClasslessLoot({ serverSeed: "receipt:abc", source: "dungeon", regionKey: "cinder_vault", progressionLevelExact: "742", magicFind: 20 });
    expect(a).toEqual(b);
    expect(a.deterministicHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.powerBudgetBps).toBe(13_000);
    expect(BigInt(a.itemLevelExact)).toBeGreaterThanOrEqual(742n);
  });

  it("applies set bonuses without class locking and within the diminishing mastery budget", () => {
    const bonus = classlessSetBonus("asterion_regalia", ["aurion_spear", "asterion_blade"], "500");
    expect(bonus.resonance).toBeGreaterThan(0);
    expect(bonus.guard).toBeGreaterThan(0);
    expect(Object.values(bonus).every(value => value < 20)).toBe(true);
  });
});
