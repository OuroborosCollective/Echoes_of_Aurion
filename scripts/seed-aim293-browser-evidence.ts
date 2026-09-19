import { createPool } from "mysql2/promise";
import {
  executeConfirmedMerchantAction,
  readConfirmedMerchantActionSource,
} from "../server/npcActionGatewayPersistence";
import { resolveAndRecordNpc } from "../server/wasdAurionRuntime";
import { GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import { npcIdentity, type HubId } from "../server/wasdNpcCapsule";

if(process.env.AURION_E2E_ISOLATED!=="1"||!process.env.DATABASE_URL) throw new Error("AIM293_ISOLATED_BROWSER_DATABASE_REQUIRED");
const url=new URL(process.env.DATABASE_URL);
if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test")) throw new Error("AIM293_ISOLATED_BROWSER_DATABASE_REQUIRED");
const pool=createPool(process.env.DATABASE_URL);
try{
  const [rows]=await pool.query("SELECT DATABASE() AS name");
  if((rows as Array<{name:string}>)[0]?.name!==url.pathname.slice(1)) throw new Error("AIM293_ISOLATED_BROWSER_DATABASE_REQUIRED");
}finally{await pool.end();}

const homeHubId:HubId="observatory_threshold";
const npcId=npcIdentity(homeHubId);
const specs=[
  ["safe_hub","safe"],["resource","resource"],["social","social"],
  ["reputation","reputation"],["market","market"],["influence","influence"],
] as const;
const opportunities=specs.map(([kind,suffix])=>({
  id:`browser-op:0:${suffix}`,kind,regionId:homeHubId,targetId:`target:${suffix}`,
  benefitBps:8_000,riskBps:0,distanceBps:0,sourceReceiptId:"browser-source:0",resolutionIndex:0,
}));
await resolveAndRecordNpc({
  npcId,regionId:homeHubId,resolutionIndex:0,needEvents:[],observationIds:["browser-source:0"],memory:[],roleId:"merchant",
  economy:{currentHubId:homeHubId,wealthCopper:1200,hungerBps:2000,fatigueBps:1500,tradeProwessBps:10500,harvestYieldBps:10000},
  opportunities,
});
const source=await readConfirmedMerchantActionSource(npcId);
if(!source||source.resolutionIndex!==0) throw new Error("AIM293_BROWSER_SOURCE_RECEIPT_REQUIRED");
const action=await executeConfirmedMerchantAction({worldSeed:GLOBAL_WORLD_SEED,homeHubId,sourceDecisionReceiptId:source.receiptId});
if(action.status!=="committed") throw new Error(`AIM293_BROWSER_ACTION_NOT_COMMITTED:${action.status}`);
process.stdout.write(JSON.stringify({
  recordType:"aim293_browser_seed_receipt",
  npcId,
  sourceDecisionReceiptId:source.receiptId,
  actionReceiptId:action.actionReceiptId,
  effectReadbackId:action.effectReadbackId,
  effectReadbackHash:action.effectReadbackHash,
  resolutionIndex:action.npc.decision.resolutionIndex,
  secretValuesReturned:false,
})+"\n");
process.exit(0);
