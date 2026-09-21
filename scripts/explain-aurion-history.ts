import { globalCausalHistoryExplainService } from "../server/history/causalHistoryExplainService";

function failUsage():never{console.error("usage: --world <id> --epoch <n> --fact <event-or-subject>");process.exit(64);}
async function main(){
  const args=process.argv.slice(2);let worldId="",epoch=NaN,fact="";
  for(let i=0;i<args.length;i++){
    if(args[i]==="--world"&&args[i+1]) worldId=args[++i]!;
    else if(args[i]==="--epoch"&&args[i+1]) epoch=Number(args[++i]);
    else if(args[i]==="--fact"&&args[i+1]) fact=args[++i]!;
    else failUsage();
  }
  if(!worldId||!fact||!Number.isSafeInteger(epoch)||epoch<1) failUsage();
  const result=await globalCausalHistoryExplainService.explainFactAtEpoch({worldId,targetFactOrEventId:fact,epoch});
  console.log(JSON.stringify(result));
  process.exit(result.status==="MATCH"?0:result.status==="CONTRADICTED"?1:2);
}
main().catch(error=>{console.error(error);process.exit(2);});
