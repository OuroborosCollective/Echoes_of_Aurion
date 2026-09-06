import { createHash } from "node:crypto";
import { validWorldPosition, type ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob, ZoneMobArchetype, ZoneMobState } from "../shared/zoneMobContract";

export const WASD_MOB_FSM_RULESET = "wasd-mob-fsm.v1" as const;
export const WASD_MOB_LEASH_DISTANCE_FIXED = 48_000;
export const WASD_MOB_EVADE_RETURN_DISTANCE_FIXED = 3_000;
export const WASD_MOB_COMBAT_DROPOFF_MULTIPLIER_BPS = 19_000;

export type WasdMobPosition = Readonly<{ x: number; z: number }>;
export type MobDefinition = Readonly<{
  entityId: string;
  archetype: ZoneMobArchetype;
  level: number;
  homePosition: WasdMobPosition;
  isBoss: boolean;
  isElite: boolean;
  attackRangeFixed: number;
  attackCooldownTicks: number;
  maxHealth: number;
}>;
export type MobRuntimeState = Readonly<{
  definition: MobDefinition;
  state: ZoneMobState;
  position: WasdMobPosition;
  targetEntityId: string | null;
  idleUntilTick: number;
  patrolIndex: number;
  health: number;
  maxHealth: number;
  stamina: number;
  nextAttackTick: number;
}>;

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function mobDistance(left: WasdMobPosition, right: WasdMobPosition): number { return Math.hypot(left.x - right.x, left.z - right.z); }
function distanceSquared(left: WasdMobPosition, right: WasdMobPosition): number { const dx = left.x - right.x, dz = left.z - right.z; return dx * dx + dz * dz; }
function hash32(value: string): number { return createHash("sha256").update(value, "utf8").digest().readUInt32BE(0) >>> 0; }
function idleDurationTicks(entityId: string, startTick: number): number { return 20 + hash32(`${WASD_MOB_FSM_RULESET}:${entityId}:${startTick}`) % 31; }
export function wasdMobAggroRadiusFixed(definition: MobDefinition): number { return definition.isBoss ? 28_000 : definition.isElite ? 22_000 : 16_000; }
function patrolRadius(definition: MobDefinition): number { return definition.isBoss ? 3_500 : 6_500; }
const patrolDirections = Object.freeze([[1_000, 0], [707, 707], [0, 1_000], [-707, 707], [-1_000, 0], [-707, -707], [0, -1_000], [707, -707]] as const);
function patrolTarget(state: MobRuntimeState): WasdMobPosition { const [dx, dz] = patrolDirections[state.patrolIndex % patrolDirections.length]!; const radius = patrolRadius(state.definition); return Object.freeze({ x: state.definition.homePosition.x + Math.trunc(dx * radius / 1_000), z: state.definition.homePosition.z + Math.trunc(dz * radius / 1_000) }); }
function stepToward(from: WasdMobPosition, to: WasdMobPosition, maximumStep: number): WasdMobPosition { const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz); if (distance === 0 || distance <= maximumStep) return Object.freeze({ x: to.x, z: to.z }); return Object.freeze({ x: from.x + Math.round(dx / distance * maximumStep), z: from.z + Math.round(dz / distance * maximumStep) }); }
function assertRuntimeInput(state: MobRuntimeState, presences: readonly ConfirmedZonePresence[], tick: number): void { if (!Number.isSafeInteger(tick) || tick < 0 || !validWorldPosition(state.position) || !validWorldPosition(state.definition.homePosition)) throw new Error("WASD_MOB_FSM_INPUT_INVALID"); const ids = new Set<string>(); for (const presence of presences) { if (!presence || presence.entityId !== `player:${presence.userId}` || !validWorldPosition(presence.position) || ids.has(presence.entityId)) throw new Error("WASD_MOB_FSM_PRESENCE_INVALID"); ids.add(presence.entityId); } }

export function initialMobRuntimeState(definition: MobDefinition, tick = 0): MobRuntimeState {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("WASD_MOB_FSM_TICK_INVALID");
  return Object.freeze({ definition, state: "idle", position: definition.homePosition, targetEntityId: null, idleUntilTick: tick + idleDurationTicks(definition.entityId, tick), patrolIndex: hash32(definition.entityId) % patrolDirections.length, health: definition.maxHealth, maxHealth: definition.maxHealth, stamina: 100, nextAttackTick: tick });
}

