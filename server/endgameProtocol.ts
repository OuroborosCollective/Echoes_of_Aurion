/**
 * Echoes of Aurion — deterministic progression and loot rules.
 * These functions accept already validated server inputs; they never trust browser state.
 */

export const weaponTracks = ["blade", "staff", "spear", "focus"] as const;
export type WeaponTrack = (typeof weaponTracks)[number];

export const playerClasses = ["vanguard", "seer", "warden"] as const;
export type PlayerClass = (typeof playerClasses)[number];

export const lootQualities = ["normal", "magic", "rare", "set", "unique"] as const;
export type LootQuality = (typeof lootQualities)[number];

export type LootAffix = { key: string; slot: "prefix" | "suffix"; stats: Record<string, number> };
export type LootResolution = { baseItemKey: string; quality: LootQuality; affixes: LootAffix[]; setKey?: string };

export const CLASS_UNLOCK_LEVEL = 36;
export const MAX_PLAYER_LEVEL = 50;

export function xpRequiredForNextLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level >= MAX_PLAYER_LEVEL) return 0;
  return 100 + 18 * level + 4 * level * level;
}

export function levelFromTotalXp(totalXp: number): number {
  if (!Number.isInteger(totalXp) || totalXp < 0) return 1;
  let remaining = totalXp;
  let level = 1;
  while (level < MAX_PLAYER_LEVEL) {
    const requirement = xpRequiredForNextLevel(level);
    if (remaining < requirement) break;
    remaining -= requirement;
    level += 1;
  }
  return level;
}

export function isPlayerClass(value: string): value is PlayerClass {
  return (playerClasses as readonly string[]).includes(value);
}

export function canChooseClass(level: number, currentClass: "unbound" | PlayerClass): boolean {
  return Number.isInteger(level) && level >= CLASS_UNLOCK_LEVEL && currentClass === "unbound";
}

/**
 * Maps a server-generated 0..9999 roll to a quality. Magic find shifts higher tiers,
 * but the function never accepts a browser-provided reward outcome.
 */
export function rollLootQuality(roll: number, magicFind = 0): LootQuality {
  if (!Number.isInteger(roll) || roll < 0 || roll > 9_999) throw new Error("Loot roll must be an integer from 0 through 9999");
  const mf = Math.max(0, Math.min(100, Math.floor(magicFind)));
  const uniqueEnd = 20 + mf;
  const setEnd = uniqueEnd + 100 + mf * 2;
  const rareEnd = setEnd + 800 + mf * 4;
  const magicEnd = rareEnd + 2_600 + mf * 8;
  if (roll < uniqueEnd) return "unique";
  if (roll < setEnd) return "set";
  if (roll < rareEnd) return "rare";
  if (roll < magicEnd) return "magic";
  return "normal";
}

export function isWeaponTrack(value: string): value is WeaponTrack {
  return (weaponTracks as readonly string[]).includes(value);
}

const treasureCatalog: Record<string, readonly string[]> = {
  asterion_t2_weapons: ["aurion_spear", "asterion_blade", "archive_staff", "warden_focus"],
  archive_t3_weapons: ["archive_staff", "warden_focus", "asterion_blade"],
  solarium_t4_weapons: ["solarium_blade", "sunspike_spear", "ember_focus"],
};

const prefixPool: readonly LootAffix[] = [
  { key: "resonant", slot: "prefix", stats: { resonance: 4 } },
  { key: "warded", slot: "prefix", stats: { guard: 3 } },
  { key: "starforged", slot: "prefix", stats: { power: 5 } },
];

const suffixPool: readonly LootAffix[] = [
  { key: "of_the_echo", slot: "suffix", stats: { echoPower: 3 } },
  { key: "of_asterion", slot: "suffix", stats: { expeditionGain: 2 } },
  { key: "of_the_sentinel", slot: "suffix", stats: { sentinelDamage: 3 } },
];

const setPieces: Record<string, readonly string[]> = {
  asterion_regalia: ["aurion_spear", "asterion_blade", "warden_focus"],
  archive_vigil: ["archive_staff", "warden_focus", "ember_focus"],
};

export function resolveTreasureClass(classKey: string, roll: number): string {
  const entries = treasureCatalog[classKey];
  if (!entries || entries.length === 0) throw new Error("Unsupported treasure class");
  if (!Number.isInteger(roll) || roll < 0 || roll > 9_999) throw new Error("Treasure roll must be an integer from 0 through 9999");
  return entries[roll % entries.length] ?? entries[0]!;
}

export function resolveAffixes(quality: LootQuality, roll: number): LootAffix[] {
  if (!Number.isInteger(roll) || roll < 0 || roll > 9_999) throw new Error("Affix roll must be an integer from 0 through 9999");
  if (quality === "normal") return [];
  const prefix = prefixPool[roll % prefixPool.length]!;
  if (quality === "magic") return [prefix];
  const suffix = suffixPool[Math.floor(roll / 7) % suffixPool.length]!;
  return [prefix, suffix];
}

export function resolveSetKey(quality: LootQuality, baseItemKey: string): string | undefined {
  if (quality !== "set") return undefined;
  return Object.entries(setPieces).find(([, pieces]) => pieces.includes(baseItemKey))?.[0];
}

export function resolveLoot(classKey: string, qualityRoll: number, affixRoll: number, magicFind = 0): LootResolution {
  const quality = rollLootQuality(qualityRoll, magicFind);
  const baseItemKey = resolveTreasureClass(classKey, qualityRoll + affixRoll);
  return { baseItemKey, quality, affixes: resolveAffixes(quality, affixRoll), setKey: resolveSetKey(quality, baseItemKey) };
}

export function setBonusForOwnedPieces(setKey: string, ownedPieces: readonly string[]): Record<string, number> {
  const pieces = setPieces[setKey];
  if (!pieces) return {};
  const owned = pieces.filter(piece => ownedPieces.includes(piece)).length;
  if (owned < 2) return {};
  if (owned === 2) return { resonance: 6, guard: 4 };
  return { resonance: 12, guard: 8, echoPower: 6 };
}

export function canUseWeaponWithClass(selectedClass: "unbound" | PlayerClass, track: WeaponTrack): boolean {
  if (selectedClass === "unbound") return true;
  const allowed: Record<PlayerClass, readonly WeaponTrack[]> = {
    vanguard: ["blade", "spear"],
    seer: ["staff", "focus"],
    warden: ["spear", "focus"],
  };
  return allowed[selectedClass].includes(track);
}
