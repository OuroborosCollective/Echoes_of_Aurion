import { createHash } from "node:crypto";
import { activityXpAwardExact, economyBounds, integerSquareRoot, resolveEnemyBudget, type EnemyTier } from "./aurionBalancingProtocol";
import { dungeonAffixDefinitions, dungeonAffixKeys, type DungeonAffix } from "./aurionRegionCatalog";
import { clampInteger, stableStringify, type RegionProgression } from "./aurionRegionProgressionProtocol";

export const AURION_DUNGEON_RULESET_VERSION = "aurion-dungeon-progression.v2" as const;
export const dungeonVariants = ["normal", "elite", "endless", "challenge"] as const;
export type DungeonVariant = (typeof dungeonVariants)[number];

const canonicalExact = /^(0|[1-9][0-9]*)$/;
const digestPattern = /^[a-f0-9]{64}$/;
const positiveExact = (value: string, field: string): bigint => {
  if (!canonicalExact.test(value) || BigInt(value) < 1n) throw new Error(`${field} must be a canonical positive decimal`);
  return BigInt(value);
};
const hashHex = (...parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

function chooseDistinctAffixes(seed: string, count: number): readonly DungeonAffix[] {
  return Object.freeze(dungeonAffixKeys
    .map(key => ({ key, rank: hashHex(seed, key) }))
    .sort((left, right) => left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
    .slice(0, count)
    .map(entry => dungeonAffixDefinitions[entry.key]));
}

function projectedEndlessFloor(floorExact: string): number {
  const root = integerSquareRoot(positiveExact(floorExact, "floorExact"));
  return Number(root > 20_000n ? 20_000n : root);
}

export type DungeonProgression = Readonly<{
  dungeonKey: string;
  regionId: string;
  variant: DungeonVariant;
  floorExact: string;
  challengeScoreExact: string;
  combatBudgetBps: number;
  rewardMultiplierBps: number;
  affixes: readonly DungeonAffix[];
  enemyTier: EnemyTier;
  enemyBudget: ReturnType<typeof resolveEnemyBudget>;
  completionXpExact: string;
  sourceReceiptDigest: string;
  deterministicHash: string;
}>;

export function resolveDungeonProgression(input: Readonly<{
  worldSeed: string;
  epoch: number;
  region: RegionProgression;
  variant: DungeonVariant;
  floorExact: string;
  partySize: number;
  combatMasteryLevelExact: string;
  sourceReceiptDigest: string;
}>): DungeonProgression {
  if (!input.worldSeed.trim() || !dungeonVariants.includes(input.variant)) throw new Error("invalid dungeon context");
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 0 || !Number.isSafeInteger(input.partySize) || input.partySize < 1 || input.partySize > 8) throw new Error("invalid dungeon epoch or party size");
  if (!digestPattern.test(input.sourceReceiptDigest)) throw new Error("sourceReceiptDigest must be a lower-case SHA-256 digest");
  const floor = positiveExact(input.floorExact, "floorExact");
  positiveExact(input.combatMasteryLevelExact, "combatMasteryLevelExact");
  const variantBaseBps: Readonly<Record<DungeonVariant, number>> = Object.freeze({ normal: 10_000, elite: 16_000, endless: 13_000, challenge: 22_000 });
  const floorProjection = projectedEndlessFloor(input.floorExact);
  const floorDangerBps = input.variant === "endless" ? floorProjection * 8 : input.variant === "challenge" ? floorProjection * 4 : floorProjection * 2;
  const affixCount = input.variant === "normal" ? 1 : input.variant === "elite" ? 2 : input.variant === "challenge" ? 3 : clampInteger(2 + Math.floor(input.floorExact.length / 2), 2, 6);
  // One immutable run receipt fixes the affix ordering. Higher floors extend
  // that prefix instead of rerolling danger/rewards downwards at every floor.
  const runSeed = hashHex(AURION_DUNGEON_RULESET_VERSION, input.worldSeed, String(input.epoch), input.region.regionId, input.region.archetype.dungeonKey, input.variant, input.sourceReceiptDigest);
  const seed = hashHex(runSeed, input.floorExact);
  const affixes = chooseDistinctAffixes(runSeed, affixCount);
  const affixDangerBps = affixes.reduce((sum, affix) => sum + affix.dangerDeltaBps, 0);
  const affixRewardBps = affixes.reduce((sum, affix) => sum + affix.rewardDeltaBps, 0);
  const combatBudgetBps = clampInteger(variantBaseBps[input.variant] + floorDangerBps + affixDangerBps + (input.partySize - 1) * 500, 10_000, 60_000);
  const rewardMultiplierBps = clampInteger(input.region.rewardMultiplierBps + Math.floor((combatBudgetBps - 10_000) / 2) + affixRewardBps, economyBounds.oldRegionRewardFloorBps, 50_000);
  const enemyTier: EnemyTier = combatBudgetBps >= 32_000 ? "dungeon_boss" : combatBudgetBps >= 21_000 ? "boss" : combatBudgetBps >= 14_000 ? "elite" : "normal";
  const challengeScoreExact = (floor * BigInt(variantBaseBps[input.variant] + affixDangerBps) + (BigInt(input.epoch) + 1n) * BigInt(input.partySize)).toString(10);
  const completionBase = BigInt(activityXpAwardExact({ levelExact: input.combatMasteryLevelExact, scope: "combat_action", activity: "dungeon_completion", repetitionStreak: 0 }));
  const completionXpExact = ((completionBase * BigInt(rewardMultiplierBps)) / 10_000n).toString(10);
  const snapshot = {
    dungeonKey: input.region.archetype.dungeonKey,
    regionId: input.region.regionId,
    variant: input.variant,
    floorExact: input.floorExact,
    challengeScoreExact,
    combatBudgetBps,
    rewardMultiplierBps,
    affixes,
    enemyTier,
    enemyBudget: resolveEnemyBudget({ tier: enemyTier, referencePlayerDpsExact: input.region.archetype.referencePlayerDpsExact, referencePlayerEffectiveHpExact: input.region.archetype.referencePlayerEffectiveHpExact }),
    completionXpExact,
    sourceReceiptDigest: input.sourceReceiptDigest,
  } as const;
  return Object.freeze({ ...snapshot, deterministicHash: hashHex(seed, stableStringify(snapshot)) });
}
