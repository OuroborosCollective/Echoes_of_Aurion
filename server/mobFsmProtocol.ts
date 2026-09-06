import { createHash } from "node:crypto";
import { validWorldPosition, type ConfirmedZonePresence } from "../shared/zonePresenceContract";
import type { ConfirmedZoneMob, ZoneMobArchetype, ZoneMobState } from "../shared/zoneMobContract";
import { ax1MobCombatProjection } from "./ax1CombatProjection";

export const AURION_MOB_FSM_RULESET = "ax1-projection-fsm.v2" as const;
export const MOB_LEASH_DISTANCE_FIXED = 48_000;
export const MOB_EVADE_RETURN_DISTANCE_FIXED = 3_000;
export const MOB_COMBAT_DROPOFF_MULTIPLIER_BPS = 19_000;

type Position = Readonly<{ x: number; z: number }>;
export type MobDefinition = Readonly<{
  entityId: string;
  archetype: ZoneMobArchetype;
  level: number;
  homePosition: Position;
  isBoss: boolean;
  isElite: boolean;
  attackRangeFixed: number;
  attackCooldownTicks: number;
  maxHealth: number;
}>;
export type MobRuntimeState = Readonly<{
  definition: MobDefinition;
  state: ZoneMobState;
  position: Position;
  targetEntityId: string | null;
  idleUntilTick: number;
  patrolIndex: number;
  health: number;
  maxHealth: number;
  stamina: number;
  nextAttackTick: number;
}>;

const sourceDefinitions = [
  ["clockwork_stalker",1,18,-18,false,false], ["aether_wisp",2,34,-28,false,false],
  ["corrupted_golem",3,-34,-20,false,true], ["steam_drake",4,-48,28,false,true],
  ["centurion_elite",5,28,42,false,true], ["titan_boss",15,0,68,true,true],
  ["aether_wisp",1,-55,-50,false,false], ["clockwork_stalker",2,-44,-28,false,false],
  ["aether_wisp",3,-33,-6,false,false], ["clockwork_stalker",4,-22,-50,false,false],
  ["aether_wisp",1,-11,-28,false,false], ["clockwork_stalker",2,0,-6,false,false],
  ["aether_wisp",3,11,-50,false,false], ["clockwork_stalker",4,22,-28,false,false],
  ["aether_wisp",1,33,-6,false,false], ["clockwork_stalker",2,44,-50,false,false],
] as const;

export const observatoryMobDefinitions: readonly MobDefinition[] = Object.freeze(sourceDefinitions.map(([archetype,level,x,z,isBoss,isElite], index) => {
  const projection = ax1MobCombatProjection(archetype, level);
  return Object.freeze({
    entityId:`mob_${index+1}`, archetype, level, homePosition:Object.freeze({x:x*1_000,z:z*1_000}), isBoss, isElite,
    attackRangeFixed:projection.attackRangeFixed, attackCooldownTicks:projection.attackCooldownTicks, maxHealth:projection.maxHealth,
  });
}).sort((left,right)=>compareText(left.entityId,right.entityId)));

function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}
export function mobDistance(left:Position,right:Position):number{return Math.hypot(left.x-right.x,left.z-right.z);}
function distanceSquared(left:Position,right:Position):number{const dx=left.x-right.x,dz=left.z-right.z;return dx*dx+dz*dz;}
function hash32(value:string):number{return createHash("sha256").update(value,"utf8").digest().readUInt32BE(0)>>>0;}
function idleDurationTicks(entityId:string,startTick:number):number{return 20+hash32(`${AURION_MOB_FSM_RULESET}:${entityId}:${startTick}`)%31;}
function aggroRadiusFixed(definition:MobDefinition):number{return definition.isBoss?28_000:definition.isElite?22_000:16_000;}
function patrolRadius(definition:MobDefinition):number{return definition.isBoss?3_500:6_500;}
const patrolDirections=Object.freeze([[1_000,0],[707,707],[0,1_000],[-707,707],[-1_000,0],[-707,-707],[0,-1_000],[707,-707]] as const);
function patrolTarget(state:MobRuntimeState):Position{const [dx,dz]=patrolDirections[state.patrolIndex%patrolDirections.length]!;const radius=patrolRadius(state.definition);return Object.freeze({x:state.definition.homePosition.x+Math.trunc(dx*radius/1_000),z:state.definition.homePosition.z+Math.trunc(dz*radius/1_000)});}
function stepToward(from:Position,to:Position,maximumStep:number):Position{const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);if(d===0||d<=maximumStep)return Object.freeze({x:to.x,z:to.z});return Object.freeze({x:from.x+Math.round(dx/d*maximumStep),z:from.z+Math.round(dz/d*maximumStep)});}
function assertRuntimeInput(state:MobRuntimeState,presences:readonly ConfirmedZonePresence[],tick:number):void{if(!Number.isSafeInteger(tick)||tick<0||!validWorldPosition(state.position)||!validWorldPosition(state.definition.homePosition))throw new Error("MOB_FSM_INPUT_INVALID");const ids=new Set<string>();for(const presence of presences){if(!presence||presence.entityId!==`player:${presence.userId}`||!validWorldPosition(presence.position)||ids.has(presence.entityId))throw new Error("MOB_FSM_PRESENCE_INVALID");ids.add(presence.entityId);}}

