import { xpRequiredForNextSkillLevelExact } from "./wasdAurionSkillProgressionProtocol";

/**
 * AIM-249 candidate balancing model.
 *
 * This module never grants XP, rolls loot, mutates combat state, or replaces the
 * normative WASD progression curve. It converts already-authoritative exact
 * progression requirements into versioned pacing and budget candidates. The
 * constants remain candidate values until an independent Wolfram replay is
 * attached to the migration record.
 */
export const AURION_BALANCING_RULESET_VERSION = "aurion-balancing-candidate.v1" as const;
export const AURION_BALANCING_STATUS = "candidate_pending_wolfram_replay" as const;

export const balancingScopes = [
  "weapon",
  "profession",
  "recipe",
  "item",
  "social",
  "politics",
  "navigation",
  "gathering",
  "combat_action",
] as const;
export type BalancingScope = (typeof balancingScopes)[number];

/** Pacing only: the underlying XP curve stays floor(50 * level^1.4). */
export const scopePacingBps: Readonly<Record<BalancingScope, number>> = Object.freeze({
  weapon: 10_000,
  profession: 9_000,
  recipe: 7_000,
  item: 6_500,
  social: 11_000,
  politics: 13_000,
  navigation: 8_500,
  gathering: 8_500,
  combat_action: 7_500,
});

export const activityKinds = [
  "normal_mob",
  "elite_mob",
  "world_boss",
  "quest",
  "dungeon_completion",
  "exploration",
  "gathering",
  "crafting",
] as const;
export type BalancingActivityKind = (typeof activityKinds)[number];

/** Relative to one validated baseline action. Values above 10_000 represent multi-action rewards. */
export const activityWeightBps: Readonly<Record<BalancingActivityKind, number>> = Object.freeze({
  normal_mob: 10_000,
  elite_mob: 30_000,
  world_boss: 120_000,
  quest: 80_000,
  dungeon_completion: 250_000,
  exploration: 12_000,
  gathering: 7_000,
  crafting: 9_000,
});

export const weaponProfiles = Object.freeze({
  blade: Object.freeze({ dpsBps: 10_000, rangeMm: 2_500, resourceCostBps: 10_000, riskBps: 10_000, masteryXpBps: 10_000 }),
  arcane: Object.freeze({ dpsBps: 10_500, rangeMm: 18_000, resourceCostBps: 12_500, riskBps: 9_000, masteryXpBps: 9_500 }),
  marksmanship: Object.freeze({ dpsBps: 9_800, rangeMm: 24_000, resourceCostBps: 10_500, riskBps: 8_500, masteryXpBps: 10_000 }),
  heavy_tech: Object.freeze({ dpsBps: 11_500, rangeMm: 12_000, resourceCostBps: 14_000, riskBps: 12_500, masteryXpBps: 11_000 }),
});
export type CandidateWeaponProfile = keyof typeof weaponProfiles;

export const enemyTiers = ["normal", "elite", "boss", "dungeon_boss"] as const;
export type EnemyTier = (typeof enemyTiers)[number];

export const enemyTierBudgets = Object.freeze({
  normal: Object.freeze({ targetTtkMs: 8_000, targetPlayerSurvivalMs: 90_000, armorBps: 500, packMin: 1, packMax: 4 }),
  elite: Object.freeze({ targetTtkMs: 35_000, targetPlayerSurvivalMs: 60_000, armorBps: 1_500, packMin: 1, packMax: 2 }),
  boss: Object.freeze({ targetTtkMs: 180_000, targetPlayerSurvivalMs: 45_000, armorBps: 2_500, packMin: 1, packMax: 1 }),
  dungeon_boss: Object.freeze({ targetTtkMs: 300_000, targetPlayerSurvivalMs: 35_000, armorBps: 3_500, packMin: 1, packMax: 1 }),
});

export const lootQualities = ["normal", "magic", "rare", "set", "unique"] as const;
export type CandidateLootQuality = (typeof lootQualities)[number];
export const lootBaseChanceBps: Readonly<Record<CandidateLootQuality, number>> = Object.freeze({
  normal: 7_000,
  magic: 2_200,
  rare: 700,
  set: 80,
  unique: 20,
});

export const pityTiers = ["rare", "set", "unique"] as const;
export type PityTier = (typeof pityTiers)[number];
export const pityRules = Object.freeze({
  rare: Object.freeze({ baseChanceBps: 700, startsAfterMisses: 15, incrementBps: 250, hardPityAttempt: 45 }),
  set: Object.freeze({ baseChanceBps: 80, startsAfterMisses: 40, incrementBps: 80, hardPityAttempt: 160 }),
  unique: Object.freeze({ baseChanceBps: 20, startsAfterMisses: 100, incrementBps: 25, hardPityAttempt: 500 }),
});

