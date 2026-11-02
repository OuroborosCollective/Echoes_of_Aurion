import type { Ax1BladeSkillId } from "./ax1BladeSkillProtocol";
/** Aurion v4 tuning. Historical donor definitions remain provenance only. */
export const AURION_COMBAT_RULES = {
  basic: { cost: 8, cooldown: 8, range: 4500, power: 100 },
  k_strike: { cost: 12, cooldown: 8, range: 4500, power: 150 },
  k_charge: { cost: 20, cooldown: 50, range: 16000, power: 100 },
  k_shield: { cost: 20, cooldown: 80, range: 0, power: 0 },
  k_whirlwind: { cost: 30, cooldown: 120, range: 6000, power: 85 },
  k_overdrive: { cost: 15, cooldown: 200, range: 0, power: 0 },
} as const;
export function combatRule(skill: Ax1BladeSkillId | null) {
  return AURION_COMBAT_RULES[skill ?? "basic"];
}
export interface CombatEffects {
  attackUntil?: number;
  shieldUntil?: number;
  overdriveUntil?: number;
  slowUntil?: number;
}
export interface CombatWindup {
  mobId: string;
  targetId: string;
  startTick: number;
  impactTick: number;
  sequence: number;
  origin: { x: number; z: number };
  target: { x: number; z: number };
  width: number;
}
export interface ZoneCombatTactics {
  effects: Record<string, CombatEffects>;
  windups: CombatWindup[];
}
/** Squared distance to the fixed, announced attack segment; no target homing. */
export function insideCombatLine(
  point: { x: number; z: number },
  windup: CombatWindup
): boolean {
  const dx = windup.target.x - windup.origin.x,
    dz = windup.target.z - windup.origin.z;
  const length = dx * dx + dz * dz;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - windup.origin.x) * dx +
              (point.z - windup.origin.z) * dz) /
              length
          )
        );
  return (
    (point.x - windup.origin.x - t * dx) ** 2 +
      (point.z - windup.origin.z - t * dz) ** 2 <=
    (windup.width / 2) ** 2
  );
}

export const COMBAT_SKILL_DESCRIPTIONS = {
  k_strike: "Kräftiger Hieb: 150 % Schaden",
  k_charge: "Ansturm: unterbricht und verlangsamt für 3 s",
  k_shield: "Schild: 60 % weniger Schaden für 3 s",
  k_whirlwind: "Wirbel: 85 % Schaden an Gegnern im Umkreis von 6 m",
  k_overdrive: "Overdrive: 50 % mehr Schaden für 5 s",
} as const;
