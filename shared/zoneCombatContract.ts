import { AX1_BLADE_SKILL_SOURCE_REVISION, isAx1BladeSkillId } from "./ax1BladeSkillProtocol";

export const ZONE_COMBAT_CONTRACT_VERSION = "zone-combat.v1" as const;

export type ConfirmedZoneCombatEvent = Readonly<{
  type: "combat";
  contractVersion: typeof ZONE_COMBAT_CONTRACT_VERSION;
  tick: number;
  sequence: number;
  action: string;
  skillId: string | null;
  skillSourceRevision: string | null;
  attackerEntityId: string;
  defenderEntityId: string;
  hit: boolean;
  damage: number;
  crit: boolean;
  killed: boolean;
  defenderHealth: number;
  attackerStamina: number;
  gameplaySourceRevision: string;
}>;

export type ConfirmedZoneCombatant = Readonly<{
  entityId: string;
  health: number;
  maxHealth: number;
  combatLevel?: number;
  weaponBonus?: number;
}>;

export function validConfirmedZoneCombatEvent(value: unknown): value is ConfirmedZoneCombatEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.type !== "combat" ||
    v.contractVersion !== ZONE_COMBAT_CONTRACT_VERSION ||
    typeof v.tick !== "number" ||
    typeof v.sequence !== "number" ||
    typeof v.attackerEntityId !== "string" ||
    typeof v.defenderEntityId !== "string" ||
    typeof v.damage !== "number" ||
    typeof v.hit !== "boolean" ||
    typeof v.crit !== "boolean" ||
    typeof v.killed !== "boolean" ||
    typeof v.defenderHealth !== "number" ||
    typeof v.attackerStamina !== "number" ||
    typeof v.gameplaySourceRevision !== "string"
  ) {
    return false;
  }

  if (v.skillId !== null) {
    if (!isAx1BladeSkillId(v.skillId) || v.skillSourceRevision !== AX1_BLADE_SKILL_SOURCE_REVISION) {
      return false;
    }
  } else if (v.skillSourceRevision !== null) {
    return false;
  }

  return true;
}

export function validConfirmedZoneCombatants(value: unknown): value is readonly ConfirmedZoneCombatant[] {
  if (!Array.isArray(value)) return false;
  return value.every(item => (
    item &&
    typeof item === "object" &&
    typeof item.entityId === "string" &&
    typeof item.health === "number" &&
    typeof item.maxHealth === "number"
  ));
}
