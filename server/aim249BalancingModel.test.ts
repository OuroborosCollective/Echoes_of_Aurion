import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AURION_BALANCING_RULESET_VERSION,
  AURION_BALANCING_STATUS,
  activityXpAwardExact,
  baseTargetValidatedActionsExact,
  cumulativeXpToLevelExact,
  economyBalance,
  economyBounds,
  expectedEligibleAttemptsForPity,
  lootBaseChanceBps,
  pityChanceBps,
  pityRules,
  regionRewardMultiplierBps,
  repetitionMultiplierBps,
  resolveEnemyBudget,
  scopePacingBps,
  setCompletionBudget,
  targetValidatedActionsExact,
  weaponProfiles,
  xpPerValidatedActionExact,
} from "./aurionBalancingProtocol";
import { resolveBonusYieldCarry } from "./professionMasteryProtocol";
import { xpRequiredForNextSkillLevelExact } from "./wasdAurionSkillProgressionProtocol";

type CandidateConfig = {
  schemaVersion: number;
  rulesetVersion: string;
  status: string;
  final: boolean;
  wolframReplay: { status: string; requiredBeforeFinal: boolean; attempts: Array<{ surface: string; result: string }> };
  xpPacing: {
    scopePacingBps: Record<string, number>;
    representativeLevels: Array<{
      levelExact: string;
      xpNextExact: string;
      cumulativeXpExact: string;
      baseTargetActionsExact: string;
      weaponTargetActionsExact: string;
      weaponXpPerActionExact: string;
      professionTargetActionsExact: string;
      recipeTargetActionsExact: string;
      socialTargetActionsExact: string;
      politicsTargetActionsExact: string;
    }>;
  };
  profession: { checkpoints: Array<{ levelExact: string; guaranteedBonusBatchesExact: string; bonusChanceBps: number }> };
  loot: {
    sumBps: number;
    expectedEligibleAttempts: Record<string, number>;
    threePieceSetWithDuplicateProtection: { hardMaximumEligibleEvents: number; expectedEligibleEvents: number };
  };
};

const config = JSON.parse(readFileSync("shared/aurionBalancingCandidate.json", "utf8")) as CandidateConfig;
const protocolSource = readFileSync("server/aurionBalancingProtocol.ts", "utf8");

