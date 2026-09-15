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
  private readonly orderedStatesCache: MobRuntimeState[] = [];
  private readonly entityIdToIndex = new Map<string, number>();
  private readonly orderedEntityIds: string[] = [];

  constructor() {
    const tempStates = new Map<string, MobRuntimeState>();
    observatoryMobDefinitions.forEach(definition =>
      tempStates.set(
        definition.entityId,
        initialMobRuntimeState(definition, 0)
      )
    );
    this.orderedEntityIds = Array.from(tempStates.keys()).sort();

    // Cache the ordered states and build the index map for O(1) array lookups
    for (let i = 0; i < this.orderedEntityIds.length; i++) {
      const entityId = this.orderedEntityIds[i];
      this.orderedStatesCache.push(tempStates.get(entityId)!);
      this.entityIdToIndex.set(entityId, i);
    }
  }

  tick(
    presences: readonly ConfirmedZonePresence[],
    tick: number,
    frozenEntityIds: ReadonlySet<string> = NO_FROZEN_MOBS
  ): boolean {
    let changed = false;
    for (let i = 0; i < this.orderedStatesCache.length; i++) {
      const current = this.orderedStatesCache[i]!;
      const entityId = current.definition.entityId;
      const before = publicMobSnapshot(current);
      const next = frozenEntityIds.has(entityId)
        ? current
        : resolveMobFsmTick({
            current,
            presences,
            tick,
            resolveMovement: resolveMobCollisionMovement,
          });
      this.orderedStatesCache[i] = next;
      if (!sameMob(before, publicMobSnapshot(next))) changed = true;
    }
    return changed;
  }

  applyCombatState(
    entityId: string,
    values: { health: number; stamina?: number; nextAttackTick?: number }
  ): MobRuntimeState | undefined {
    const index = this.entityIdToIndex.get(entityId);
    if (index === undefined) return undefined;
    const current = this.orderedStatesCache[index]!;
    const next = applyMobCombatState(current, values);
    this.orderedStatesCache[index] = next;
    return next;
  }

  snapshot(): readonly ConfirmedZoneMob[] {
    const out: ConfirmedZoneMob[] = [];
    for (let i = 0; i < this.orderedStatesCache.length; i++) {
      out.push(publicMobSnapshot(this.orderedStatesCache[i]!));
    }
    return Object.freeze(out);
  }

  stateFor(entityId: string): MobRuntimeState | undefined {
    const index = this.entityIdToIndex.get(entityId);
    if (index === undefined) return undefined;
    return this.orderedStatesCache[index];
  }

  orderedStates(): readonly MobRuntimeState[] {
    return Object.freeze([...this.orderedStatesCache]);
  }
}