export const economyBounds = Object.freeze({
  targetSinkFaucetMinBps: 9_200,
  targetSinkFaucetMaxBps: 10_800,
  hardNetIssuanceMaxBps: 1_000,
  priceMultiplierMinBps: 5_000,
  priceMultiplierMaxBps: 25_000,
  oldRegionRewardFloorBps: 7_500,
  dynamicRegionRewardCeilingBps: 25_000,
});

const canonicalExact = /^(0|[1-9][0-9]*)$/;
const tenThousand = 10_000n;

function exact(value: string, field: string): bigint {
  if (!canonicalExact.test(value)) throw new Error(`${field} must be a canonical non-negative decimal`);
  return BigInt(value);
}

function positiveExact(value: string, field: string): bigint {
  const parsed = exact(value, field);
  if (parsed < 1n) throw new Error(`${field} must be positive`);
  return parsed;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("ceilDiv denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) throw new Error("integerSquareRoot requires a non-negative value");
  if (value < 2n) return value;
  let low = 0n;
  let high = 1n;
  while (high * high <= value) high *= 2n;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (middle * middle <= value) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * Candidate pacing target. The sqrt term lengthens high-level mastery while
 * keeping every finite level reachable. It does not change the normative XP curve.
 */
export function baseTargetValidatedActionsExact(levelExact: string): string {
  const level = positiveExact(levelExact, "levelExact");
  return (20n + 12n * integerSquareRoot(level - 1n)).toString(10);
}

export function targetValidatedActionsExact(levelExact: string, scope: BalancingScope): string {
  if (!balancingScopes.includes(scope)) throw new Error("unknown balancing scope");
  const base = BigInt(baseTargetValidatedActionsExact(levelExact));
  return ceilDiv(base * BigInt(scopePacingBps[scope]), tenThousand).toString(10);
}

/** Suggested XP for one accepted event at the current scope level. */
export function xpPerValidatedActionExact(levelExact: string, scope: BalancingScope): string {
  const requirement = BigInt(xpRequiredForNextSkillLevelExact(levelExact));
  const actions = BigInt(targetValidatedActionsExact(levelExact, scope));
  return ceilDiv(requirement, actions).toString(10);
}

/** Exact analysis helper; level 1 has zero cumulative XP. */
export function cumulativeXpToLevelExact(levelExact: string): string {
  const level = positiveExact(levelExact, "levelExact");
  let total = 0n;
  for (let current = 1n; current < level; current += 1n) {
    total += BigInt(xpRequiredForNextSkillLevelExact(current.toString(10)));
  }
  return total.toString(10);
}

/**
 * The first five same-context repeats keep full credit. Thereafter the reward
 * falls hyperbolically and never below 20%, avoiding negative or zero progress.
 */
export function repetitionMultiplierBps(repetitionStreak: number): number {
  if (!Number.isSafeInteger(repetitionStreak) || repetitionStreak < 0) throw new Error("repetitionStreak must be a non-negative safe integer");
  if (repetitionStreak <= 5) return 10_000;
  const denominator = 25 + 2 * (repetitionStreak - 5);
  return Math.max(2_000, Math.floor(250_000 / denominator));
}

/** Analysis candidate only; callers still require an accepted server receipt. */
export function activityXpAwardExact(input: Readonly<{
  levelExact: string;
  scope: BalancingScope;
  activity: BalancingActivityKind;
  repetitionStreak: number;
}>): string {
  if (!activityKinds.includes(input.activity)) throw new Error("unknown balancing activity");
  const baseline = BigInt(xpPerValidatedActionExact(input.levelExact, input.scope));
  const weighted = (baseline * BigInt(activityWeightBps[input.activity])) / tenThousand;
  const repeated = (weighted * BigInt(repetitionMultiplierBps(input.repetitionStreak))) / tenThousand;
  return (repeated > 0n ? repeated : 1n).toString(10);
}

export type EnemyBudget = Readonly<{
  tier: EnemyTier;
  hpExact: string;
  outgoingDamagePerSecondExact: string;
  armorBps: number;
  targetTtkMs: number;
  targetPlayerSurvivalMs: number;
  packMin: number;
  packMax: number;
}>;

/** Derives enemy budgets from a server-owned reference build, never client stats. */
export function resolveEnemyBudget(input: Readonly<{
  tier: EnemyTier;
  referencePlayerDpsExact: string;
  referencePlayerEffectiveHpExact: string;
}>): EnemyBudget {
  if (!enemyTiers.includes(input.tier)) throw new Error("unknown enemy tier");
  const dps = positiveExact(input.referencePlayerDpsExact, "referencePlayerDpsExact");
  const effectiveHp = positiveExact(input.referencePlayerEffectiveHpExact, "referencePlayerEffectiveHpExact");
  const tier = enemyTierBudgets[input.tier];
  return Object.freeze({
    tier: input.tier,
    hpExact: ceilDiv(dps * BigInt(tier.targetTtkMs), 1_000n).toString(10),
    outgoingDamagePerSecondExact: ceilDiv(effectiveHp * 1_000n, BigInt(tier.targetPlayerSurvivalMs)).toString(10),
    armorBps: tier.armorBps,
    targetTtkMs: tier.targetTtkMs,
    targetPlayerSurvivalMs: tier.targetPlayerSurvivalMs,
    packMin: tier.packMin,
    packMax: tier.packMax,
  });
}

/** `previousMisses` counts failed eligible rolls before the current attempt. */
export function pityChanceBps(tier: PityTier, previousMisses: number): number {
  if (!pityTiers.includes(tier)) throw new Error("unknown pity tier");
  if (!Number.isSafeInteger(previousMisses) || previousMisses < 0) throw new Error("previousMisses must be a non-negative safe integer");
  const rule = pityRules[tier];
  if (previousMisses >= rule.hardPityAttempt - 1) return 10_000;
  if (previousMisses < rule.startsAfterMisses) return rule.baseChanceBps;
  const pitySteps = previousMisses - rule.startsAfterMisses + 1;
  return Math.min(10_000, rule.baseChanceBps + pitySteps * rule.incrementBps);
}

/** Floating analysis projection only; runtime loot still uses deterministic integer rolls. */
export function expectedEligibleAttemptsForPity(tier: PityTier): number {
  const rule = pityRules[tier];
  let survival = 1;
  let expected = 0;
  for (let previousMisses = 0; previousMisses < rule.hardPityAttempt; previousMisses += 1) {
    expected += survival;
    survival *= 1 - pityChanceBps(tier, previousMisses) / 10_000;
  }
  return expected;
}

export function setCompletionBudget(pieceCount: number): Readonly<{
  expectedEligibleEvents: number;
  hardMaximumEligibleEvents: number;
}> {
  if (!Number.isSafeInteger(pieceCount) || pieceCount < 1 || pieceCount > 12) throw new Error("pieceCount must be from 1 through 12");
  return Object.freeze({
    expectedEligibleEvents: expectedEligibleAttemptsForPity("set") * pieceCount,
    hardMaximumEligibleEvents: pityRules.set.hardPityAttempt * pieceCount,
  });
}

export type EconomyBalanceStatus = "on_target" | "inflation_risk" | "deflation_risk" | "inactive";
export function economyBalance(input: Readonly<{ faucetExact: string; sinkExact: string }>): Readonly<{
  status: EconomyBalanceStatus;
  sinkFaucetBps: number;
  netIssuanceBps: number;
}> {
  const faucet = exact(input.faucetExact, "faucetExact");
  const sink = exact(input.sinkExact, "sinkExact");
  if (faucet === 0n) return Object.freeze({ status: sink === 0n ? "inactive" : "deflation_risk", sinkFaucetBps: sink === 0n ? 0 : 10_000, netIssuanceBps: 0 });
  const ratio = Number((sink * tenThousand) / faucet);
  const netIssuanceBps = faucet > sink ? Number(((faucet - sink) * tenThousand) / faucet) : 0;
  const status: EconomyBalanceStatus = ratio > economyBounds.targetSinkFaucetMaxBps
    ? "deflation_risk"
    : ratio < economyBounds.targetSinkFaucetMinBps || netIssuanceBps > economyBounds.hardNetIssuanceMaxBps
      ? "inflation_risk"
      : "on_target";
  return Object.freeze({ status, sinkFaucetBps: ratio, netIssuanceBps });
}

/** Keeps old regions relevant without permitting unbounded reward multipliers. */
export function regionRewardMultiplierBps(input: Readonly<{
  scarcityBonusBps?: number;
  eventBonusBps?: number;
  politicsBonusBps?: number;
  masteryBonusBps?: number;
  obsolescencePenaltyBps?: number;
}>): number {
  const values = [
    input.scarcityBonusBps ?? 0,
    input.eventBonusBps ?? 0,
    input.politicsBonusBps ?? 0,
    input.masteryBonusBps ?? 0,
    -(input.obsolescencePenaltyBps ?? 0),
  ];
  if (values.some(value => !Number.isSafeInteger(value) || Math.abs(value) > 20_000)) throw new Error("region reward inputs must be bounded safe integers");
  return clamp(10_000 + values.reduce((sum, value) => sum + value, 0), economyBounds.oldRegionRewardFloorBps, economyBounds.dynamicRegionRewardCeilingBps);
}