describe("AIM-249 deterministic balancing candidate", () => {
  it("stays explicitly non-final while the independent Wolfram replay is unavailable", () => {
    expect(config.schemaVersion).toBe(1);
    expect(config.rulesetVersion).toBe(AURION_BALANCING_RULESET_VERSION);
    expect(config.status).toBe(AURION_BALANCING_STATUS);
    expect(config.final).toBe(false);
    expect(config.wolframReplay).toMatchObject({ status: "pending_external_502", requiredBeforeFinal: true });
    expect(config.wolframReplay.attempts.map(attempt => attempt.surface)).toEqual([
      "WolframContext",
      "WolframLanguageEvaluator",
      "WolframAlpha",
    ]);
  });

  it("replays the exact WASD curve and representative cumulative table", () => {
    let previousRequirement = 0n;
    for (let level = 1; level <= 1_000; level += 1) {
      const requirement = BigInt(xpRequiredForNextSkillLevelExact(String(level)));
      expect(requirement).toBeGreaterThan(previousRequirement);
      previousRequirement = requirement;
    }
    for (const row of config.xpPacing.representativeLevels) {
      expect(xpRequiredForNextSkillLevelExact(row.levelExact)).toBe(row.xpNextExact);
      expect(cumulativeXpToLevelExact(row.levelExact)).toBe(row.cumulativeXpExact);
      expect(baseTargetValidatedActionsExact(row.levelExact)).toBe(row.baseTargetActionsExact);
      expect(targetValidatedActionsExact(row.levelExact, "weapon")).toBe(row.weaponTargetActionsExact);
      expect(xpPerValidatedActionExact(row.levelExact, "weapon")).toBe(row.weaponXpPerActionExact);
      expect(targetValidatedActionsExact(row.levelExact, "profession")).toBe(row.professionTargetActionsExact);
      expect(targetValidatedActionsExact(row.levelExact, "recipe")).toBe(row.recipeTargetActionsExact);
      expect(targetValidatedActionsExact(row.levelExact, "social")).toBe(row.socialTargetActionsExact);
      expect(targetValidatedActionsExact(row.levelExact, "politics")).toBe(row.politicsTargetActionsExact);
    }
    expect(config.xpPacing.scopePacingBps).toEqual(scopePacingBps);
  });

  it("diminishes repeated farming without making real practice negative", () => {
    expect(repetitionMultiplierBps(0)).toBe(10_000);
    expect(repetitionMultiplierBps(5)).toBe(10_000);
    expect(repetitionMultiplierBps(6)).toBeLessThan(10_000);
    expect(repetitionMultiplierBps(50)).toBeGreaterThanOrEqual(2_000);
    expect(repetitionMultiplierBps(10_000)).toBe(2_000);
    expect(BigInt(activityXpAwardExact({ levelExact: "100", scope: "weapon", activity: "world_boss", repetitionStreak: 0 }))).toBeGreaterThan(
      BigInt(activityXpAwardExact({ levelExact: "100", scope: "weapon", activity: "normal_mob", repetitionStreak: 0 })),
    );
    expect(BigInt(activityXpAwardExact({ levelExact: "100", scope: "weapon", activity: "normal_mob", repetitionStreak: 10_000 }))).toBeGreaterThan(0n);
  });

  it("keeps combat style identity in bounded risk/resource budgets rather than class locks", () => {
    expect(Object.keys(weaponProfiles)).toEqual(["blade", "arcane", "marksmanship", "heavy_tech"]);
    expect(weaponProfiles.heavy_tech.dpsBps).toBeGreaterThan(weaponProfiles.blade.dpsBps);
    expect(weaponProfiles.heavy_tech.resourceCostBps).toBeGreaterThan(weaponProfiles.blade.resourceCostBps);
    expect(weaponProfiles.marksmanship.rangeMm).toBeGreaterThan(weaponProfiles.blade.rangeMm);
    expect(resolveEnemyBudget({ tier: "boss", referencePlayerDpsExact: "100", referencePlayerEffectiveHpExact: "9000" })).toMatchObject({
      hpExact: "18000",
      outgoingDamagePerSecondExact: "200",
      armorBps: 2_500,
    });
  });

  it("preserves AIM-248 exact bonus-yield carry without a probability over 100 percent", () => {
    for (const checkpoint of config.profession.checkpoints) {
      expect(resolveBonusYieldCarry(checkpoint.levelExact)).toMatchObject({
        guaranteedBonusBatchesExact: checkpoint.guaranteedBonusBatchesExact,
        bonusChanceBps: checkpoint.bonusChanceBps,
      });
      expect(checkpoint.bonusChanceBps).toBeGreaterThanOrEqual(0);
      expect(checkpoint.bonusChanceBps).toBeLessThan(10_000);
    }
  });

  it("defines a complete deterministic loot distribution and bounded bad-luck protection", () => {
    expect(Object.values(lootBaseChanceBps).reduce((sum, value) => sum + value, 0)).toBe(10_000);
    expect(config.loot.sumBps).toBe(10_000);
    expect(pityChanceBps("set", pityRules.set.startsAfterMisses - 1)).toBe(pityRules.set.baseChanceBps);
    expect(pityChanceBps("set", pityRules.set.startsAfterMisses)).toBe(pityRules.set.baseChanceBps + pityRules.set.incrementBps);
    expect(pityChanceBps("set", pityRules.set.hardPityAttempt - 1)).toBe(10_000);
    expect(expectedEligibleAttemptsForPity("rare")).toBeCloseTo(config.loot.expectedEligibleAttempts.rare!, 5);
    expect(expectedEligibleAttemptsForPity("set")).toBeCloseTo(config.loot.expectedEligibleAttempts.set!, 5);
    expect(expectedEligibleAttemptsForPity("unique")).toBeCloseTo(config.loot.expectedEligibleAttempts.unique!, 5);
    const setBudget = setCompletionBudget(3);
    expect(setBudget.hardMaximumEligibleEvents).toBe(config.loot.threePieceSetWithDuplicateProtection.hardMaximumEligibleEvents);
    expect(setBudget.expectedEligibleEvents).toBeCloseTo(config.loot.threePieceSetWithDuplicateProtection.expectedEligibleEvents, 5);
  });

  it("bounds economy drift and preserves an old-region relevance floor", () => {
    expect(economyBalance({ faucetExact: "1000", sinkExact: "970" }).status).toBe("on_target");
    expect(economyBalance({ faucetExact: "1000", sinkExact: "800" }).status).toBe("inflation_risk");
    expect(economyBalance({ faucetExact: "1000", sinkExact: "1200" }).status).toBe("deflation_risk");
    expect(regionRewardMultiplierBps({ obsolescencePenaltyBps: 10_000 })).toBe(economyBounds.oldRegionRewardFloorBps);
    expect(regionRewardMultiplierBps({ scarcityBonusBps: 10_000, eventBonusBps: 10_000 })).toBe(economyBounds.dynamicRegionRewardCeilingBps);
  });

  it("contains no wall-clock or nondeterministic RNG authority", () => {
    expect(protocolSource).not.toContain("Date.now(");
    expect(protocolSource).not.toContain("Math.random(");
    expect(protocolSource).not.toContain("performance.now(");
  });
});
