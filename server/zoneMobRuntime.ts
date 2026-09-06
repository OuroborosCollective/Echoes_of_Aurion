import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob } from "../shared/zoneMobContract";
import { initialMobRuntimeState, observatoryMobDefinitions, publicMobSnapshot, resolveMobFsmTick, type MobRuntimeState } from "./mobFsmProtocol";
import { worldNatureCollision } from "./worldNatureCollision";

function sameMob(left: ConfirmedZoneMob, right: ConfirmedZoneMob): boolean {
  return left.entityId===right.entityId&&left.state===right.state&&left.position.x===right.position.x&&left.position.z===right.position.z&&left.targetEntityId===right.targetEntityId;
}

/** Server-only runtime owner for hostile mob movement/target state in the live zone. */
export class ZoneMobRuntime {
  private readonly states = new Map<string,MobRuntimeState>();

  constructor() {
    observatoryMobDefinitions.forEach(definition=>this.states.set(definition.entityId,initialMobRuntimeState(definition,0)));
  }

  tick(presences: readonly ConfirmedZonePresence[], tick: number): boolean {
    let changed=false;
    for(const entityId of [...this.states.keys()].sort()){
      const current=this.states.get(entityId)!;
      const before=publicMobSnapshot(current);
      const next=resolveMobFsmTick({
        current,presences,tick,
        resolveMovement:(from,desired)=>worldNatureCollision.resolve(from,desired),
      });
      this.states.set(entityId,next);
      if(!sameMob(before,publicMobSnapshot(next))) changed=true;
    }
    return changed;
  }

  snapshot(): readonly ConfirmedZoneMob[] {
    return Object.freeze([...this.states.values()].map(publicMobSnapshot).sort((a,b)=>a.entityId<b.entityId?-1:a.entityId>b.entityId?1:0));
  }

  stateFor(entityId: string): MobRuntimeState | undefined { return this.states.get(entityId); }
}
