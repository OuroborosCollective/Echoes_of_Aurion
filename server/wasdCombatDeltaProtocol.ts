import { createARESeed, SeededARERng, WASD_GAMEPLAY_SOURCE_REVISION } from "./wasdAREDeterminism";

/** Historical donor provenance for the combat formula now hosted by Aurion. */
export const WASD_COMBAT_DELTA_SOURCE_REVISION = WASD_GAMEPLAY_SOURCE_REVISION;
export const WASD_COMBAT_DELTA_SOURCE_PATH = "server/src/modules/combat/CombatDeltaResolver.ts" as const;
export const WASD_COMBAT_DELTA_SOURCE_GIT_BLOB_SHA = "ee3985d61b7e021683ec80b61463691a4c3f5fa9" as const;

export type CombatDeltaAction = "melee" | "spell";
export interface CombatDeltaEntityView {
  id?: string | number;
  playerId?: string;
  npcId?: string;
  name?: string;
  stamina?: number;
  health?: number;
  skills?: { combat?: { level?: number } };
  identity?: { npcId?: string };
}
export type CombatEntropy = Readonly<{ hitU32: number; critU32: number; damageU32: number }>;
export interface CombatDeltaContext {
  tick: number;
  sequence: number;
  weaponBonus?: number;
  /** Aurion-owned addressable draws. Omit only for historical donor-parity callers. */
  entropy?: CombatEntropy;
}
export interface CombatDeltaResult { success: boolean; hit: boolean; damage: number; crit: boolean; killed: boolean; defenderHealth: number; reason?: "no_stamina" }
export interface CombatDelta { kind: "combat_delta"; action: CombatDeltaAction; tick: number; sequence: number; attackerId: string; defenderId: string; staminaDelta: number; healthDelta: number; result: CombatDeltaResult }
export interface CombatStatePatch { attacker: { id: string; stamina: number }; defender: { id: string; health: number } }

const STAMINA_COST = 8;
const U32_SPACE = 0x1_0000_0000;
function safeInteger(value: unknown, fallback: number): number { return Number.isFinite(value) ? Math.floor(value as number) : fallback; }
function stableEntityId(entity: CombatDeltaEntityView): string { return String(entity.id ?? entity.playerId ?? entity.npcId ?? entity.identity?.npcId ?? entity.name ?? "entity"); }
function combatLevel(entity: CombatDeltaEntityView): number { return Math.max(1, safeInteger(entity.skills?.combat?.level, 1)); }
function validU32(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff; }
function assertEntropy(entropy: CombatEntropy): void {
  if (!validU32(entropy.hitU32) || !validU32(entropy.critU32) || !validU32(entropy.damageU32))
    throw new Error("AURION_COMBAT_ENTROPY_INVALID");
}
function probabilityThreshold(probability: number): number {
  return Math.max(0, Math.min(U32_SPACE, Math.floor(probability * U32_SPACE)));
}

export function calculateCombatHitChance(attacker: CombatDeltaEntityView | number, defender: CombatDeltaEntityView | number): number {
  const atk = typeof attacker === "number" ? attacker : combatLevel(attacker);
  const def = typeof defender === "number" ? defender : combatLevel(defender);
  if (atk === def) return 0.65;
  if (atk >= 1000 && def <= 1) return 0.95;
  if (atk <= 1 && def >= 1000) return 0.3;
  const diff = (atk - def) / (atk + def);
  return Math.min(0.95, Math.max(0.3, 0.65 + diff * 0.3));
}

function createHistoricalCombatRng(action: CombatDeltaAction, attacker: CombatDeltaEntityView, defender: CombatDeltaEntityView, tick: number, sequence: number, weaponBonus: number): SeededARERng {
  return new SeededARERng(createARESeed(["combat_delta", action, stableEntityId(attacker), stableEntityId(defender), tick, sequence, weaponBonus, attacker.stamina ?? 0, defender.health ?? 0]));
}

export function resolveCombatDelta(action: CombatDeltaAction, attacker: CombatDeltaEntityView, defender: CombatDeltaEntityView, context: CombatDeltaContext): CombatDelta {
  const tick = safeInteger(context.tick, 0);
  const sequence = safeInteger(context.sequence, 0);
  const weaponBonus = safeInteger(context.weaponBonus, 0);
  const attackerId = stableEntityId(attacker), defenderId = stableEntityId(defender);
  const staminaBefore = typeof attacker.stamina === "number" ? attacker.stamina : 100;
  const healthBefore = typeof defender.health === "number" ? defender.health : 100;
  const staminaCost = action === "melee" ? STAMINA_COST : 0;
  if (action === "melee" && staminaBefore <= 0) return Object.freeze({ kind:"combat_delta", action, tick, sequence, attackerId, defenderId, staminaDelta:0, healthDelta:0, result:Object.freeze({ success:false, hit:false, damage:0, crit:false, killed:false, defenderHealth:healthBefore, reason:"no_stamina" }) });

  const entropy = context.entropy;
  const historicalRng = entropy ? null : createHistoricalCombatRng(action, attacker, defender, tick, sequence, weaponBonus);
  if (entropy) assertEntropy(entropy);

  const hitChance = calculateCombatHitChance(attacker, defender);
  const hit = entropy
    ? entropy.hitU32 < probabilityThreshold(hitChance)
    : historicalRng!.nextFloat() <= hitChance;
  if (!hit) return Object.freeze({ kind:"combat_delta", action, tick, sequence, attackerId, defenderId, staminaDelta:-staminaCost, healthDelta:0, result:Object.freeze({ success:true, hit:false, damage:0, crit:false, killed:false, defenderHealth:healthBefore }) });

  const crit = entropy
    ? entropy.critU32 < probabilityThreshold(0.08)
    : historicalRng!.nextFloat() < 0.08;
  const damageRoll = entropy ? entropy.damageU32 % 4 : historicalRng!.fork("damage").nextInt(4);
  const base = 5 + combatLevel(attacker) + Math.max(0, weaponBonus);
  const mitigation = Math.floor(combatLevel(defender) * 0.3);
  const baseDamage = Math.max(1, base - mitigation + damageRoll);
  const damage = crit ? Math.floor(baseDamage * 1.75) : baseDamage;
  const healthAfter = Math.max(0, healthBefore - damage);
  return Object.freeze({ kind:"combat_delta", action, tick, sequence, attackerId, defenderId, staminaDelta:-staminaCost, healthDelta:healthAfter-healthBefore, result:Object.freeze({ success:true, hit:true, damage, crit, killed:healthAfter<=0, defenderHealth:healthAfter }) });
}

export function reduceCombatDelta(attacker: CombatDeltaEntityView, defender: CombatDeltaEntityView, delta: CombatDelta): CombatStatePatch {
  const staminaBefore = typeof attacker.stamina === "number" ? attacker.stamina : 100;
  const healthBefore = typeof defender.health === "number" ? defender.health : 100;
  return Object.freeze({ attacker:Object.freeze({ id:delta.attackerId, stamina:Math.max(0, staminaBefore + delta.staminaDelta) }), defender:Object.freeze({ id:delta.defenderId, health:Math.max(0, healthBefore + delta.healthDelta) }) });
}
