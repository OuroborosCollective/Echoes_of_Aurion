export const ZONE_COMBAT_CONTRACT_VERSION = "wasd-zone-combat.v1" as const;
export const ZONE_COMBAT_MAX_STAMINA = 100 as const;
export const ZONE_MAX_COMBATANTS = 160 as const;

export type ConfirmedZoneCombatant = Readonly<{
  entityId: string;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  alive: boolean;
  combatLevel: number;
  lastCombatSequence: number;
}>;

export type ConfirmedZoneCombatEvent = Readonly<{
  type: "combat";
  contractVersion: typeof ZONE_COMBAT_CONTRACT_VERSION;
  tick: number;
  sequence: number;
  action: "melee";
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

function validEntityId(value: unknown): value is string {
  return typeof value === "string" && (/^player:[1-9][0-9]*$/.test(value) || /^mob_[1-9][0-9]{0,2}$/.test(value));
}

export function validConfirmedZoneCombatants(value: unknown): value is ConfirmedZoneCombatant[] {
  if (!Array.isArray(value) || value.length > ZONE_MAX_COMBATANTS) return false;
  const ids = new Set<string>();
  let previous = "";
  return value.every((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return false;
    const state = candidate as ConfirmedZoneCombatant;
    if (!validEntityId(state.entityId) || ids.has(state.entityId) || (index > 0 && state.entityId <= previous)) return false;
    ids.add(state.entityId); previous = state.entityId;
    if (![state.health,state.maxHealth,state.stamina,state.maxStamina,state.combatLevel,state.lastCombatSequence].every(Number.isSafeInteger)) return false;
    if (state.maxHealth < 1 || state.health < 0 || state.health > state.maxHealth || state.maxStamina < 1 || state.stamina < 0 || state.stamina > state.maxStamina) return false;
    if (state.combatLevel < 1 || state.combatLevel > 10_000 || state.lastCombatSequence < 0) return false;
    return typeof state.alive === "boolean" && state.alive === (state.health > 0);
  });
}

export function validConfirmedZoneCombatEvent(value: unknown): value is ConfirmedZoneCombatEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as ConfirmedZoneCombatEvent;
  return event.type === "combat" && event.contractVersion === ZONE_COMBAT_CONTRACT_VERSION && event.action === "melee"
    && Number.isSafeInteger(event.tick) && event.tick >= 0 && Number.isSafeInteger(event.sequence) && event.sequence >= 1
    && validEntityId(event.attackerEntityId) && validEntityId(event.defenderEntityId) && event.attackerEntityId !== event.defenderEntityId
    && typeof event.hit === "boolean" && Number.isSafeInteger(event.damage) && event.damage >= 0 && typeof event.crit === "boolean" && typeof event.killed === "boolean"
    && Number.isSafeInteger(event.defenderHealth) && event.defenderHealth >= 0 && Number.isSafeInteger(event.attackerStamina) && event.attackerStamina >= 0
    && typeof event.gameplaySourceRevision === "string" && /^[0-9a-f]{40}$/.test(event.gameplaySourceRevision);
}
