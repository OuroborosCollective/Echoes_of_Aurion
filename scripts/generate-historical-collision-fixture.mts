/** Executed against the independently checked-out, unchanged pre-PR authority.
 * Produces isolated deterministic regression evidence, never production state.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { AuthoritativeMovementZone } from "../server/zoneRuntime";
import { AurionTickRecorder } from "../server/causality/tickRecorder";
import { worldNatureCollision, WORLD_PLAYER_COLLISION_RADIUS_MM } from "../server/worldNatureCollision";
import { AURION_CAUSAL_TICK_SCHEMA_V2 } from "../shared/aurionCausalTickContract";
const sourceRevision="3b050eb06e2903f359cb2554048e6a077f9102ae";
const sourceHash=createHash("sha256").update(fs.readFileSync(new URL("../shared/worldAssetProtocol.ts",import.meta.url))).digest("hex");
if(sourceHash!=="c4ba0b2786e824183f17e662c18e691f8f177aef5bc6fe1fd5086a9ff08a69a9")throw Error("HISTORICAL_SOURCE_BYTES_MISMATCH");
let boundary:{x:number;z:number}|undefined;
for(const coordinate of [{x:-1,z:0},{x:0,z:-1},{x:-1,z:-1}])for(const o of worldNatureCollision.obstaclesForChunk(coordinate)){
 const z=o.origin.z+Math.trunc((o.min.z+o.max.z)/2);
 for(let x=o.origin.x+o.max.x+WORLD_PLAYER_COLLISION_RADIUS_MM+400;x>o.origin.x+o.min.x-WORLD_PLAYER_COLLISION_RADIUS_MM;x-=10){
  if(Math.abs(x)>55000||Math.abs(z)>55000)continue;
  const from={x,z},resolved=worldNatureCollision.resolve(from,{x:x-340,z});
  if(!worldNatureCollision.blockingObstacle(from,from)&&resolved.x===x&&resolved.z===z){boundary=from;break;}
 }
 if(boundary)break;
}
if(!boundary)throw Error("HISTORICAL_BLOCKING_BOUNDARY_REQUIRED");
const setup=new AuthoritativeMovementZone("observatory_threshold:pre-city-replay" as never,new AurionTickRecorder());
setup.receiptSchemaOverride=AURION_CAUSAL_TICK_SCHEMA_V2;setup.sourceRevisionOverride=sourceRevision;
// Explicit transport double: only membership intent generation is under test.
setup.join({userId:9101,socket:{readyState:1,OPEN:1,send(){},close(){}} as never,combatProfile:{combatLevel:7,maxHealth:600,weaponBonus:15,weaponTrack:"blade"}});
setup.tick();
const preState=JSON.parse(JSON.stringify(setup.getCanonicalZoneState()));
Object.assign(preState.players[0],{...boundary,inputX:-1,inputZ:0});
const zone=new AuthoritativeMovementZone(preState.zoneId,new AurionTickRecorder());
zone.receiptSchemaOverride=AURION_CAUSAL_TICK_SCHEMA_V2;zone.sourceRevisionOverride=sourceRevision;
zone.restoreFromCanonicalState(preState,setup.getLatestReceipt()!.receiptHash);zone.tick();
const receipt=zone.getLatestReceipt()!,postState=zone.getCanonicalZoneState();
if(postState.players[0]!.x!==boundary.x)throw Error("HISTORICAL_COLLISION_MUST_BLOCK");
fs.writeFileSync(process.argv[2]!,JSON.stringify({sourceRevision,sourceHash,preState,intents:[],receipt,postState,boundary}));
console.log(JSON.stringify({historicalRevision:sourceRevision,historicalSourceSha256:sourceHash,blockedAt:boundary,receiptHash:receipt.receiptHash,fixtureOnly:true}));
