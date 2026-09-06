import type { ZoneMobArchetype } from "../shared/zoneMobContract";

/**
 * Read-only projection of combat-facing content from OuroborosCollective/-ax1.
 * AX1 owns the game surface/scaffolding; it does NOT resolve authoritative hits.
 * Gameplay transitions are resolved by the pinned WASD reducer.
 */
export const AX1_GAME_SOURCE_REVISION = "d356881538dae23c3aa97364a5596d48b6ac3079" as const;
export const AX1_MOB_SOURCE_PATH = "src/entities/MobManager.ts" as const;
export const AX1_STARTER_SOURCE_PATH = "src/data/mmorpgData.ts" as const;
export const AX1_MOB_SOURCE_GIT_BLOB_SHA = "" as const;
export const AX1_STARTER_BLADE_ITEM_ID = "item_sword_starter" as const;
export const AX1_STARTER_BLADE_NAME = "Apprentice Steel Blade" as const;
export const AX1_STARTER_BLADE_ATTACK_BONUS = 15 as const;
export const AX1_STARTER_BLADE_MAX_HP_BONUS = 20 as const;
export const AX1_PLAYER_BASIC_MELEE_RANGE_FIXED = 4_500 as const;

export type Ax1MobProjection = Readonly<{
  maxHealth: number;
  attackRangeFixed: number;
  attackCooldownTicks: number;
}>;

const rangeMeters: Readonly<Record<ZoneMobArchetype, number>> = Object.freeze({
  clockwork_stalker: 2.8,
  aether_wisp: 14,
  corrupted_golem: 2.8,
  steam_drake: 12,
  centurion_elite: 2.8,
  titan_boss: 5,
});

/** AX1's authored cooldowns expressed on WASD/Aurion's canonical 10 Hz tick. */
const cooldownTicks: Readonly<Record<ZoneMobArchetype, number>> = Object.freeze({
  clockwork_stalker: 18,
  aether_wisp: 25,
  corrupted_golem: 18,
  steam_drake: 18,
  centurion_elite: 18,
  titan_boss: 25,
});

/**
 * Exact health formula projection for regular AX1 mob archetypes. The world boss
 * uses AX1's explicit 5200 HP definition rather than the regular formula.
 */
export function ax1MobMaxHealth(archetype: ZoneMobArchetype, level: number): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > 10_000) throw new Error("AX1_MOB_LEVEL_INVALID");
  switch (archetype) {
    case "aether_wisp": return 140 + level * 35;
    case "corrupted_golem": return 360 + level * 75;
    case "centurion_elite": return 780 + level * 120;
    case "steam_drake": return 420 + level * 80;
    case "titan_boss": return 5_200;
    case "clockwork_stalker": return 180 + level * 45;
  }
}

export function ax1MobCombatProjection(archetype: ZoneMobArchetype, level: number): Ax1MobProjection {
  return Object.freeze({
    maxHealth: ax1MobMaxHealth(archetype, level),
    attackRangeFixed: Math.round(rangeMeters[archetype] * 1_000),
    attackCooldownTicks: cooldownTicks[archetype],
  });
}

export function ax1StarterWeaponBonus(weaponTrack: "blade" | "staff" | "spear" | "focus" | null | undefined): number {
  // AX1's explicit new-character loadout is the Apprentice Steel Blade. Other
  // tracks must be backed by their own persisted item before they gain a bonus.
  return weaponTrack === "blade" ? AX1_STARTER_BLADE_ATTACK_BONUS : 0;
}
