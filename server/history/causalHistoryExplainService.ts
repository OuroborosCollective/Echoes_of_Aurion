import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import type { AurionTemporalEvent } from "../../shared/aurionTemporalEventContract";
import type { CausalExplainResult, CausalExplainStep } from "../../shared/aurionTemporalQueryContract";
import { readTemporalEventById, readTemporalEventsForSubject, verifyTemporalEventSource } from "./aurionTemporalEventPersistence";

export class CausalHistoryExplainService {
  async explainFactAtEpoch(params:{worldId:string;targetFactOrEventId:string;epoch:number;maxDepth?:number}):Promise<CausalExplainResult>{
    const {worldId,targetFactOrEventId,epoch}=params,maxDepth=params.maxDepth??64;
    const base={mutationAuthority:"none" as const,targetFact:targetFactOrEventId,targetEpoch:epoch,chain:Object.freeze([] as CausalExplainStep[]),rootEvidenceReached:false};
    if(!Number.isSafeInteger(epoch)||epoch<1||!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>64) return {...base,status:"UNPROVABLE",reason:"CAUSAL_QUERY_INVALID"};
    let event:AurionTemporalEvent|null=null;
    try{
      event=await readTemporalEventById(targetFactOrEventId);
      if(!event&&targetFactOrEventId.startsWith("fact_")){
        const match=/^fact_(.+)_([a-f0-9]{12})$/.exec(targetFactOrEventId);
        if(match){
          const candidate=await readTemporalEventById(match[1]!);
          if(candidate&&candidate.subjectIds.some(subject=>`fact_${candidate.eventId}_${canonicalSha256(subject).slice(-12)}`===targetFactOrEventId)) event=candidate;
        }
      }
      if(!event){
        const candidates=(await readTemporalEventsForSubject(worldId,targetFactOrEventId)).filter(value=>value.validFromEpoch<=epoch&&(value.validToEpoch===null||value.validToEpoch>epoch));
        event=[...candidates].sort((a,b)=>b.validFromEpoch-a.validFromEpoch||b.eventId.localeCompare(a.eventId))[0]??null;
      }
    }catch(error){
      return {...base,status:"UNPROVABLE",reason:error instanceof Error?error.message:String(error)};
    }
    if(!event||event.worldId!==worldId) return {...base,status:"UNPROVABLE",reason:"TARGET_FACT_NOT_FOUND_IN_HISTORY"};
    if(event.validFromEpoch>epoch||(event.validToEpoch!==null&&event.validToEpoch<=epoch)) return {...base,status:"UNPROVABLE",reason:"FACT_NOT_VALID_AT_TARGET_EPOCH"};

    const chain:CausalExplainStep[]=[],visited=new Set<string>(),queue=[{eventId:event.eventId,path:Object.freeze([] as string[])}];
    while(queue.length){
      const queued=queue.shift()!,currentId=queued.eventId;
      if(queued.path.includes(currentId)) return {...base,status:"CONTRADICTED",chain:Object.freeze(chain),dagCycleDetected:true,reason:"CAUSAL_DAG_CYCLE_DETECTED"};
      if(visited.has(currentId)) continue;
      if(chain.length>=maxDepth) return {...base,status:"UNPROVABLE",chain:Object.freeze(chain),reason:"CAUSAL_MAX_DEPTH_EXCEEDED"};
      visited.add(currentId);
      let current:AurionTemporalEvent|null=null;
      try{current=await readTemporalEventById(currentId);}catch(error){return {...base,status:"UNPROVABLE",chain:Object.freeze(chain),reason:error instanceof Error?error.message:String(error)};}
      if(!current) return {...base,status:"UNPROVABLE",chain:Object.freeze(chain),reason:"TEMPORAL_EVIDENCE_GAP"};
      try{await verifyTemporalEventSource(current);}catch(error){return {...base,status:"UNPROVABLE",chain:Object.freeze(chain),reason:error instanceof Error?error.message:String(error)};}
      chain.push(Object.freeze({stepIndex:chain.length,eventId:current.eventId,eventHash:current.eventHash,domain:current.domain,epoch:current.epoch,
        subjectIds:current.subjectIds,sourceReceiptHash:current.sourceReceiptHash,sourceWorldRoot:current.sourceWorldRoot,sourceRevision:current.sourceRevision,
        rulesetVersion:current.rulesetVersion,predecessorEventIds:current.predecessorEventIds,payload:current.payload}));
      const nextPath=Object.freeze([...queued.path,currentId]);
      for(const predecessor of current.predecessorEventIds) queue.push({eventId:predecessor,path:nextPath});
    }
    return {mutationAuthority:"none",status:"MATCH",targetFact:targetFactOrEventId,targetEpoch:epoch,chain:Object.freeze(chain),rootEvidenceReached:true};
  }
}
export const globalCausalHistoryExplainService=new CausalHistoryExplainService();
