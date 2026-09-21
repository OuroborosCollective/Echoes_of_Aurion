import { globalHistoricalWorldStateService } from "../server/history/historicalWorldStateService";

function failUsage():never{console.error("usage: --world <id> --epoch <n> [--subject <id>] [--domain <domain>]");process.exit(64);}
async function main(){
  const args=process.argv.slice(2);let worldId="",epoch=NaN,subjectId:string|undefined,domain:any;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--world"&&args[i+1]) worldId=args[++i]!;
    else if(args[i]==="--epoch"&&args[i+1]) epoch=Number(args[++i]);
    else if(args[i]==="--subject"&&args[i+1]) subjectId=args[++i]!;
    else if(args[i]==="--domain"&&args[i+1]) domain=args[++i]!;
    else failUsage();
  }
  if(!worldId||!Number.isSafeInteger(epoch)||epoch<1) failUsage();
  const result=await globalHistoricalWorldStateService.reconstructStateAtEpoch({worldId,epoch,subjectId,domain});
  console.log(JSON.stringify(result));
  process.exit(result.status==="MATCH"?0:result.status==="CONTRADICTED"?1:2);
}
main().catch(error=>{console.error(error);process.exit(2);});
