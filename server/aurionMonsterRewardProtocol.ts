import { createHash } from "node:crypto";
import { requireAurionMonsterSpecies } from "./aurionMonsterSpeciesCatalog";
import type { WasdZoneWeaponTrack } from "./wasdCombatProfileProtocol";

export const AURION_MONSTER_REWARD_RULESET = "aurion.monster-rewards.v2" as const;
const WEAPONS = ["blade", "staff", "spear", "focus"] as const;
const SIZE_BPS = { big: 12500n, blob: 9000n, flying: 11000n } as const;
const TIER_BPS = { normal: 10000n, elite: 22000n, boss: 65000n } as const;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const EXACT = /^(0|[1-9][0-9]*)$/;

export type AurionMonsterVictoryRewardInput = Readonly<{
  receiptId: string; userId: number; speciesId: string; monsterLevel: number | string;
  playerLevel: number | string; weaponTrack: WasdZoneWeaponTrack | null;
}>;
export type AurionMonsterVictoryReward = AurionMonsterVictoryRewardInput & Readonly<{
  ruleSetVersion: typeof AURION_MONSTER_REWARD_RULESET;
  monsterLevelExact: string; playerLevelExact: string;
  family: "big" | "blob" | "flying"; assetSha256: string;
  characterXpExact: string; weaponXpExact: string; combatSkillXpExact: string;
  characterXp: number; weaponXp: number; combatSkillXp: number;
  numberProjectionExact: boolean;
  combatSkillId: "combat"; rewardHash: string;
}>;

function positiveExactLevel(value: number | string): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("AURION_MONSTER_REWARD_LEVEL_INVALID");
    return BigInt(value);
  }
  if (!EXACT.test(value) || value === "0" || value.length > 128) throw new Error("AURION_MONSTER_REWARD_LEVEL_INVALID");
  return BigInt(value);
}
const project = (value: bigint): number => Number(value > MAX_SAFE ? MAX_SAFE : value);

/** Pure deterministic rule proposal; an Aurion receipt transaction must authorize a grant. */
export function buildAurionMonsterVictoryReward(input: AurionMonsterVictoryRewardInput): AurionMonsterVictoryReward {
  if (!/^combat-receipt-[a-f0-9]{32}$/.test(input.receiptId)
    || !Number.isSafeInteger(input.userId) || input.userId < 1
    || (input.weaponTrack !== null && !(WEAPONS as readonly string[]).includes(input.weaponTrack)))
    throw new Error("AURION_MONSTER_REWARD_IDENTITY_INVALID");
  const species = requireAurionMonsterSpecies(input.speciesId);
  const level = positiveExactLevel(input.monsterLevel);
  const player = positiveExactLevel(input.playerLevel);
  if (level < BigInt(species.levelMin)) throw new Error("AURION_MONSTER_REWARD_LEVEL_INVALID");
  // The authored levelMax is the region's initial distribution, NEVER a global progression cap.
  const base = 10n + 4n * level + level * level / 7n;
  const tier = species.isBoss ? "boss" : species.isElite ? "elite" : "normal";
  const scaled = base * SIZE_BPS[species.family] * TIER_BPS[tier] / 100_000_000n;
  const excess = player > level + 3n ? player - level - 3n : 0n;
  const levelGapBps = excess >= 8n ? 1500n : 10000n - 1200n * excess;
  const character = (scaled > 0n ? scaled : 1n) * levelGapBps / 10000n;
  const characterXp = character > 0n ? character : 1n;
  const weapon = input.weaponTrack === null ? 0n : (characterXp * 55n / 100n > 0n ? characterXp * 55n / 100n : 1n);
  const combat = characterXp * 35n / 100n > 0n ? characterXp * 35n / 100n : 1n;
  const monsterLevelExact = level.toString(), playerLevelExact = player.toString();
  const unsigned = Object.freeze({
    ruleSetVersion: AURION_MONSTER_REWARD_RULESET,
    receiptId: input.receiptId, userId: input.userId, speciesId: input.speciesId,
    monsterLevel: input.monsterLevel, playerLevel: input.playerLevel,
    monsterLevelExact, playerLevelExact, weaponTrack: input.weaponTrack,
    family: species.family, assetSha256: species.assetSha256,
    characterXpExact: characterXp.toString(), weaponXpExact: weapon.toString(), combatSkillXpExact: combat.toString(),
    characterXp: project(characterXp), weaponXp: project(weapon), combatSkillXp: project(combat),
    numberProjectionExact: characterXp <= MAX_SAFE && weapon <= MAX_SAFE && combat <= MAX_SAFE,
    combatSkillId: "combat" as const,
  });
  const rewardHash = createHash("sha256").update(JSON.stringify([
    unsigned.ruleSetVersion, unsigned.receiptId, unsigned.userId, unsigned.speciesId,
    monsterLevelExact, playerLevelExact, unsigned.weaponTrack, unsigned.family,
    unsigned.assetSha256, unsigned.characterXpExact, unsigned.weaponXpExact,
    unsigned.combatSkillXpExact, unsigned.combatSkillId,
  ])).digest("hex");
  return Object.freeze({ ...unsigned, rewardHash });
}

export function verifyAurionMonsterVictoryReward(reward: AurionMonsterVictoryReward): AurionMonsterVictoryReward {
  const expected = buildAurionMonsterVictoryReward(reward);
  if (expected.rewardHash !== reward.rewardHash || expected.characterXpExact !== reward.characterXpExact
    || expected.weaponXpExact !== reward.weaponXpExact || expected.combatSkillXpExact !== reward.combatSkillXpExact
    || expected.characterXp !== reward.characterXp || expected.weaponXp !== reward.weaponXp
    || expected.combatSkillXp !== reward.combatSkillXp || expected.assetSha256 !== reward.assetSha256
    || expected.family !== reward.family || expected.ruleSetVersion !== reward.ruleSetVersion
    || expected.combatSkillId !== reward.combatSkillId || expected.numberProjectionExact !== reward.numberProjectionExact
    || expected.monsterLevelExact !== reward.monsterLevelExact || expected.playerLevelExact !== reward.playerLevelExact)
    throw new Error("AURION_MONSTER_REWARD_FORGED");
  return expected;
}
