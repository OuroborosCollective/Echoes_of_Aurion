import { createHash } from "node:crypto";
import { requireAurionMonsterSpecies } from "./aurionMonsterSpeciesCatalog";
import type { WasdZoneWeaponTrack } from "./wasdCombatProfileProtocol";

/** Aurion-only reward math. Wolfram may independently verify but never authorizes a tick. */
export const AURION_MONSTER_REWARD_RULESET = "aurion.monster-rewards.v1" as const;
const WEAPONS = ["blade", "staff", "spear", "focus"] as const;
const SIZE_BPS = { big: 12500, blob: 9000, flying: 11000 } as const;
const TIER_BPS = { normal: 10000, elite: 22000, boss: 65000 } as const;

export type AurionMonsterVictoryRewardInput = Readonly<{
  receiptId: string; userId: number; speciesId: string; monsterLevel: number;
  playerLevel: number; weaponTrack: WasdZoneWeaponTrack | null;
}>;
export type AurionMonsterVictoryReward = AurionMonsterVictoryRewardInput & Readonly<{
  ruleSetVersion: typeof AURION_MONSTER_REWARD_RULESET;
  family: "big" | "blob" | "flying"; assetSha256: string;
  characterXp: number; weaponXp: number; combatSkillXp: number;
  combatSkillId: "combat"; rewardHash: string;
}>;

/** Produces a frozen deterministic plan, NOT a grant. Only durable confirmed
 * victory records may be committed, by a separate Aurion-owned transaction.
 */
export function buildAurionMonsterVictoryReward(input: AurionMonsterVictoryRewardInput): AurionMonsterVictoryReward {
  if (!/^combat-receipt-[a-f0-9]{32}$/.test(input.receiptId)
    || !Number.isSafeInteger(input.userId) || input.userId < 1
    || !Number.isSafeInteger(input.playerLevel) || input.playerLevel < 1 || input.playerLevel > 10_000
    || (input.weaponTrack !== null && !(WEAPONS as readonly string[]).includes(input.weaponTrack)))
    throw new Error("AURION_MONSTER_REWARD_IDENTITY_INVALID");
  const species = requireAurionMonsterSpecies(input.speciesId);
  if (!Number.isSafeInteger(input.monsterLevel) || input.monsterLevel < species.levelMin || input.monsterLevel > species.levelMax)
    throw new Error("AURION_MONSTER_REWARD_LEVEL_INVALID");
  const { monsterLevel: level, playerLevel: player } = input;
  const base = 10 + 4 * level + Math.floor(level * level / 7);
  const tier = species.isBoss ? "boss" : species.isElite ? "elite" : "normal";
  const scaled = Math.max(1, Math.floor(base * SIZE_BPS[species.family] * TIER_BPS[tier] / 100_000_000));
  const excess = Math.max(0, player - level - 3);
  const levelGapBps = Math.max(1500, 10000 - 1200 * excess);
  const characterXp = Math.max(1, Math.floor(scaled * levelGapBps / 10000));
  const weaponXp = input.weaponTrack === null ? 0 : Math.max(1, Math.floor(characterXp * 55 / 100));
  const combatSkillXp = Math.max(1, Math.floor(characterXp * 35 / 100));
  const unsigned = Object.freeze({
    ruleSetVersion: AURION_MONSTER_REWARD_RULESET,
    ...input, family: species.family, assetSha256: species.assetSha256,
    characterXp, weaponXp, combatSkillXp, combatSkillId: "combat" as const,
  });
  const rewardHash = createHash("sha256").update(JSON.stringify([
    unsigned.ruleSetVersion, unsigned.receiptId, unsigned.userId, unsigned.speciesId,
    unsigned.monsterLevel, unsigned.playerLevel, unsigned.weaponTrack, unsigned.family,
    unsigned.assetSha256, unsigned.characterXp, unsigned.weaponXp, unsigned.combatSkillXp,
    unsigned.combatSkillId,
  ])).digest("hex");
  return Object.freeze({ ...unsigned, rewardHash });
}

/** Recompute instead of trusting a client- or queue-supplied amount. */
export function verifyAurionMonsterVictoryReward(reward: AurionMonsterVictoryReward): AurionMonsterVictoryReward {
  const expected = buildAurionMonsterVictoryReward(reward);
  if (expected.rewardHash !== reward.rewardHash
    || expected.characterXp !== reward.characterXp
    || expected.weaponXp !== reward.weaponXp
    || expected.combatSkillXp !== reward.combatSkillXp
    || expected.assetSha256 !== reward.assetSha256
    || expected.family !== reward.family
    || expected.ruleSetVersion !== reward.ruleSetVersion
    || expected.combatSkillId !== reward.combatSkillId)
    throw new Error("AURION_MONSTER_REWARD_FORGED");
  return expected;
}
