import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob } from "../shared/zoneMobContract";
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
  return (
    left.entityId === right.entityId &&
    left.state === right.state &&
    left.position.x === right.position.x &&
    left.position.z === right.position.z &&
    left.targetEntityId === right.targetEntityId &&
    left.health === right.health &&
    left.maxHealth === right.maxHealth
  );
}

/** Concrete geometry adapter only; sweep sequencing belongs to WASD. */
export function resolveMobCollisionMovement(
  from: Readonly<{ x: number; z: number }>,
  desired: Readonly<{ x: number; z: number }>
) {
  return resolveWasdMobCollisionMovement(from, desired, (current, target) =>
    worldNatureCollision.resolve(current, target)
  );
}

/** Server orchestration: AX1 content + WASD state transitions + persisted world geometry. */
export class ZoneMobRuntime {
  private readonly states = new Map<string, MobRuntimeState>();
  // Performance optimization: cache the sorted array of states for static mobs to avoid O(N) array allocation
  // and O(1) Map `.get()` lookups inside the high-frequency game loop `tick()`.
  private readonly cachedOrderedStates: MobRuntimeState[] = [];

  constructor() {
    observatoryMobDefinitions.forEach(definition =>
      this.states.set(
        definition.entityId,
        initialMobRuntimeState(definition, 0)
      )
    );
    const orderedEntityIds = Array.from(this.states.keys()).sort();
    for (const entityId of orderedEntityIds) {
      this.cachedOrderedStates.push(this.states.get(entityId)!);
    }
  }

  tick(
    presences: readonly ConfirmedZonePresence[],
    tick: number,
    frozenEntityIds: ReadonlySet<string> = NO_FROZEN_MOBS
  ): boolean {
    let changed = false;
    // Iterate over the cached array, updating both the Map and the cache in place
    for (let i = 0; i < this.cachedOrderedStates.length; i++) {
      const current = this.cachedOrderedStates[i]!;
      const before = publicMobSnapshot(current);
      const next = frozenEntityIds.has(current.definition.entityId)
        ? current
        : resolveMobFsmTick({
            current,
            presences,
            tick,
            resolveMovement: resolveMobCollisionMovement,
          });

      if (current !== next) {
        this.states.set(current.definition.entityId, next);
        this.cachedOrderedStates[i] = next;
      }

      if (!sameMob(before, publicMobSnapshot(next))) changed = true;
    }
    return changed;
  }

  applyCombatState(
    entityId: string,
    values: { health: number; stamina?: number; nextAttackTick?: number }
  ): MobRuntimeState | undefined {
    const current = this.states.get(entityId);
    if (!current) return undefined;
    const next = applyMobCombatState(current, values);
    this.states.set(entityId, next);

    // Update the cache by searching for the element, which is acceptable for single events.
    for (let i = 0; i < this.cachedOrderedStates.length; i++) {
       if (this.cachedOrderedStates[i]!.definition.entityId === entityId) {
         this.cachedOrderedStates[i] = next;
         break;
       }
    }

    return next;
  }

  snapshot(): readonly ConfirmedZoneMob[] {
    const out: ConfirmedZoneMob[] = [];
    for (const state of this.cachedOrderedStates) {
      out.push(publicMobSnapshot(state));
    }
    return Object.freeze(out);
  }
  stateFor(entityId: string): MobRuntimeState | undefined {
    return this.states.get(entityId);
  }
  orderedStates(): readonly MobRuntimeState[] {
    return Object.freeze([...this.cachedOrderedStates]);
  }
}
