import type WebSocket from "ws";
import { ZONE_MAX_PRESENCES, ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { ZONE_COMBAT_CONTRACT_VERSION, ZONE_COMBAT_MAX_STAMINA, type ConfirmedZoneCombatant, type ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";
import { makeZoneConnectionId, type ZoneAttack, type ZoneId, type ZoneMove, type ZonePosition, type ZonePresence, type ZoneServerMessage, type ZoneSnapshot, type ZoneWelcome } from "./zoneProtocol";
import { ZoneMobRuntime } from "./zoneMobRuntime";
import { worldNatureCollision } from "./worldNatureCollision";
import { AX1_PLAYER_BASIC_MELEE_RANGE_FIXED } from "./ax1CombatProjection";
import { mobDistance } from "./wasdMobFsmProtocol";
import { reduceCombatDelta, resolveCombatDelta } from "./wasdCombatDeltaProtocol";
import { WASD_GAMEPLAY_SOURCE_REVISION } from "./wasdAREDeterminism";
import { regenerateWasdStamina, WASD_MAX_STAMINA } from "./wasdStaminaProtocol";
import { integrateWasdZoneMovement } from "./wasdZoneMovementProtocol";
import { WASD_DEFAULT_ZONE_COMBAT_PROFILE, validWasdZoneCombatProfile, type WasdZoneCombatProfile } from "./wasdCombatProfileProtocol";

export type ZoneCombatProfile = WasdZoneCombatProfile;
export const DEFAULT_ZONE_COMBAT_PROFILE: ZoneCombatProfile = WASD_DEFAULT_ZONE_COMBAT_PROFILE;

type PresencePeer={connectionId:string;userId:number;socket:WebSocket;input:ZoneMove["input"];lastAcceptedClientSeq:number;position:ZonePosition;combatLevel:number;health:number;maxHealth:number;stamina:number;weaponBonus:number;lastCombatSequence:number;};
type AttackResult="accepted"|"stale"|"missing"|"invalid_target"|"out_of_range"|"dead";
function serialize(payload:ZoneServerMessage){return JSON.stringify(payload);}
function compareBinary(left:string,right:string):number{return left<right?-1:left>right?1:0;}

/** Compatibility entry point; the movement law itself is owned by WASD. */
export function integrateZoneMovement(position:ZonePosition,input:ZoneMove["input"]):ZonePosition{
  return integrateWasdZoneMovement(position,input,(from,desired)=>worldNatureCollision.resolve(from,desired));
}

/**
 * Zone orchestration owns authenticated peers, transport order and projection.
 * AX1 supplies visible/content parameters; WASD owns movement/combat/FSM transitions.
 * Quest state is intentionally absent.
 */
export class AuthoritativeMovementZone{
  private readonly peers=new Map<string,PresencePeer>();private readonly mobRuntime=new ZoneMobRuntime();private snapshotSeq=0;private tickNumber=0;private combatSequence=0;private inputAcknowledgementPending=false;private movedLastTick=false;
  constructor(readonly zoneId:ZoneId){}

  join(values:{userId:number;socket:WebSocket;combatProfile?:ZoneCombatProfile}):ZoneWelcome{
    if(!Number.isSafeInteger(values.userId)||values.userId<1)throw new Error("ZONE_USER_INVALID");const profile=values.combatProfile??DEFAULT_ZONE_COMBAT_PROFILE;if(!validWasdZoneCombatProfile(profile))throw new Error("ZONE_COMBAT_PROFILE_INVALID");
    const previous=[...this.peers.values()].find(peer=>peer.userId===values.userId);if(!previous&&this.peers.size>=ZONE_MAX_PRESENCES)throw new Error("ZONE_CAPACITY_REACHED");if(previous){this.peers.delete(previous.connectionId);previous.socket.close(1000,"superseded by authenticated reconnect");}
    const connectionId=makeZoneConnectionId();this.peers.set(connectionId,{connectionId,userId:values.userId,socket:values.socket,input:{x:0,z:0},lastAcceptedClientSeq:0,position:{x:0,z:0},combatLevel:profile.combatLevel,health:profile.maxHealth,maxHealth:profile.maxHealth,stamina:WASD_MAX_STAMINA,weaponBonus:profile.weaponBonus,lastCombatSequence:0});
    const welcome:ZoneWelcome={type:"welcome",protocolVersion:ZONE_PROTOCOL_VERSION,connectionId,selfEntityId:`player:${values.userId}`,zoneId:this.zoneId,snapshotSeq:++this.snapshotSeq,tick:this.tickNumber,presences:this.presences(),mobs:this.mobRuntime.snapshot(),combatants:this.combatants()};this.broadcastSnapshot();return welcome;
  }
  leave(connectionId:string):void{if(!this.peers.delete(connectionId))return;this.broadcastSnapshot();}
  positionForConnection(connectionId:string):ZonePosition|undefined{const position=this.peers.get(connectionId)?.position;return position?{...position}:undefined;}
  mobSnapshot(){return this.mobRuntime.snapshot();}
  combatSnapshot(){return this.combatants();}

  submitMovement(connectionId:string,move:ZoneMove):"accepted"|"stale"|"missing"{const peer=this.peers.get(connectionId);if(!peer)return"missing";if(move.clientSeq<=peer.lastAcceptedClientSeq)return"stale";peer.lastAcceptedClientSeq=move.clientSeq;peer.input=move.input;this.inputAcknowledgementPending=true;return"accepted";}

  submitAttack(connectionId:string,attack:ZoneAttack):AttackResult{
    const peer=this.peers.get(connectionId);if(!peer)return"missing";if(attack.clientSeq<=peer.lastAcceptedClientSeq)return"stale";peer.lastAcceptedClientSeq=attack.clientSeq;this.inputAcknowledgementPending=true;if(peer.health<=0)return"dead";
    const mob=this.mobRuntime.stateFor(attack.targetEntityId);if(!mob||mob.health<=0)return"invalid_target";if(mobDistance(peer.position,mob.position)>AX1_PLAYER_BASIC_MELEE_RANGE_FIXED)return"out_of_range";
    const sequence=++this.combatSequence;
    const attacker={id:`player:${peer.userId}`,stamina:peer.stamina,skills:{combat:{level:peer.combatLevel}}};
    const defender={id:mob.definition.entityId,health:mob.health,skills:{combat:{level:mob.definition.level}}};
    const delta=resolveCombatDelta("melee",attacker,defender,{tick:this.tickNumber,sequence,weaponBonus:peer.weaponBonus});const patch=reduceCombatDelta(attacker,defender,delta);
    peer.stamina=patch.attacker.stamina;peer.lastCombatSequence=sequence;this.mobRuntime.applyCombatState(mob.definition.entityId,{health:patch.defender.health});
    this.broadcastCombat(this.combatEvent(delta,peer.stamina,patch.defender.health));this.broadcastSnapshot();return"accepted";
  }

  tick():boolean{
    this.tickNumber+=1;let changed=false;
    for(const peer of Array.from(this.peers.values()).sort((a,b)=>compareBinary(a.connectionId,b.connectionId))){if(peer.health>0)peer.stamina=regenerateWasdStamina(peer.stamina);if(peer.input.x===0&&peer.input.z===0||peer.health<=0)continue;const next=integrateZoneMovement(peer.position,peer.input);if(next.x===peer.position.x&&next.z===peer.position.z)continue;peer.position=next;changed=true;}
    const mobsChanged=this.mobRuntime.tick(this.presences(),this.tickNumber);const combatChanged=this.resolveMobAttacks();
    if(changed||mobsChanged||combatChanged||this.movedLastTick||this.inputAcknowledgementPending)this.broadcastSnapshot();this.movedLastTick=changed;this.inputAcknowledgementPending=false;return changed||mobsChanged||combatChanged;
  }

  private resolveMobAttacks():boolean{
    let changed=false;
    for(const mob of this.mobRuntime.orderedStates()){
      if(mob.state!=="combat"||mob.health<=0||!mob.targetEntityId||this.tickNumber<mob.nextAttackTick)continue;
      const peer=[...this.peers.values()].find(candidate=>`player:${candidate.userId}`===mob.targetEntityId);if(!peer||peer.health<=0)continue;if(mobDistance(mob.position,peer.position)>mob.definition.attackRangeFixed)continue;
      const sequence=++this.combatSequence,attacker={id:mob.definition.entityId,stamina:mob.stamina,skills:{combat:{level:mob.definition.level}}},defender={id:`player:${peer.userId}`,health:peer.health,skills:{combat:{level:peer.combatLevel}}};
      const delta=resolveCombatDelta("melee",attacker,defender,{tick:this.tickNumber,sequence,weaponBonus:0});const patch=reduceCombatDelta(attacker,defender,delta);
      this.mobRuntime.applyCombatState(mob.definition.entityId,{health:mob.health,stamina:patch.attacker.stamina,nextAttackTick:this.tickNumber+mob.definition.attackCooldownTicks});peer.health=patch.defender.health;peer.lastCombatSequence=sequence;if(peer.health===0)peer.input={x:0,z:0};this.broadcastCombat(this.combatEvent(delta,patch.attacker.stamina,peer.health));changed=true;
    }
    return changed;
  }

  private combatEvent(delta:ReturnType<typeof resolveCombatDelta>,attackerStamina:number,defenderHealth:number):ConfirmedZoneCombatEvent{return Object.freeze({type:"combat",contractVersion:ZONE_COMBAT_CONTRACT_VERSION,tick:delta.tick,sequence:delta.sequence,action:"melee",attackerEntityId:delta.attackerId,defenderEntityId:delta.defenderId,hit:delta.result.hit,damage:delta.result.damage,crit:delta.result.crit,killed:delta.result.killed,defenderHealth,attackerStamina,gameplaySourceRevision:WASD_GAMEPLAY_SOURCE_REVISION});}
  private broadcastCombat(event:ConfirmedZoneCombatEvent):void{const serialized=serialize(event);this.peers.forEach(peer=>{if(peer.socket.readyState===peer.socket.OPEN)peer.socket.send(serialized);});}
  private presences():ZonePresence[]{return Array.from(this.peers.values()).map(peer=>({entityId:`player:${peer.userId}`,userId:peer.userId,position:peer.position,lastAcceptedClientSeq:peer.lastAcceptedClientSeq})).sort((a,b)=>compareBinary(a.entityId,b.entityId));}
  private combatants():readonly ConfirmedZoneCombatant[]{const players=Array.from(this.peers.values()).map(peer=>Object.freeze({entityId:`player:${peer.userId}`,health:peer.health,maxHealth:peer.maxHealth,stamina:peer.stamina,maxStamina:ZONE_COMBAT_MAX_STAMINA,alive:peer.health>0,combatLevel:peer.combatLevel,lastCombatSequence:peer.lastCombatSequence}));const mobs=this.mobRuntime.orderedStates().map(mob=>Object.freeze({entityId:mob.definition.entityId,health:mob.health,maxHealth:mob.maxHealth,stamina:mob.stamina,maxStamina:ZONE_COMBAT_MAX_STAMINA,alive:mob.health>0,combatLevel:mob.definition.level,lastCombatSequence:0}));return Object.freeze([...players,...mobs].sort((a,b)=>compareBinary(a.entityId,b.entityId)));}
  private broadcastSnapshot():void{const snapshot:ZoneSnapshot={type:"snapshot",zoneId:this.zoneId,snapshotSeq:++this.snapshotSeq,tick:this.tickNumber,presences:this.presences(),mobs:this.mobRuntime.snapshot(),combatants:this.combatants()};const serialized=serialize(snapshot);this.peers.forEach(peer=>{if(peer.socket.readyState===peer.socket.OPEN)peer.socket.send(serialized);});}
}

export class ZoneRegistry{private readonly zones=new Map<ZoneId,AuthoritativeMovementZone>();get(zoneId:ZoneId):AuthoritativeMovementZone{const existing=this.zones.get(zoneId);if(existing)return existing;const zone=new AuthoritativeMovementZone(zoneId);this.zones.set(zoneId,zone);return zone;}tick():void{Array.from(this.zones.entries()).sort(([left],[right])=>compareBinary(left,right)).forEach(([,zone])=>zone.tick());}}
