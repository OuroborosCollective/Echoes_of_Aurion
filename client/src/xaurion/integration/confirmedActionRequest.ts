import { ax1BladeSkillForCommand } from "@shared/ax1BladeSkillProtocol";
import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";
import { requestZoneBasicAttack, requestZoneSkill, zoneCombatAvailable } from "./zoneCombatBridge";

export const WORLD_PANEL_SELECTOR='[data-aurion-panel="open"], [role="dialog"][data-state="open"], .community-overlay[data-opened-from-world="true"]';
export type ActionOutcome={confirmed:boolean;completed:boolean;message:string};
export type ActionCompletion=(outcome:ActionOutcome)=>void;
export const AURION_COMBAT_FEEDBACK_EVENT = "aurion:combat-feedback";

/**
 * Aurion requests gameplay only from its live server zone contract.
 * There is deliberately no local encounter or arena fallback.
 */
export function requestConfirmedAction(command:AurionGameplayCommand):Promise<ActionOutcome>{
  if(!zoneCombatAvailable())return Promise.resolve({confirmed:false,completed:false,message:"Aurion-Zonenvertrag nicht verbunden; kein lokaler Gameplay-Fallback."});
  if(command==="F")return requestZoneBasicAttack();
  // Mapping selects only the typed transport intent; the zone server still decides acceptance.
  const skill = ax1BladeSkillForCommand(command);
  if(skill)return requestZoneSkill(skill.skillId);
  return Promise.resolve({confirmed:false,completed:false,message:`Aktion ${command} ist über diesen Client noch nicht mit dem Aurion-Zonenserver verbunden.`});
}

/** Timers schedule requests only. This controller cannot infer damage, issue receipts or retry a lost action. */
export class ConfirmedAutoAttack{
  private active=false;private busy=false;private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private request:()=>Promise<ActionOutcome>,private permitted:()=>boolean,private changed:(active:boolean,message?:string)=>void){}
  start(){if(this.active||this.busy||!this.permitted())return;this.active=true;this.changed(true);void this.step();}
  stop(message?:string){this.active=false;clearTimeout(this.timer);this.timer=undefined;this.changed(false,message);}
  private async step(){if(!this.active||this.busy||!this.permitted()){this.stop();return;}this.busy=true;try{const outcome=await this.request();if(!outcome.confirmed||outcome.completed)this.stop(outcome.message);}catch{this.stop("Auto-Angriff nach fehlender Bestätigung angehalten.");}finally{this.busy=false;if(this.active&&this.permitted())this.timer=setTimeout(()=>{void this.step();},1_100);else this.stop();}}
}
