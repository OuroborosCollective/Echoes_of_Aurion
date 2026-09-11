import type { MobDefinition } from "./wasdMobFsmProtocol";

/**
 * Aurion integration policy for server-confirmed AX1 telegraph presentation.
 * AX1 supplies the visual language; these windup timings are not claimed as AX1 source data.
 */
export const AURION_ELITE_MELEE_WINDUP_TICKS = 6 as const;
export const AURION_BOSS_MELEE_WINDUP_TICKS = 10 as const;

export function zoneMobTelegraphWindupTicks(
  definition: Pick<MobDefinition, "isBoss" | "isElite">
): number {
  if (definition.isBoss) return AURION_BOSS_MELEE_WINDUP_TICKS;
  if (definition.isElite) return AURION_ELITE_MELEE_WINDUP_TICKS;
  return 0;
}

export function zoneMobTelegraphWidthFixed(
  definition: Pick<MobDefinition, "isBoss" | "isElite" | "attackRangeFixed">
): number {
  if (!definition.isBoss && !definition.isElite) return 0;
  return Math.max(500, Math.min(8_000, Math.round(definition.attackRangeFixed * 0.6)));
}
