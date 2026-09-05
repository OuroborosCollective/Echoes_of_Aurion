import { operationalNow } from "../shared/operationalClock";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { aurionPlayerUiSettings } from "../drizzle/playerUiSchema";

const eventNames: Record<string,string> = {
 "gameplay.enterOpenWorld":"Aurion World Entered", "gameplay.act":"Aurion Encounter Action Confirmed",
 "gameplay.completeQuest":"Aurion Quest Completed", "player.collectLoot":"Aurion Loot Collected",
 "player.equipItem":"Aurion Item Equipped", "crafting.craft":"Aurion Craft Completed", "groups.command":"Aurion Group Command Confirmed",
};
type AnalyticsEvent={user_id:string;event_type:string;insert_id:string;time:number;event_properties:{release:string;procedure:string}};
export class AmplitudeDelivery {
 private pending: AnalyticsEvent[]=[]; private owners=new Map<string,number>(); private epochs=new Map<number,number>(); private timer: ReturnType<typeof setTimeout>|undefined; private sending=false;
 private delivered=0; private dropped=0; private retries=0;
 constructor(private readonly config:{key:string;salt:string;zone:"US"|"EU";release:string}|null,private readonly consent:(id:number)=>Promise<boolean>,private readonly send:typeof fetch=fetch){}
 status(){return {configured:Boolean(this.config),pending:this.pending.length,delivered:this.delivered,dropped:this.dropped};}
 async record(userId:number,procedure:string,receiptKey:string){
  const config=this.config,type=eventNames[procedure];if(!config||!type)return;
  const epoch=this.epochs.get(userId)??0;
  try { if(!(await this.consent(userId))||(this.epochs.get(userId)??0)!==epoch)return; } catch { return; }
  const identity=createHmac("sha256",config.salt).update(`aurion-user:${userId}`).digest("hex");
  this.owners.set(identity,userId);
  const insert=createHmac("sha256",config.salt).update(`${identity}:${procedure}:${receiptKey}`).digest("hex");
  if(this.pending.some(e=>e.insert_id===insert))return;if(this.pending.length>=100){this.dropped++;return;}
  this.pending.push({user_id:identity,event_type:type,insert_id:insert,time:operationalNow(),event_properties:{release:config.release,procedure}});this.schedule();
 }
 private schedule(){if(this.timer||this.sending||!this.pending.length)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},2000);this.timer.unref?.();}
 async flush(){
  if(this.sending||!this.config||!this.pending.length)return;this.sending=true;
  let batch=this.pending.splice(0,25);
  try{
   const permitted: AnalyticsEvent[]=[];for(const event of batch)if(await this.consent(this.owners.get(event.user_id)!))permitted.push(event);batch=permitted;if(!batch.length)return;
   const response=await this.send(this.config.zone==="EU"?"https://api.eu.amplitude.com/2/httpapi":"https://api2.amplitude.com/2/httpapi",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:this.config.key,events:batch}),signal:AbortSignal.timeout(5000)});
   if(!response.ok){if(response.status===429||response.status>=500)throw Error("retryable");this.dropped+=batch.length;this.retries=0;}
   else {const reply=await response.json() as {code?:number;events_ingested?:number};if(reply.code!==200||reply.events_ingested!==batch.length)throw Error("unconfirmed_ingestion");this.delivered+=batch.length;this.retries=0;}
  }catch{if(++this.retries<3){const room=100-this.pending.length;this.pending.unshift(...batch.slice(0,room));this.dropped+=Math.max(0,batch.length-room);}else{this.dropped+=batch.length;this.retries=0;}}
  finally{this.sending=false;this.schedule();}
 }
 /** Withdrawal discards queued events for this identity; no further events pass consent. */
 forget(userId:number){this.epochs.set(userId,(this.epochs.get(userId)??0)+1);if(!this.config)return;const id=createHmac("sha256",this.config.salt).update(`aurion-user:${userId}`).digest("hex");this.pending=this.pending.filter(e=>e.user_id!==id);}
 close(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.dropped+=this.pending.length;this.pending=[];}
}
const configured=process.env.AURION_AMPLITUDE_ENABLED==="true"&&Boolean(process.env.AMPLITUDE_API_KEY)&&Boolean(process.env.AMPLITUDE_USER_SALT&&process.env.AMPLITUDE_USER_SALT.length>=32)&&["EU","US"].includes(process.env.AMPLITUDE_SERVER_ZONE??"");
export const amplitudeAnalytics=new AmplitudeDelivery(configured?{key:process.env.AMPLITUDE_API_KEY!,salt:process.env.AMPLITUDE_USER_SALT!,zone:process.env.AMPLITUDE_SERVER_ZONE as "EU"|"US",release:process.env.AURION_RELEASE_SHA??"development"}:null,async userId=>{
 const db=await getDb();if(!db)return false;const [row]=await db.select({consent:aurionPlayerUiSettings.analyticsConsent}).from(aurionPlayerUiSettings).where(eq(aurionPlayerUiSettings.userId,userId));return row?.consent===1;
});