export function initialMobRuntimeState(definition:MobDefinition,tick=0):MobRuntimeState{
  if(!Number.isSafeInteger(tick)||tick<0)throw new Error("MOB_FSM_TICK_INVALID");
  return Object.freeze({definition,state:"idle",position:definition.homePosition,targetEntityId:null,idleUntilTick:tick+idleDurationTicks(definition.entityId,tick),patrolIndex:hash32(definition.entityId)%patrolDirections.length,health:definition.maxHealth,maxHealth:definition.maxHealth,stamina:100,nextAttackTick:tick});
}

export function nearestAggroTarget(definition:MobDefinition,position:Position,presences:readonly ConfirmedZonePresence[]):ConfirmedZonePresence|null{
  const limit=aggroRadiusFixed(definition),limitSquared=limit*limit;
  return presences.filter(p=>distanceSquared(position,p.position)<=limitSquared).slice().sort((a,b)=>distanceSquared(position,a.position)-distanceSquared(position,b.position)||compareText(a.entityId,b.entityId))[0]??null;
}

export function resolveMobFsmTick(input:Readonly<{current:MobRuntimeState;presences:readonly ConfirmedZonePresence[];tick:number;resolveMovement?:(from:Position,desired:Position)=>Position}>):MobRuntimeState{
  const {current,presences,tick}=input;assertRuntimeInput(current,presences,tick);
  if(current.health<=0)return current.state==="dead"&&current.targetEntityId===null?current:Object.freeze({...current,state:"dead",targetEntityId:null,health:0});
  const definition=current.definition,resolveMovement=input.resolveMovement??((_from,desired)=>desired);
  const move=(desired:Position)=>{const resolved=resolveMovement(current.position,desired);if(!validWorldPosition(resolved))throw new Error("MOB_FSM_MOVEMENT_INVALID");return Object.freeze({x:resolved.x,z:resolved.z});};
  const presenceById=new Map(presences.map(p=>[p.entityId,p] as const));
  if(current.state==="evading"){
    if(mobDistance(current.position,definition.homePosition)<=MOB_EVADE_RETURN_DISTANCE_FIXED)return Object.freeze({...current,state:"idle",position:definition.homePosition,targetEntityId:null,idleUntilTick:tick+idleDurationTicks(definition.entityId,tick),health:definition.maxHealth,stamina:100});
    return Object.freeze({...current,targetEntityId:null,position:move(stepToward(current.position,definition.homePosition,750))});
  }
  if(current.state==="combat"){
    const target=current.targetEntityId?presenceById.get(current.targetEntityId):undefined;
    const leashBroken=mobDistance(current.position,definition.homePosition)>MOB_LEASH_DISTANCE_FIXED;
    if(!target||leashBroken)return Object.freeze({...current,state:"evading",targetEntityId:null});
    const targetDistance=mobDistance(current.position,target.position),dropoff=Math.trunc(aggroRadiusFixed(definition)*MOB_COMBAT_DROPOFF_MULTIPLIER_BPS/10_000);
    if(targetDistance>dropoff)return Object.freeze({...current,state:"evading",targetEntityId:null});
    if(targetDistance<=definition.attackRangeFixed)return current;
    return Object.freeze({...current,position:move(stepToward(current.position,target.position,definition.isBoss?550:450))});
  }
  const acquired=nearestAggroTarget(definition,current.position,presences);
  if(acquired)return Object.freeze({...current,state:"combat",targetEntityId:acquired.entityId});
  if(current.state==="idle")return tick<current.idleUntilTick?current:Object.freeze({...current,state:"patrolling",targetEntityId:null});
  const target=patrolTarget(current);
  if(mobDistance(current.position,target)<=500)return Object.freeze({...current,patrolIndex:(current.patrolIndex+1)%patrolDirections.length});
  return Object.freeze({...current,position:move(stepToward(current.position,target,425)),targetEntityId:null});
}

export function applyMobCombatState(current:MobRuntimeState,values:{health:number;stamina?:number;nextAttackTick?:number}):MobRuntimeState{
  const health=Math.max(0,Math.min(current.maxHealth,Math.floor(values.health)));
  const stamina=values.stamina===undefined?current.stamina:Math.max(0,Math.min(100,Math.floor(values.stamina)));
  const nextAttackTick=values.nextAttackTick===undefined?current.nextAttackTick:Math.max(0,Math.floor(values.nextAttackTick));
  return Object.freeze({...current,health,stamina,nextAttackTick,state:health===0?"dead":current.state,targetEntityId:health===0?null:current.targetEntityId});
}

export function publicMobSnapshot(state:MobRuntimeState):ConfirmedZoneMob{return Object.freeze({entityId:state.definition.entityId,archetype:state.definition.archetype,level:state.definition.level,state:state.state,position:Object.freeze({x:state.position.x,z:state.position.z}),targetEntityId:state.targetEntityId,isBoss:state.definition.isBoss,isElite:state.definition.isElite,health:state.health,maxHealth:state.maxHealth});}
