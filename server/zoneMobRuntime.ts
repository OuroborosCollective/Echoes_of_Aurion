import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob, ZoneMobState } from "../shared/zoneMobContract";
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

function sameMob(left: ConfirmedZoneMob, right: ConfirmedZoneMob): boolean {
  return left.entityId === right.entityId && left.state === right.state && left.position.x === right.position.x && left.position.z === right.position.z && left.targetEntityId === right.targetEntityId && left.health === right.health && left.maxHealth === right.maxHealth;
}

export function resolveMobCollisionMovement(from: Readonly<{ x: number; z: number }>, desired: Readonly<{ x: number; z: number }>) {
  return resolveWasdMobCollisionMovement(from, desired, (current, target) => worldNatureCollision.resolve(current, target));
}

/** Aurion-hosted mob runtime; donor formulas remain provenance, not a second authority. */
export class ZoneMobRuntime {
  private readonly states = new Map<string, MobRuntimeState>();
  private readonly orderedEntityIds: string[];

  constructor() {
    for (const definition of observatoryMobDefinitions) {
      this.states.set(definition.entityId, initialMobRuntimeState(definition, 0));
    }
    this.orderedEntityIds = Array.from(this.states.keys()).sort();
  }

  tick(presences: readonly ConfirmedZonePresence[], tick: number, frozenEntityIds: ReadonlySet<string> = NO_FROZEN_MOBS): boolean {
    let changed = false;
    for (const entityId of this.orderedEntityIds) {
      const current = this.states.get(entityId)!;
      const before = publicMobSnapshot(current);
      const next = frozenEntityIds.has(entityId) ? current : resolveMobFsmTick({ current, presences, tick, resolveMovement: resolveMobCollisionMovement });
      this.states.set(entityId, next);
      if (!sameMob(before, publicMobSnapshot(next))) changed = true;
    }
    return changed;
  }

  applyCombatState(entityId: string, values: { health: number; stamina?: number; nextAttackTick?: number }): MobRuntimeState | undefined {
    const current = this.states.get(entityId);
    if (!current) return undefined;
    const next = applyMobCombatState(current, values);
    this.states.set(entityId, next);
    return next;
  }

  /** Replay-only restoration of all mutable FSM fields. Definitions remain canonical content. */
  restoreRuntimeState(entityId: string, values: {
    x: number;
    z: number;
    health: number;
    stamina: number;
    state: string;
    targetEntityId: string | null;
    idleUntilTick: number;
    patrolIndex: number;
    nextAttackTick: number;
  }): void {
    const current = this.states.get(entityId);
    if (!current) throw new Error(`AURION_REPLAY_MOB_UNKNOWN:${entityId}`);
    const next: MobRuntimeState = Object.freeze({
      ...current,
      state: values.state as ZoneMobState,
      position: Object.freeze({ x: values.x, z: values.z }),
      targetEntityId: values.targetEntityId,
      idleUntilTick: values.idleUntilTick,
      patrolIndex: values.patrolIndex,
      health: values.health,
      stamina: values.stamina,
      nextAttackTick: values.nextAttackTick,
    });
    this.states.set(entityId, next);
  }

  snapshot(): readonly ConfirmedZoneMob[] {
    return Object.freeze(this.orderedEntityIds.map(entityId => publicMobSnapshot(this.states.get(entityId)!)));
  }

  stateFor(entityId: string): MobRuntimeState | undefined {
    return this.states.get(entityId);
  }

  orderedStates(): readonly MobRuntimeState[] {
    return Object.freeze(this.orderedEntityIds.map(entityId => this.states.get(entityId)!));
  }
}
