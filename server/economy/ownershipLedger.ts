import { readEconomicEvents } from "./economicLedgerPersistence";

export type AssetLineageStep=Readonly<{
  eventId:string;
  eventHash:string;
  transitionKind:"create"|"transfer"|"consume";
  fromOwnerId:string|null;
  toOwnerId:string|null;
  epoch:number;
  sourceEvidenceHash:string;
}>;

export async function readAssetLineage(worldId:string,assetId:string){
  const events=await readEconomicEvents(worldId);
  const steps:AssetLineageStep[]=[];
  let owner:string|null=null,created=false,contradicted=false;
  for(const event of events)for(const transition of event.assetTransitions)if(transition.assetId===assetId){
    if(transition.transitionKind==="create"){
      if(created||transition.fromOwnerId!==null||transition.toOwnerId===null)contradicted=true;
      created=true;owner=transition.toOwnerId;
    }else if(transition.transitionKind==="transfer"){
      if(!created||owner!==transition.fromOwnerId||transition.toOwnerId===null)contradicted=true;
      owner=transition.toOwnerId;
    }else{
      if(!created||owner!==transition.fromOwnerId||transition.toOwnerId!==null)contradicted=true;
      owner=null;
    }
    steps.push(Object.freeze({eventId:event.eventId,eventHash:event.eventHash,transitionKind:transition.transitionKind,fromOwnerId:transition.fromOwnerId,toOwnerId:transition.toOwnerId,epoch:event.epoch,sourceEvidenceHash:event.sourceEvidenceHash}));
  }
  return Object.freeze({mutationAuthority:"none" as const,status:!steps.length?"UNPROVABLE" as const:contradicted?"CONTRADICTED" as const:"MATCH" as const,assetId,currentOwnerId:owner,steps:Object.freeze(steps)});
}
