import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob, ZoneMobState } from "../shared/zoneMobContract";
import type { CanonicalMobState } from "./causality/zoneCanonicalState";
import { observatoryMobDefinitions } from "./ax1MobContent";
import {
  applyMobCombatState,
  initialMobRuntimeState,
  publicMobSnapshot,
  resolveMobFsmTick,
  type MobRuntimeState,
} from "./wasdMobFsmProtocol";
import {
  WASD_MOB_COLLISION_SUBSTEP_MAX_MM,
  mobCollisionSubsteps,
  resolveWasdMobCollisionMovement,
} from "./wasdMobCollisionProtocol";
import { worldNatureCollision } from "./worldNatureCollision";

export const MOB_COLLISION_SUBSTEP_MAX_MM = WASD_MOB_COLLISION_SUBSTEP_MAX_MM;
export { mobCollisionSubsteps };
const NO_FROZEN_MOBS: ReadonlySet<string> = new Set<string>();
const CANONICAL_MOB_STATES = new Set<ZoneMobState>(["idle", "patrolling", "combat", "evading", "dead"]);

function sameMob(left: ConfirmedZoneMob, right: ConfirmedZoneMob): boolean {
  return left.entityId === right.entityId && left.state === right.state && left.position.x === right.position.x && left.position.z === right.position.z && left.targetEntityId === right.targetEntityId && left.health === right.health && left.maxHealth === right.maxHealth;
}

export function resolveMobCollisionMovement(from: Readonly<{ x: number; z: number }>, desired: Readonly<{ x: number; z: number }>) {
  return resolveWasdMobCollisionMovement(from, desired, (current, target) => worldNatureCollision.resolve(current, target));
}

/** Aurion-hosted mob runtime; donor formulas remain historical provenance. */
export class ZoneMobRuntime {
  private readonly states = new Map<string, MobRuntimeState>();
  private readonly orderedEntityIds: string[];
  private readonly cachedOrderedStates: MobRuntimeState[] = [];
  private readonly entityIdToIndex = new Map<string, number>();

  constructor() {
    for (const definition of observatoryMobDefinitions) {
      this.states.set(definition.entityId, initialMobRuntimeState(definition, 0));
    }
    this.orderedEntityIds = Array.from(this.states.keys()).sort();
    for (let i = 0; i < this.orderedEntityIds.length; i++) {
      const entityId = this.orderedEntityIds[i];
      this.entityIdToIndex.set(entityId, i);
      this.cachedOrderedStates.push(this.states.get(entityId)!);
    }
  }

  private updateState(entityId: string, next: MobRuntimeState): void {
    this.states.set(entityId, next);
    const index = this.entityIdToIndex.get(entityId);
    if (index !== undefined) {
      this.cachedOrderedStates[index] = next;
    }
  }

  tick(presences: readonly ConfirmedZonePresence[], tick: number, frozenEntityIds: ReadonlySet<string> = NO_FROZEN_MOBS): boolean {
    let changed = false;
    for (const entityId of this.orderedEntityIds) {
      const current = this.states.get(entityId)!;
      const before = publicMobSnapshot(current);
      const next = frozenEntityIds.has(entityId) ? current : resolveMobFsmTick({ current, presences, tick, resolveMovement: resolveMobCollisionMovement });
      this.updateState(entityId, next);
      if (!sameMob(before, publicMobSnapshot(next))) changed = true;
    }
    return changed;
  }

  applyCombatState(entityId: string, values: { health: number; stamina?: number; nextAttackTick?: number }): MobRuntimeState | undefined {
    const current = this.states.get(entityId);
    if (!current) return undefined;
    const next = applyMobCombatState(current, values);
    this.updateState(entityId, next);
    return next;
  }