export function nearestAggroTarget(definition: MobDefinition, position: WasdMobPosition, presences: readonly ConfirmedZonePresence[]): ConfirmedZonePresence | null {
  const limit = wasdMobAggroRadiusFixed(definition), limitSquared = limit * limit;
  return presences.filter(presence => distanceSquared(position, presence.position) <= limitSquared).slice().sort((left, right) => distanceSquared(position, left.position) - distanceSquared(position, right.position) || compareText(left.entityId, right.entityId))[0] ?? null;
}

export function resolveMobFsmTick(input: Readonly<{ current: MobRuntimeState; presences: readonly ConfirmedZonePresence[]; tick: number; resolveMovement?: (from: WasdMobPosition, desired: WasdMobPosition) => WasdMobPosition }>): MobRuntimeState {
  const { current, presences, tick } = input; assertRuntimeInput(current, presences, tick);
  if (current.health <= 0) return current.state === "dead" && current.targetEntityId === null ? current : Object.freeze({ ...current, state: "dead", targetEntityId: null, health: 0 });
  const definition = current.definition, resolveMovement = input.resolveMovement ?? ((_from, desired) => desired);
  const move = (desired: WasdMobPosition) => { const resolved = resolveMovement(current.position, desired); if (!validWorldPosition(resolved)) throw new Error("WASD_MOB_FSM_MOVEMENT_INVALID"); return Object.freeze({ x: resolved.x, z: resolved.z }); };
  const presenceById = new Map(presences.map(presence => [presence.entityId, presence] as const));
  if (current.state === "evading") {
    if (mobDistance(current.position, definition.homePosition) <= WASD_MOB_EVADE_RETURN_DISTANCE_FIXED) return Object.freeze({ ...current, state: "idle", position: definition.homePosition, targetEntityId: null, idleUntilTick: tick + idleDurationTicks(definition.entityId, tick), health: definition.maxHealth, stamina: 100 });
    return Object.freeze({ ...current, targetEntityId: null, position: move(stepToward(current.position, definition.homePosition, 750)) });
  }
  if (current.state === "combat") {
    const target = current.targetEntityId ? presenceById.get(current.targetEntityId) : undefined;
    const leashBroken = mobDistance(current.position, definition.homePosition) > WASD_MOB_LEASH_DISTANCE_FIXED;
    if (!target || leashBroken) return Object.freeze({ ...current, state: "evading", targetEntityId: null });
    const targetDistance = mobDistance(current.position, target.position), dropoff = Math.trunc(wasdMobAggroRadiusFixed(definition) * WASD_MOB_COMBAT_DROPOFF_MULTIPLIER_BPS / 10_000);
    if (targetDistance > dropoff) return Object.freeze({ ...current, state: "evading", targetEntityId: null });
    if (targetDistance <= definition.attackRangeFixed) return current;
    return Object.freeze({ ...current, position: move(stepToward(current.position, target.position, definition.isBoss ? 550 : 450)) });
  }
  const acquired = nearestAggroTarget(definition, current.position, presences);
  if (acquired) return Object.freeze({ ...current, state: "combat", targetEntityId: acquired.entityId });
  if (current.state === "idle") return tick < current.idleUntilTick ? current : Object.freeze({ ...current, state: "patrolling", targetEntityId: null });
  const target = patrolTarget(current);
  if (mobDistance(current.position, target) <= 500) return Object.freeze({ ...current, patrolIndex: (current.patrolIndex + 1) % patrolDirections.length });
  return Object.freeze({ ...current, position: move(stepToward(current.position, target, 425)), targetEntityId: null });
}

export function applyMobCombatState(current: MobRuntimeState, values: { health: number; stamina?: number; nextAttackTick?: number }): MobRuntimeState {
  const health = Math.max(0, Math.min(current.maxHealth, Math.floor(values.health)));
  const stamina = values.stamina === undefined ? current.stamina : Math.max(0, Math.min(100, Math.floor(values.stamina)));
  const nextAttackTick = values.nextAttackTick === undefined ? current.nextAttackTick : Math.max(0, Math.floor(values.nextAttackTick));
  return Object.freeze({ ...current, health, stamina, nextAttackTick, state: health === 0 ? "dead" : current.state, targetEntityId: health === 0 ? null : current.targetEntityId });
}

export function publicMobSnapshot(state: MobRuntimeState): ConfirmedZoneMob {
  return Object.freeze({ entityId: state.definition.entityId, archetype: state.definition.archetype, level: state.definition.level, state: state.state, position: Object.freeze({ x: state.position.x, z: state.position.z }), targetEntityId: state.targetEntityId, isBoss: state.definition.isBoss, isElite: state.definition.isElite, health: state.health, maxHealth: state.maxHealth });
}
