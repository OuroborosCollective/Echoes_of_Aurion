import {
  AURION_RETURN_STONE_LIVE_ZONE,
  AURION_RETURN_STONE_POSITION,
  AURION_RETURN_STONE_REVIVE_DELAY_TICKS,
} from "../shared/aurionReturnStoneContract";
import { WASD_MAX_STAMINA } from "./wasdStaminaProtocol";

export type ReturnStoneRevivalInput = Readonly<{
  zoneId: string;
  tick: number;
  health: number;
  maxHealth: number;
  stamina: number;
  lastCombatSequence: number;
}>;

export type ReturnStoneRevivalPatch = Readonly<{
  health: number;
  stamina: number;
  position: Readonly<{ x: number; z: number }>;
  deathTick: number;
  reviveTick: number;
}>;

/**
 * Pure deterministic revival policy. A visual GLB is intentionally absent from
 * the input: the mesh can disappear without changing gameplay truth.
 */
export function resolveReturnStoneRevival(input: ReturnStoneRevivalInput): ReturnStoneRevivalPatch | null {
  if (input.zoneId !== AURION_RETURN_STONE_LIVE_ZONE || input.health > 0) return null;
  if (!Number.isSafeInteger(input.tick) || input.tick < 0 || !Number.isSafeInteger(input.lastCombatSequence) || input.lastCombatSequence <= 0) return null;
  if (!Number.isFinite(input.maxHealth) || input.maxHealth <= 0) return null;

  const deathTick = Math.floor(input.lastCombatSequence / 1000);
  const reviveTick = deathTick + AURION_RETURN_STONE_REVIVE_DELAY_TICKS;
  if (input.tick < reviveTick) return null;

  return Object.freeze({
    health: input.maxHealth,
    stamina: WASD_MAX_STAMINA,
    position: AURION_RETURN_STONE_POSITION,
    deathTick,
    reviveTick,
  });
}
