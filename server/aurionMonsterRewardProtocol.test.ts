import { describe, expect, it } from "vitest";
import { aurionMonsterSpecies } from "./aurionMonsterSpeciesCatalog";
import { buildAurionMonsterVictoryReward, verifyAurionMonsterVictoryReward } from "./aurionMonsterRewardProtocol";
import { levelFromTotalXp, xpRequiredForNextLevel } from "./endgameProtocol";
import { advanceExactSkillProgression } from "./wasdAurionSkillProgressionProtocol";

const input = (speciesId: string, monsterLevel: number, playerLevel = monsterLevel, weaponTrack: "blade" | "staff" | "spear" | "focus" | null = "blade") => ({
  receiptId: "combat-receipt-0123456789abcdef0123456789abcdef",
  userId: 17, speciesId, monsterLevel, playerLevel, weaponTrack,
});

describe("Aurion confirmed monster victory reward curve", () => {
  it("matches independent Wolfram 2026-10-15 integer calculations for normal, boss and level-gap examples", () => {
    const scenarios = [
      ["monster_big_birb",3,3,28,15,9],
      ["monster_blob_cat",5,5,29,15,10],
      ["monster_flying_dragon_evolved",22,22,1194,656,417],
      ["monster_big_bluedemon",22,22,1356,745,474],
      ["monster_big_birb",3,20,4,2,1],
    ] as const;
    for (const [speciesId, monsterLevel, playerLevel, characterXp, weaponXp, combatSkillXp] of scenarios) {
      expect(buildAurionMonsterVictoryReward(input(speciesId, monsterLevel, playerLevel)))
        .toMatchObject({ speciesId, monsterLevel, playerLevel, characterXp, weaponXp, combatSkillXp, combatSkillId: "combat", weaponTrack: "blade" });
    }
  });
  it("resolves every one of the 49 distinct monsters across its authored level band, without arithmetic regression", () => {
    expect(aurionMonsterSpecies).toHaveLength(49);
    for (const species of aurionMonsterSpecies) {
      let priorXp = -1;
      for (let level=species.levelMin; level<=species.levelMax; level++) {
        const plan=buildAurionMonsterVictoryReward(input(species.speciesId,level));
        expect(plan.characterXp).toBeGreaterThanOrEqual(priorXp);
        expect(Number.isSafeInteger(plan.characterXp)).toBe(true);
        expect(plan.combatSkillXp).toBeGreaterThan(0);
        expect(plan.family).toBe(species.family);
        expect(plan.assetSha256).toBe(species.assetSha256);
        expect(verifyAurionMonsterVictoryReward(plan)).toEqual(plan);
        expect(plan.rewardHash).toMatch(/^[a-f0-9]{64}$/);
        priorXp = plan.characterXp;
      }
    }
  });
  it("credits only the equipped weapon, never gives unarmed phantom mastery, and penalizes trivial kills", () => {
    const equipped=buildAurionMonsterVictoryReward(input("monster_big_birb",3,3,"spear"));
    const unarmed=buildAurionMonsterVictoryReward(input("monster_big_birb",3,3,null));
    expect(equipped.weaponTrack).toBe("spear");
    expect(equipped.weaponXp).toBe(15);
    expect(unarmed.weaponTrack).toBeNull();
    expect(unarmed.weaponXp).toBe(0);
    expect(unarmed.characterXp).toBe(equipped.characterXp);
    const overleveled=buildAurionMonsterVictoryReward(input("monster_big_birb",3,20));
    expect(overleveled.characterXp).toBeLessThan(equipped.characterXp);
    expect(overleveled.combatSkillXp).toBeGreaterThan(0);
  });
  it("feeds existing exact character/weapon/combat progression without inventing a new level curve", () => {
    const plan=buildAurionMonsterVictoryReward(input("monster_big_birb",3));
    const base={totalXpExact:"0",levelExact:"1",xpIntoLevelExact:"0"};
    expect(xpRequiredForNextLevel(1)).toBe(122);
    expect(levelFromTotalXp(plan.characterXp)).toBe(1);
    expect(advanceExactSkillProgression(base,String(plan.combatSkillXp)).xpIntoLevelExact).toBe("9");
    expect(advanceExactSkillProgression(base,String(plan.weaponXp)).xpIntoLevelExact).toBe("15");
  });
  it("refuses fabricated species, forged reward values, wrong metadata and invalid id/level/weapon fields", () => {
    expect(() => buildAurionMonsterVictoryReward(input("monster_missing",3))).toThrow();
    expect(() => buildAurionMonsterVictoryReward(input("monster_big_birb",999))).toThrow();
    expect(() => buildAurionMonsterVictoryReward(input("monster_big_birb",3,0))).toThrow();
    expect(() => buildAurionMonsterVictoryReward({...input("monster_big_birb",3),weaponTrack:"dagger" as never})).toThrow();
    expect(() => buildAurionMonsterVictoryReward({...input("monster_big_birb",3),receiptId:"oops"})).toThrow();
    expect(() => buildAurionMonsterVictoryReward({...input("monster_big_birb",3),userId:-3})).toThrow();
    const p=buildAurionMonsterVictoryReward(input("monster_big_birb",3));
    expect(() => verifyAurionMonsterVictoryReward({...p,characterXp:p.characterXp+1})).toThrow("AURION_MONSTER_REWARD_FORGED");
    expect(() => verifyAurionMonsterVictoryReward({...p,rewardHash:"0".repeat(64)})).toThrow("AURION_MONSTER_REWARD_FORGED");
  });
  it("binds reward identity to exact confirmed receipt, player and equipped track", () => {
    const p=buildAurionMonsterVictoryReward(input("monster_big_birb",3));
    expect(buildAurionMonsterVictoryReward(input("monster_big_birb",3))).toEqual(p);
    expect(buildAurionMonsterVictoryReward({...input("monster_big_birb",3),receiptId:"combat-receipt-11111111111111111111111111111111"}).rewardHash).not.toBe(p.rewardHash);
    expect(buildAurionMonsterVictoryReward({...input("monster_big_birb",3),userId:18}).rewardHash).not.toBe(p.rewardHash);
    expect(buildAurionMonsterVictoryReward({...input("monster_big_birb",3),weaponTrack:"staff"}).rewardHash).not.toBe(p.rewardHash);
  });
});
