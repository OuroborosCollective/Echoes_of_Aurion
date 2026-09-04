import { createHash } from "node:crypto";
import { advanceExactSkillProgression, type ExactProgression } from "./wasdAurionSkillProgressionProtocol";
import { resolveLoot, setBonusForOwnedPieces, type LootResolution } from "./endgameProtocol";

export const AX1_CLASSLESS_ITEMIZATION_RULESET = "aurion-ax1-classless-itemization.v1" as const;
export const classlessWeaponTracks = ["blade", "arcane", "marksmanship", "heavy_tech"] as const;
export type ClasslessWeaponTrack = (typeof classlessWeaponTracks)[number];
export type LootSource = "world" | "elite" | "boss" | "dungeon";

const zeroProgression = (): ExactProgression => ({ totalXpExact: "0", levelExact: "1", xpIntoLevelExact: "0", xpForNextLevelExact: "50", totalXp: 0, level: 1, numberProjectionExact: true });
const canonicalExact = (value: string, label: string): bigint => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be canonical exact decimal`);
  return BigInt(value);
};

export function advanceWeaponMastery(current: Pick<ExactProgression, "totalXpExact" | "levelExact" | "xpIntoLevelExact"> | undefined, amountExact: string): ExactProgression {
  return advanceExactSkillProgression(current ?? zeroProgression(), amountExact);
}

export function advanceAscension(current: Pick<ExactProgression, "totalXpExact" | "levelExact" | "xpIntoLevelExact"> | undefined, amountExact: string): ExactProgression {
  return advanceExactSkillProgression(current ?? zeroProgression(), amountExact);
}

/** Infinite mastery remains visible while gameplay power approaches a bounded +25%. */
export function diminishingMasteryPowerBps(levelExact: string): number {
  const level = canonicalExact(levelExact, "levelExact");
  const bonus = (2500n * level) / (level + 100n);
  return Number(10_000n + bonus);
}

export function itemQualityScoreExact(input: Readonly<{ itemLevelExact: string; craftMasteryLevelExact?: string; ascensionLevelExact?: string }>): string {
  const item = canonicalExact(input.itemLevelExact, "itemLevelExact");
  const craft = canonicalExact(input.craftMasteryLevelExact ?? "1", "craftMasteryLevelExact");
  const ascension = canonicalExact(input.ascensionLevelExact ?? "1", "ascensionLevelExact");
  return (item * 10_000n + craft * 125n + ascension * 25n).toString(10);
}

export type ClasslessLoot = Readonly<{
  source: LootSource;
  regionKey: string;
  itemLevelExact: string;
  powerBudgetBps: number;
  resolution: LootResolution;
  deterministicHash: string;
}>;

function roll(seed: string, lane: string): number {
  const digest = createHash("sha256").update(`${AX1_CLASSLESS_ITEMIZATION_RULESET}\u001f${seed}\u001f${lane}`, "utf8").digest();
  return digest.readUInt32BE(0) % 10_000;
}

const sourceBonus: Readonly<Record<LootSource, bigint>> = Object.freeze({ world: 0n, elite: 4n, boss: 9n, dungeon: 14n });
const powerBudget: Readonly<Record<LootSource, number>> = Object.freeze({ world: 10_000, elite: 11_000, boss: 12_250, dungeon: 13_000 });
const treasureClassByRegion: Readonly<Record<string, string>> = Object.freeze({
  observatory_threshold: "asterion_t2_weapons",
  windhollow: "archive_t3_weapons",
  emberfall: "solarium_t4_weapons",
  cinder_vault: "solarium_t4_weapons",
});

/** Server receipt/seed chooses all rolls; browser never supplies quality, affix, set or item level. */
export function resolveClasslessLoot(input: Readonly<{ serverSeed: string; source: LootSource; regionKey: string; progressionLevelExact: string; magicFind?: number }>): ClasslessLoot {
  if (!input.serverSeed.trim()) throw new Error("server seed is required");
  const progression = canonicalExact(input.progressionLevelExact, "progressionLevelExact");
  const classKey = treasureClassByRegion[input.regionKey] ?? "asterion_t2_weapons";
  const qualityRoll = roll(input.serverSeed, "quality");
  const affixRoll = roll(input.serverSeed, "affix");
  const resolution = resolveLoot(classKey, qualityRoll, affixRoll, input.magicFind ?? 0);
  const itemLevelExact = (progression + sourceBonus[input.source] + BigInt(qualityRoll % 5)).toString(10);
  const deterministicHash = createHash("sha256").update([
    AX1_CLASSLESS_ITEMIZATION_RULESET, input.serverSeed, input.source, input.regionKey, input.progressionLevelExact,
    String(qualityRoll), String(affixRoll), itemLevelExact, resolution.baseItemKey, resolution.quality,
    resolution.setKey ?? "none", ...resolution.affixes.map(affix => `${affix.slot}:${affix.key}`),
  ].join("\u001f"), "utf8").digest("hex");
  return Object.freeze({ source: input.source, regionKey: input.regionKey, itemLevelExact, powerBudgetBps: powerBudget[input.source], resolution: Object.freeze({ ...resolution, affixes: Object.freeze(resolution.affixes.map(affix => Object.freeze({ ...affix, stats: Object.freeze({ ...affix.stats }) }))) }), deterministicHash });
}

/** Weapon use is track-scoped, never class-gated. Starter class is presentation/archetype only. */
export function canTrainWeaponTrack(track: string): track is ClasslessWeaponTrack {
  return (classlessWeaponTracks as readonly string[]).includes(track);
}

export function classlessSetBonus(setKey: string, ownedPieces: readonly string[], masteryLevelExact: string): Readonly<Record<string, number>> {
  const base = setBonusForOwnedPieces(setKey, ownedPieces);
  if (!Object.keys(base).length) return Object.freeze({});
  const multiplierBps = diminishingMasteryPowerBps(masteryLevelExact);
  return Object.freeze(Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.floor(value * multiplierBps / 10_000)])));
}
