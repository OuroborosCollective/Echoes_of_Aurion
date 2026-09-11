import type { MMOEngine } from "../core/MMOEngine";
import type { CharacterClassId } from "../types";
import { validConfirmedZoneTelegraphEvent, type ConfirmedZoneTelegraphEvent } from "@shared/zoneTelegraphContract";
import { ZONE_RESOURCE_READBACK_EVENT, type ConfirmedZoneResourceReadback } from "@/lib/zoneResourceReadback";
import { ZONE_TELEGRAPH_READBACK_EVENT, ZONE_TICK_READBACK_EVENT, type ConfirmedZoneTickReadback } from "@/lib/zoneTelegraphReadback";
import { attachAurionWorldCore, type AurionWorldContext } from "./aurionWorldCore";
import { ResourceNodeProjection } from "./ResourceNodeProjection";
import { attachAx1ZoneProjection } from "./zoneCombatBridge";
import { Ax1CombatTelegraphPresenter } from "../core/Ax1CombatTelegraphPresenter";

export type AurionPlayerClass="vanguard"|"seer"|"warden";
export type AurionQuestKey="astral_call"|"archive_of_echoes"|"ember_key";
export type AurionGameplayCommand="1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"E"|"F";
export type AurionZoneMovementInput={x:-1|0|1;z:-1|0|1};
const ZONE_FIXED_POINT_SCALE=1_000;
const quantizeAxis=(value:number):-1|0|1=>value>0.15?1:value<-0.15?-1:0;
export function ax1MovementToAurionIntent(cameraYaw:number,forward:number,right:number):AurionZoneMovementInput{const forwardX=-Math.sin(cameraYaw),forwardZ=-Math.cos(cameraYaw),rightX=Math.cos(cameraYaw),rightZ=-Math.sin(cameraYaw);return{x:quantizeAxis(forward*forwardX+right*rightX),z:quantizeAxis(forward*forwardZ+right*rightZ)};}
export function aurionClassForAx1(classId:CharacterClassId):AurionPlayerClass|null{if(classId==="knight")return"vanguard";if(classId==="mage")return"seer";if(classId==="ranger")return"warden";return null;}
export function aurionQuestKey(value:string):AurionQuestKey|null{return value==="astral_call"||value==="archive_of_echoes"||value==="ember_key"?value:null;}
export function aurionCommandForAx1Key(key:string,code:string):AurionGameplayCommand|null{if(key==="1"||key==="2"||key==="3"||key==="4"||key==="5")return key;if(code==="Space")return"3";if(key==="f")return"E";return null;}
export function isAx1LocalGameplayMutationKey(key:string,code:string):boolean{return aurionCommandForAx1Key(key,code)!==null||key==="z";}

/**
 * AX1-first composition boundary.
 *
 * AX1 remains the game, world, render/input/UI/content scaffold. Aurion adds
 * authenticated hosting/persistence/readbacks and selected server rules; WASD
 * reducers may replace individual gameplay transitions when they are proven.
 * The integration must never empty AX1 merely to reconstruct the same world
 * from a secondary system. Instead, truth-writing methods are disabled or
 * redirected individually while AX1 presentation/content stays available.
 */