  /** Replay restoration is fail-closed and covers every mutable FSM field in CanonicalZoneState. */
  restoreCanonicalState(mob: CanonicalMobState): MobRuntimeState {
    const current = this.states.get(mob.entityId);
    if (!current || mob.mobId !== mob.entityId) throw new Error("ZONE_MOB_RESTORE_IDENTITY_INVALID");
    if (mob.archetype !== undefined && mob.archetype !== current.definition.archetype) throw new Error("ZONE_MOB_RESTORE_ARCHETYPE_INVALID");
    if (mob.maxHealth !== current.definition.maxHealth) throw new Error("ZONE_MOB_RESTORE_MAX_HEALTH_INVALID");
    if (!Number.isSafeInteger(mob.x) || !Number.isSafeInteger(mob.z)) throw new Error("ZONE_MOB_RESTORE_POSITION_INVALID");
    if (!Number.isSafeInteger(mob.health) || mob.health < 0 || mob.health > mob.maxHealth) throw new Error("ZONE_MOB_RESTORE_HEALTH_INVALID");
    if (!Number.isSafeInteger(mob.stamina) || mob.stamina < 0 || mob.stamina > 100) throw new Error("ZONE_MOB_RESTORE_STAMINA_INVALID");
    if (!Number.isSafeInteger(mob.idleUntilTick) || mob.idleUntilTick < 0) throw new Error("ZONE_MOB_RESTORE_IDLE_TICK_INVALID");
    if (!Number.isSafeInteger(mob.patrolIndex) || mob.patrolIndex < 0) throw new Error("ZONE_MOB_RESTORE_PATROL_INDEX_INVALID");
    if (!Number.isSafeInteger(mob.nextAttackTick) || mob.nextAttackTick < 0) throw new Error("ZONE_MOB_RESTORE_ATTACK_TICK_INVALID");
    if (!CANONICAL_MOB_STATES.has(mob.state as ZoneMobState)) throw new Error("ZONE_MOB_RESTORE_STATE_INVALID");
    if (mob.health === 0 && mob.state !== "dead") throw new Error("ZONE_MOB_RESTORE_DEAD_STATE_INVALID");
    if (mob.targetEntityId !== null && typeof mob.targetEntityId !== "string") throw new Error("ZONE_MOB_RESTORE_TARGET_INVALID");

    const next: MobRuntimeState = Object.freeze({
      ...current,
      state: mob.state as ZoneMobState,
      position: Object.freeze({ x: mob.x, z: mob.z }),
      targetEntityId: mob.targetEntityId,
      idleUntilTick: mob.idleUntilTick,
      patrolIndex: mob.patrolIndex,
      health: mob.health,
      maxHealth: mob.maxHealth,
      stamina: mob.stamina,
      nextAttackTick: mob.nextAttackTick,
    });
    this.updateState(mob.entityId, next);
    return next;
  }

  snapshot(): readonly ConfirmedZoneMob[] {
    const snapshotArray = new Array<ConfirmedZoneMob>(this.cachedOrderedStates.length);
    for (let i = 0; i < this.cachedOrderedStates.length; i++) {
      snapshotArray[i] = publicMobSnapshot(this.cachedOrderedStates[i]);
    }
    return Object.freeze(snapshotArray);
  }
  stateFor(entityId: string): MobRuntimeState | undefined { return this.states.get(entityId); }

  /** Development-only fixture reset using the same canonical mob definitions as live runtime. */
  resetDevelopmentFixture(tick: number): void {
    if (process.env.NODE_ENV === "production") throw new Error("ZONE_MOB_FIXTURE_PRODUCTION_FORBIDDEN");
    if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("ZONE_MOB_FIXTURE_TICK_INVALID");
    for (const definition of observatoryMobDefinitions) {
      this.updateState(definition.entityId, initialMobRuntimeState(definition, tick));
    }
  }

  /** Development-only bounded encounter selection over existing canonical mobs. */
  seedDevelopmentEncounter(fixtureType: "starter_encounter" | "boss_encounter" | "npc_dialogue_fixture"): readonly string[] {
    const ids = fixtureType === "boss_encounter"
      ? ["mob_6"]
      : fixtureType === "npc_dialogue_fixture"
        ? ["mob_1", "mob_2"]
        : ["mob_1", "mob_2", "mob_3"];
    return Object.freeze(ids.map(entityId => {
      const current = this.states.get(entityId);
      if (!current) throw new Error("ZONE_MOB_FIXTURE_ID_INVALID");
      const seeded: MobRuntimeState = Object.freeze({
        ...current,
        state: "patrolling",
        targetEntityId: null,
        idleUntilTick: 0,
        nextAttackTick: current.nextAttackTick,
      });
      this.updateState(entityId, seeded);
      return entityId;
    }));
  }

  orderedStates(): readonly MobRuntimeState[] { return this.cachedOrderedStates; }
}
