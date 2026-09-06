import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob } from "../shared/zoneMobContract";
import { observatoryMobDefinitions } from "./ax1MobContent";
import { applyMobCombatState, initialMobRuntimeState, publicMobSnapshot, resolveMobFsmTick, type MobRuntimeState } from "./wasdMobFsmProtocol";
import { WASD_MOB_COLLISION_SUBSTEP_MAX_MM, mobCollisionSubsteps, resolveWasdMobCollisionMovement } from "./wasdMobCollisionProtocol";
import { worldNatureCollision } from "./worldNatureCollision";

export const MOB_COLLISION_SUBSTEP_MAX_MM = WASD_MOB_COLLISION_SUBSTEP_MAX_MM;
export { mobCollisionSubsteps };

function sameMob(left: ConfirmedZoneMob, right: ConfirmedZoneMob): boolean { return left.entityId === right.entityId && left.state === right.state && left.position.x === right.position.x && left.position.z === right.position.z && left.targetEntityId === right.targetEntityId && left.health === right.health && left.maxHealth === right.maxHealth; }

/** Concrete geometry adapter only; sweep sequencing belongs to WASD. */
export function resolveMobCollisionMovement(from: Readonly<{ x: number; z: number }>, desired: Readonly<{ x: number; z: number }>) {
  return resolveWasdMobCollisionMovement(from, desired, (current, target) => worldNatureCollision.resolve(current, target));
}

/** Server orchestration: AX1 content + WASD state transitions + persisted world geometry. */
export class ZoneMobRuntime {
  private readonly states = new Map<string, MobRuntimeState>();
  constructor() { observatoryMobDefinitions.forEach(definition => this.states.set(definition.entityId, initialMobRuntimeState(definition, 0))); }

  tick(presences: readonly ConfirmedZonePresence[], tick: number): boolean {
    let changed = false;
    for (const entityId of [...this.states.keys()].sort()) {
      const current = this.states.get(entityId)!, before = publicMobSnapshot(current);
      const next = resolveMobFsmTick({ current, presences, tick, resolveMovement: resolveMobCollisionMovement });
      this.states.set(entityId, next);
      if (!sameMob(before, publicMobSnapshot(next))) changed = true;
    }
    return changed;
  }

  applyCombatState(entityId: string, values: { health: number; stamina?: number; nextAttackTick?: number }): MobRuntimeState | undefined {
    const current = this.states.get(entityId); if (!current) return undefined;
    const next = applyMobCombatState(current, values); this.states.set(entityId, next); return next;
  }

  snapshot(): readonly ConfirmedZoneMob[] { return Object.freeze([...this.states.values()].map(publicMobSnapshot).sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0)); }
  stateFor(entityId: string): MobRuntimeState | undefined { return this.states.get(entityId); }
  orderedStates(): readonly MobRuntimeState[] { return Object.freeze([...this.states.values()].sort((a, b) => a.definition.entityId < b.definition.entityId ? -1 : a.definition.entityId > b.definition.entityId ? 1 : 0)); }
}