export function bindAurionAuthorityProjection(engine:MMOEngine,handlers:{requestAction:(command:AurionGameplayCommand)=>void;requestMount:()=>void;},worldContext:AurionWorldContext):void{
  const player=engine.player;

  // Synthetic realm players are not live users, so they are retired. In contrast,
  // AX1 NPCs, quests, terrain and mob presentation remain the baseline game world.
  engine.simPlayers.dispose();
  engine.mobManager.enableServerAuthority();

  const reject={success:false,message:"Server gameplay authority is required for this action."} as const;
  const worldCore=attachAurionWorldCore(engine,worldContext);
  const detachZoneProjection=attachAx1ZoneProjection(engine);
  const resourceNodes=new ResourceNodeProjection(engine.scene,(x,z)=>engine.landscape.chunkManager.getElevationAt(x,z));
  const telegraphs=new Ax1CombatTelegraphPresenter(engine.scene);
  const onResourceReadback=(event:Event)=>{
    try{
      const detail=(event as CustomEvent<ConfirmedZoneResourceReadback>).detail;
      resourceNodes.apply(detail.resources,detail.tick);
    }catch(error){
      engine.onRuntimeError?.(error);
    }
  };
  const onTelegraphReadback=(event:Event)=>{
    try{
      const detail=(event as CustomEvent<ConfirmedZoneTelegraphEvent>).detail;
      if(!validConfirmedZoneTelegraphEvent(detail))return;
      const originX=detail.origin.x/ZONE_FIXED_POINT_SCALE,originZ=detail.origin.z/ZONE_FIXED_POINT_SCALE;
      const targetX=detail.target.x/ZONE_FIXED_POINT_SCALE,targetZ=detail.target.z/ZONE_FIXED_POINT_SCALE;
      const dx=targetX-originX,dz=targetZ-originZ,length=Math.hypot(dx,dz);
      if(!Number.isFinite(length)||length<0.05)return;
      const x=(originX+targetX)/2,z=(originZ+targetZ)/2;
      telegraphs.addConfirmed({
        id:detail.id,
        kind:detail.kind,
        x,
        y:engine.landscape.chunkManager.getElevationAt(x,z),
        z,
        color:detail.color,
        startTick:detail.startTick,
        impactTick:detail.impactTick,
        angleRadians:Math.atan2(dx,dz),
        width:detail.widthFixed/ZONE_FIXED_POINT_SCALE,
        length,
      });
    }catch(error){
      engine.onRuntimeError?.(error);
    }
  };
  const onTickReadback=(event:Event)=>{
    const detail=(event as CustomEvent<ConfirmedZoneTickReadback>).detail;
    if(detail&&Number.isSafeInteger(detail.tick)&&detail.tick>=0)telegraphs.updateConfirmedTick(detail.tick);
  };
  window.addEventListener(ZONE_RESOURCE_READBACK_EVENT,onResourceReadback);
  window.addEventListener(ZONE_TELEGRAPH_READBACK_EVENT,onTelegraphReadback);
  window.addEventListener(ZONE_TICK_READBACK_EVENT,onTickReadback);
  const baseStop=engine.stop.bind(engine);let stopped=false;
  engine.stop=()=>{if(!stopped){stopped=true;window.removeEventListener(ZONE_RESOURCE_READBACK_EVENT,onResourceReadback);window.removeEventListener(ZONE_TELEGRAPH_READBACK_EVENT,onTelegraphReadback);window.removeEventListener(ZONE_TICK_READBACK_EVENT,onTickReadback);telegraphs.clear();resourceNodes.dispose();detachZoneProjection();worldCore.stop();}baseStop();};

  // A production-assigned GLB may replace AX1's procedural player only when it
  // has a real rig and an actually moving attack clip. Idle/Walk/Run may use the
  // presentation-only AnimatedGlbActor fallback when imported named clips are
  // static; clip names alone are never animation evidence.
  const equipGlbModel=player.equipGlbModel.bind(player);
  player.equipGlbModel=async modelId=>{
    const equipped=await equipGlbModel(modelId);
    if(!equipped||!modelId)return equipped;
    const evidence=player.glbPresentationEvidence();
    const supported=new Set(evidence?.supportedPoses??[]);
    const animated=new Set(evidence?.animatedPoses??[]);
    if((evidence?.boneCount??0)>0&&supported.has("idle")&&animated.has("attack"))return true;
    await equipGlbModel(null);
    return false;
  };

  // Keep AX1 controls and interaction flow, but route truth-changing actions to
  // the confirmed action corridor. NPC interaction itself is presentation-only:
  // opening the AX1 dialog never accepts/completes a quest or changes inventory.
  engine.castClassSkill=index=>{if(index>=0&&index<5)handlers.requestAction(String(index+1) as AurionGameplayCommand);};
  engine.toggleMount=()=>handlers.requestMount();
  engine.interactNearby=()=>{
    if(engine.nearbyLoot){handlers.requestAction("E");return{};}
    if(engine.nearbyNPC)return{npcOpened:engine.nearbyNPC};
    return{};
  };
  engine.equipItem=()=>null;engine.unequipItem=()=>null;

  // Local AX1 truth writers stay disabled in connected play. Incoming confirmed
  // snapshots update projected fields through the integration bridges; AX1 still
  // owns how those states look, animate and are navigated by the player.
  player.takeDamage=()=>({damageTaken:0,isDead:false,dodged:false});
  player.heal=()=>{};player.restoreResource=()=>{};player.consumeResource=()=>false;player.gainXp=()=>false;player.useConsumable=()=>{};player.toggleMount=()=>player.stats.isMounted;player.equipItem=()=>null;player.unequipItem=()=>null;player.unequipSlot=()=>null;player.allocateStatPoint=()=>reject;player.unlockMilestoneSkill=()=>reject;player.equipSkillToHotbar=()=>{};
}
