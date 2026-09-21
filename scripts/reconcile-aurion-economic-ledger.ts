import { reconcileEconomicLedger } from "../server/economy/economicReconciliationService";

function value(flag:string){
  const index=process.argv.indexOf(flag);
  return index>=0?process.argv[index+1]:undefined;
}
const worldId=value("--world");
const confirmation=value("--confirm");
if(!worldId||confirmation!=="RECONCILE_ECONOMIC_EVIDENCE"){
  console.error("usage: reconcile-aurion-economic-ledger --world <worldId> --confirm RECONCILE_ECONOMIC_EVIDENCE");
  process.exit(64);
}
const result=await reconcileEconomicLedger(worldId);
console.log(JSON.stringify(result));
process.exit(result.status==="MATCH"?0:result.status==="UNPROVABLE"?2:3);
