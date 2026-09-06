import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";
import { requestZoneBasicAttack, zoneCombatAvailable } from "./zoneCombatBridge";

export const WORLD_PANEL_SELECTOR='[data-aurion-panel="open"], [role="dialog"][data-state="open"], .community-overlay[data-opened-from-world="true"]';
export type ActionOutcome={confirmed:boolean;completed:boolean;message:string};
export type ActionCompletion=(outcome:ActionOutcome)=>void;

/**
 * AX1 requests gameplay only from the live WASD zone contract.
 * There is deliberately no Aurion encounter/arena fallback.
 */
export function requestConfirmedAction(command:AurionGameplayCommand):Promise<ActionOutcome>{
  if(!zoneCombatAvailable())return Promise.resolve({confirmed:false,completed:false,message:"WASD-Zonenvertrag nicht verbunden; kein Aurion-Gameplay-Fallback."});
  if(command==="F")return requestZoneBasicAttack();
  return Promise.resolve({confirmed:false,completed:false,message:`${command} ist im WASD-Zonenvertrag noch nicht freigeschaltet.`});
}

/** Timers schedule requests only. This controller cannot infer damage, issue receipts or retry a lost action. */
export class ConfirmedAutoAttack{
  private active=false;private busy=false;private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private request:()=>Promise<ActionOutcome>,private permitted:()=>boolean,private changed:(active:boolean,message?:string)=>void){}
  start(){if(this.active||this.busy||!this.permitted())return;this.active=true;this.changed(true);void this.step();}
  stop(message?:string){this.active=false;clearTimeout(this.timer);this.timer=undefined;this.changed(false,message);}
  private async step(){if(!this.active||this.busy||!this.permitted()){this.stop();return;}this.busy=true;try{const outcome=await this.request();if(!outcome.confirmed||outcome.completed)this.stop(outcome.message);}catch{this.stop("Auto-Angriff nach fehlender Bestätigung angehalten.");}finally{this.busy=false;if(this.active&&this.permitted())this.timer=setTimeout(()=>{void this.step();},1_100);else this.stop();}}
}
