import { describe, expect, it } from "vitest";
import { aurionMonsterAssetRegistry } from "../shared/aurionMonsterAssetRegistry";
import { aurionMonsterSpecies, aurionMonsterRegions, aurionMonsterCombatStats, planAurionMonsterEncounter, requireAurionMonsterSpecies } from "./aurionMonsterSpeciesCatalog";

describe("Aurion authoritative monster species catalog", () => {
  it("binds 49 distinct author-reviewed gameplay identities to 49 immutable uploaded GLBs", () => {
    expect(aurionMonsterSpecies).toHaveLength(49);
    expect(aurionMonsterAssetRegistry).toHaveLength(49);
    expect(new Set(aurionMonsterSpecies.map(row => row.speciesId)).size).toBe(49);
    expect(new Set(aurionMonsterSpecies.map(row => row.assetSha256)).size).toBe(49);
    expect(aurionMonsterSpecies.map(row => row.assetSha256)).toEqual(aurionMonsterAssetRegistry.map(row => row.sha256));
    expect(aurionMonsterSpecies.filter(row => row.region === "observatory_threshold")).toHaveLength(12);
    for (const row of aurionMonsterSpecies) {
      expect(requireAurionMonsterSpecies(row.speciesId)).toBe(row);
      expect(row.levelMin).toBeGreaterThanOrEqual(1);
      expect(row.levelMax).toBeGreaterThanOrEqual(row.levelMin);
      expect(row.spawnWeight).toBeGreaterThan(0);
      expect(row.region === "observatory_threshold" && row.habitat === "city-outskirts").toBe(false);
    }
    expect(() => requireAurionMonsterSpecies("monster_fake")).toThrow("AURION_MONSTER_SPECIES_UNKNOWN");
  });
  it("uses deterministic monotone integer health and attack bonus curves", () => {
    for (const species of aurionMonsterSpecies) {
      let previousHp = -1, previousDamage = -1;
      for (let level = species.levelMin; level <= species.levelMax; level++) {
        const stats = aurionMonsterCombatStats(species, level);
        expect(Number.isSafeInteger(stats.maxHealth)).toBe(true);
        expect(Number.isSafeInteger(stats.attackBonus)).toBe(true);
        expect(stats.maxHealth).toBeGreaterThan(previousHp);
        expect(stats.attackBonus).toBeGreaterThanOrEqual(previousDamage);
        expect(stats.attackCooldownTicks).toBeGreaterThan(0);
        expect(stats.chaseStepFixed).toBeGreaterThan(0);
        previousHp = stats.maxHealth;
        previousDamage = stats.attackBonus;
      }
      expect(() => aurionMonsterCombatStats(species, species.levelMin - 1)).toThrow();
      expect(() => aurionMonsterCombatStats(species, species.levelMax + 1)).toThrow();
    }
  });
  it("selects repeatable weighted plans by authored region and seed without granting world-space authority", () => {
    for (const region of aurionMonsterRegions) {
      const result = planAurionMonsterEncounter(region, "test:region:42", 16);
      expect(result).toHaveLength(16);
      expect(planAurionMonsterEncounter(region, "test:region:42", 16)).toEqual(result);
      expect(result.every(entry => entry.region === region)).toBe(true);
      expect(result.every(entry => requireAurionMonsterSpecies(entry.speciesId).region === region)).toBe(true);
      expect(result.every(entry => entry.level >= requireAurionMonsterSpecies(entry.speciesId).levelMin)).toBe(true);
      expect(result.every(entry => entry.level <= requireAurionMonsterSpecies(entry.speciesId).levelMax)).toBe(true);
      expect(result.every(entry => !("x" in entry) && !("z" in entry) && !("entityId" in entry))).toBe(true);
    }
    expect(() => planAurionMonsterEncounter("observatory_threshold", "", 1)).toThrow();
    expect(() => planAurionMonsterEncounter("observatory_threshold", "valid", 17)).toThrow();
  });
});
