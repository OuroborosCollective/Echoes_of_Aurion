import type { ConfirmedZoneCombatEvent, ConfirmedZoneCombatant } from "@shared/zoneCombatContract";
import type { ConfirmedZoneMob } from "@shared/zoneMobContract";
import type { MMOEngine } from "../core/MMOEngine";

export type ZoneActionOutcome={confirmed:boolean;completed:boolean;message:string};
type PendingAttack={resolve:(value:ZoneActionOutcome)=>void;timer:number};
let engine:MMOEngine|null=null;
let sendAttack:((targetEntityId:string)=>boolean)|null=null;
let selfEntityId:string|null=null;
let pending:PendingAttack|null=null;

function clearPending(value:ZoneActionOutcome):void{const current=pending;if(!current)return;pending=null;window.clearTimeout(current.timer);current.resolve(value);}

export function attachAx1ZoneProjection(next:MMOEngine):()=>void{
  engine=next;
  return()=>{if(engine===next)engine=null;clearPending({confirmed:false,completed:false,message:"Spielruntime wurde beendet."});};
}

export function attachZoneCombatTransport(sender:(targetEntityId:string)=>boolean):()=>void{
  sendAttack=sender;
  return()=>{if(sendAttack===sender)sendAttack=null;clearPending({confirmed:false,completed:false,message:"Kampfverbindung wurde geschlossen."});};
}

export function projectConfirmedZoneSnapshot(values:{selfEntityId:string;mobs:readonly ConfirmedZoneMob[];combatants:readonly ConfirmedZoneCombatant[]}):void{
  selfEntityId=values.selfEntityId;
  if(!engine)return;
  engine.mobManager.applyAuthoritativeSnapshot(values.mobs);
  const self=values.combatants.find(entry=>entry.entityId===values.selfEntityId);
  if(self){engine.player.stats.hp=self.health;engine.player.stats.maxHp=self.maxHealth;if(self.health<=0){engine.player.setConfirmedGlbSpeed(0);engine.setVirtualMovement(0,0);}}
  if(engine.targetMob&&engine.targetMob.hp<=0)engine.targetMob=null;
}

export function acceptConfirmedZoneCombat(event:ConfirmedZoneCombatEvent):void{
  if(!selfEntityId)return;
  const ownAttack=event.attackerEntityId===selfEntityId;
  const ownHit=event.defenderEntityId===selfEntityId;
  if(engine){
    if(ownAttack){
      if(event.damage>0)engine.addFloatingText(`${event.crit?"CRIT ":""}-${event.damage}`,engine.targetMob?.x??engine.player.position.x,engine.player.position.y+1.8, event.crit?"#facc15":"#f8fafc","lg");
      window.dispatchEvent(new CustomEvent("aurion:authoritative-action",{detail:{sessionId:`zone:${selfEntityId}`,sequence:event.sequence,command:"F",source:"human",damage:event.damage,bossHp:event.defenderHealth,completed:event.killed}}));
    }
    if(ownHit&&event.damage>0)engine.addFloatingText(`-${event.damage}`,engine.player.position.x,engine.player.position.y+1.9,"#ef4444","lg");
  }
  if(ownAttack)clearPending({confirmed:true,completed:false,message:event.killed?`Treffer bestätigt: ${event.damage} Schaden, Gegner besiegt.`:event.hit?`Treffer bestätigt: ${event.damage} Schaden.`:"Angriff bestätigt, aber verfehlt."});
}

export function rejectPendingZoneAttack(code:string):void{
  if(!pending)return;
  const message=code==="COMBAT_TARGET_OUT_OF_RANGE"?"Ziel außerhalb der AX1-Nahkampfreichweite.":code==="INVALID_COMBAT_TARGET"?"Ziel ist nicht mehr angreifbar.":code==="COMBATANT_DEAD"?"Dein Charakter ist kampfunfähig.":`Angriff verworfen: ${code}`;
  clearPending({confirmed:false,completed:false,message});
}

export function zoneCombatAvailable():boolean{return Boolean(engine&&sendAttack&&selfEntityId);}

export function requestZoneBasicAttack():Promise<ZoneActionOutcome>{
  if(!engine||!sendAttack||!selfEntityId)return Promise.resolve({confirmed:false,completed:false,message:"WASD-Zonenkampf ist nicht verbunden."});
  if(pending)return Promise.resolve({confirmed:false,completed:false,message:"Vorheriger Angriff wartet noch auf Serverbestätigung."});
  let target=engine.targetMob;
  if(!target||target.hp<=0){target=engine.mobManager.nearest(engine.player.position.x,engine.player.position.z,18);engine.targetMob=target;}
  if(!target)return Promise.resolve({confirmed:false,completed:false,message:"Kein angreifbares Ziel in der Nähe."});
  return new Promise(resolve=>{
    const timer=window.setTimeout(()=>{if(pending?.resolve===resolve)clearPending({confirmed:false,completed:false,message:"Keine Kampfbestätigung erhalten; Zustand wird nicht geraten."});},3_000);
    pending={resolve,timer};
    if(!sendAttack!(target!.id))clearPending({confirmed:false,completed:false,message:"Angriff konnte nicht an die Zone gesendet werden."});
  });
}
