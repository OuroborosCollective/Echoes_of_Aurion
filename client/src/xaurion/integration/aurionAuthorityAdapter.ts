import type { MMOEngine } from "../core/MMOEngine";
import type { CharacterClassId } from "../types";
import { attachAurionWorldCore, type AurionWorldContext } from "./aurionWorldCore";
import { attachAx1ZoneProjection } from "./zoneCombatBridge";

export type AurionPlayerClass="vanguard"|"seer"|"warden";
export type AurionQuestKey="astral_call"|"archive_of_echoes"|"ember_key";
export type AurionGameplayCommand="1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"E"|"F";
export type AurionZoneMovementInput={x:-1|0|1;z:-1|0|1};
const quantizeAxis=(value:number):-1|0|1=>value>0.15?1:value<-0.15?-1:0;
export function ax1MovementToAurionIntent(cameraYaw:number,forward:number,right:number):AurionZoneMovementInput{const forwardX=-Math.sin(cameraYaw),forwardZ=-Math.cos(cameraYaw),rightX=Math.cos(cameraYaw),rightZ=-Math.sin(cameraYaw);return{x:quantizeAxis(forward*forwardX+right*rightX),z:quantizeAxis(forward*forwardZ+right*rightZ)};}
export function aurionClassForAx1(classId:CharacterClassId):AurionPlayerClass|null{if(classId==="knight")return"vanguard";if(classId==="mage")return"seer";if(classId==="ranger")return"warden";return null;}
export function aurionQuestKey(value:string):AurionQuestKey|null{return value==="astral_call"||value==="archive_of_echoes"||value==="ember_key"?value:null;}
export function aurionCommandForAx1Key(key:string,code:string):AurionGameplayCommand|null{if(key==="1"||key==="2"||key==="3"||key==="4"||key==="5")return key;if(code==="Space")return"3";if(key==="f")return"E";return null;}
export function isAx1LocalGameplayMutationKey(key:string,code:string):boolean{return aurionCommandForAx1Key(key,code)!==null||key==="z";}

/**
 * AX1 remains the render/input/UI implementation. Local AX1 quest, mob, loot,
 * damage and progression mutators are disabled; confirmed server/WASD results
 * are projected back into the same AX1 objects instead.
 */
export function bindAurionAuthorityProjection(engine:MMOEngine,handlers:{requestAction:(command:AurionGameplayCommand)=>void;requestMount:()=>void;},worldContext:AurionWorldContext):void{
  const player=engine.player;
  engine.simPlayers.dispose();
  engine.mobManager.enableServerAuthority();
  engine.quests=[];
  engine.npcs=[];
  engine.nearbyNPC=null;
  const reject={success:false,message:"Server gameplay authority is required for this action."} as const;
  const worldCore=attachAurionWorldCore(engine,worldContext);
  const detachZoneProjection=attachAx1ZoneProjection(engine);
  const baseStop=engine.stop.bind(engine);let stopped=false;
  engine.stop=()=>{if(!stopped){stopped=true;detachZoneProjection();worldCore.stop();}baseStop();};

  // A production-assigned GLB may replace AX1's procedural player only when it
  // has a real rig and an actually moving attack clip. Idle/Walk/Run may use the
  // presentation-only AnimatedGlbActor fallback when the imported named clips
  // are static; clip names alone are never animation evidence.
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

  engine.castClassSkill=index=>{if(index>=0&&index<5)handlers.requestAction(String(index+1) as AurionGameplayCommand);};
  engine.toggleMount=()=>handlers.requestMount();
  engine.interactNearby=()=>{if(engine.nearbyLoot)handlers.requestAction("E");return{};};
  engine.equipItem=()=>null;engine.unequipItem=()=>null;

  // These local AX1 methods cannot mint truth in the connected runtime. Incoming
  // confirmed snapshots update projected fields directly through the bridges.
  player.takeDamage=()=>({damageTaken:0,isDead:false,dodged:false});
  player.heal=()=>{};player.restoreResource=()=>{};player.consumeResource=()=>false;player.gainXp=()=>false;player.useConsumable=()=>{};player.toggleMount=()=>player.stats.isMounted;player.equipItem=()=>null;player.unequipItem=()=>null;player.unequipSlot=()=>null;player.allocateStatPoint=()=>reject;player.unlockMilestoneSkill=()=>reject;player.equipSkillToHotbar=()=>{};
}
