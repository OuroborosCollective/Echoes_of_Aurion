import { auditEconomicLedger } from "../server/economy/economicInvariantService";

function value(flag:string){
  const index=process.argv.indexOf(flag);
  return index>=0?process.argv[index+1]:undefined;
}
const worldId=value("--world");
if(!worldId){
  console.error("usage: read-aurion-economic-audit --world <worldId>");
  process.exit(64);
}
const result=await auditEconomicLedger(worldId);
console.log(JSON.stringify(result));
process.exit(result.status==="MATCH"?0:result.status==="UNPROVABLE"?2:3);
