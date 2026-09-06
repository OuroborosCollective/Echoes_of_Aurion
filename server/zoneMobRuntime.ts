import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob } from "../shared/zoneMobContract";
import { applyMobCombatState, initialMobRuntimeState, observatoryMobDefinitions, publicMobSnapshot, resolveMobFsmTick, type MobRuntimeState } from "./mobFsmProtocol";
import { worldNatureCollision } from "./worldNatureCollision";

type Position=Readonly<{x:number;z:number}>;
export const MOB_COLLISION_SUBSTEP_MAX_MM=340;

function sameMob(left:ConfirmedZoneMob,right:ConfirmedZoneMob):boolean{return left.entityId===right.entityId&&left.state===right.state&&left.position.x===right.position.x&&left.position.z===right.position.z&&left.targetEntityId===right.targetEntityId&&left.health===right.health&&left.maxHealth===right.maxHealth;}

/** Split an already-balanced FSM movement into collision-safe integer sweeps without changing its intended endpoint. */
export function mobCollisionSubsteps(from:Position,desired:Position):readonly Position[]{
  const dx=desired.x-from.x,dz=desired.z-from.z;
  if(dx===0&&dz===0)return Object.freeze([]);
  const steps=Math.max(1,Math.ceil(Math.abs(dx)/MOB_COLLISION_SUBSTEP_MAX_MM),Math.ceil(Math.abs(dz)/MOB_COLLISION_SUBSTEP_MAX_MM));
  const targets:Position[]=[];
  for(let step=1;step<=steps;step+=1){
    targets.push(Object.freeze({x:from.x+Math.round(dx*step/steps),z:from.z+Math.round(dz*step/steps)}));
  }
  return Object.freeze(targets);
}

export function resolveMobCollisionMovement(from:Position,desired:Position):Position{
  let current:Position=from;
  for(const target of mobCollisionSubsteps(from,desired)){
    if(Math.abs(target.x-current.x)>MOB_COLLISION_SUBSTEP_MAX_MM||Math.abs(target.z-current.z)>MOB_COLLISION_SUBSTEP_MAX_MM)throw new Error("MOB_COLLISION_SUBSTEP_INVALID");
    const resolved=worldNatureCollision.resolve(current,target);
    current=Object.freeze({x:resolved.x,z:resolved.z});
    // A collision or wall slide already consumed this tick's safe movement. Do not jump to a later absolute waypoint.
    if(current.x!==target.x||current.z!==target.z)return current;
  }
  return current;
}

/** Server-only AX1 projection state. WASD deltas are the only combat mutation input. */
export class ZoneMobRuntime {
  private readonly states=new Map<string,MobRuntimeState>();
  constructor(){observatoryMobDefinitions.forEach(definition=>this.states.set(definition.entityId,initialMobRuntimeState(definition,0)));}

  tick(presences:readonly ConfirmedZonePresence[],tick:number):boolean{
    let changed=false;
    for(const entityId of [...this.states.keys()].sort()){
      const current=this.states.get(entityId)!,before=publicMobSnapshot(current);
      const next=resolveMobFsmTick({current,presences,tick,resolveMovement:resolveMobCollisionMovement});
      this.states.set(entityId,next);if(!sameMob(before,publicMobSnapshot(next)))changed=true;
    }
    return changed;
  }

  applyCombatState(entityId:string,values:{health:number;stamina?:number;nextAttackTick?:number}):MobRuntimeState|undefined{
    const current=this.states.get(entityId);if(!current)return undefined;
    const next=applyMobCombatState(current,values);this.states.set(entityId,next);return next;
  }

  snapshot():readonly ConfirmedZoneMob[]{return Object.freeze([...this.states.values()].map(publicMobSnapshot).sort((a,b)=>a.entityId<b.entityId?-1:a.entityId>b.entityId?1:0));}
  stateFor(entityId:string):MobRuntimeState|undefined{return this.states.get(entityId);}
  orderedStates():readonly MobRuntimeState[]{return Object.freeze([...this.states.values()].sort((a,b)=>a.definition.entityId<b.definition.entityId?-1:a.definition.entityId>b.definition.entityId?1:0));}
}
