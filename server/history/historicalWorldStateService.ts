import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import type { AurionTemporalEvent } from "../../shared/aurionTemporalEventContract";
import type { HistoricalStateReconstructionResult, TemporalFactRecord, TemporalStateQuery } from "../../shared/aurionTemporalQueryContract";
import { readTemporalEventById, readTemporalEventsForSubject, readTemporalEventsForWorld, verifyTemporalEventSource } from "./aurionTemporalEventPersistence";

async function verifySources(events:readonly AurionTemporalEvent[]):Promise<string|null>{
  const seen=new Set<string>();
  for(const event of events){
    const key=`${event.worldId}:${event.epoch}:${event.sourceWorldRoot}`;
    if(seen.has(key)) continue;
    seen.add(key);
    try{await verifyTemporalEventSource(event);}catch(error){return error instanceof Error?error.message:String(error);}
  }
  return null;
}

export class HistoricalWorldStateService {
  async reconstructStateAtEpoch(query:TemporalStateQuery):Promise<HistoricalStateReconstructionResult>{
    const {worldId,epoch,subjectId,domain,requiredWorldRoot}=query;
    const base={mutationAuthority:"none" as const,worldId,epoch,subjectId,domain,facts:Object.freeze([] as TemporalFactRecord[]),activeEventsCount:0};
    if(!Number.isSafeInteger(epoch)||epoch<1) return {...base,status:"UNPROVABLE",reason:"INVALID_EPOCH_QUERY"};
    let candidates=subjectId?await readTemporalEventsForSubject(worldId,subjectId):await readTemporalEventsForWorld(worldId);
    if(domain) candidates=candidates.filter(event=>event.domain===domain);
    const observed=candidates.filter(event=>event.validFromEpoch<=epoch);
    const sourceGap=await verifySources(observed);
    if(sourceGap) return {...base,status:"UNPROVABLE",reason:sourceGap};

    const superseded=new Set<string>();
    for(const event of observed) for(const predecessor of event.predecessorEventIds) superseded.add(predecessor);
    const active=observed.filter(event=>!superseded.has(event.eventId)&&(event.validToEpoch===null||event.validToEpoch>epoch));
    if(active.length===0){
      const future=candidates.some(event=>event.validFromEpoch>epoch);
      return {...base,status:"UNPROVABLE",reason:future?"QUERY_EPOCH_BEFORE_CREATION":"NO_TEMPORAL_EVIDENCE_FOUND"};
    }
    const gaps:string[]=[];
    for(const event of active) for(const predecessor of event.predecessorEventIds) if(!await readTemporalEventById(predecessor)) gaps.push(`MISSING_PREDECESSOR:${event.eventId}->${predecessor}`);
    if(gaps.length) return {...base,status:"UNPROVABLE",activeEventsCount:active.length,reason:"TEMPORAL_EVIDENCE_GAP",unprovableGaps:Object.freeze(gaps.sort())};

    if(requiredWorldRoot&&!active.some(event=>event.sourceWorldRoot===requiredWorldRoot)) return {...base,status:"UNPROVABLE",activeEventsCount:active.length,reason:"WORLD_ROOT_MISMATCH"};

    const bySubject=new Map<string,string>();
    for(const event of active) for(const subject of (subjectId?event.subjectIds.filter(value=>value===subjectId):event.subjectIds)){
      const key=`${event.domain}::${subject}`,payload=canonicalJson(event.payload),existing=bySubject.get(key);
      if(existing!==undefined&&existing!==payload) return {...base,status:"CONTRADICTED",activeEventsCount:active.length,reason:`CONTRADICTING_FACTS_FOR_SUBJECT:${key}`};
      bySubject.set(key,payload);
    }
    const facts:TemporalFactRecord[]=[];
    for(const event of active) for(const subject of (subjectId?event.subjectIds.filter(value=>value===subjectId):event.subjectIds)) facts.push(Object.freeze({
      factId:`fact_${event.eventId}_${canonicalSha256(subject).slice(-12)}`,eventId:event.eventId,eventHash:event.eventHash,subjectId:subject,domain:event.domain,
      validFromEpoch:event.validFromEpoch,validToEpoch:event.validToEpoch,state:event.payload,evidenceReceiptHash:event.sourceReceiptHash,
      sourceWorldRoot:event.sourceWorldRoot,sourceRevision:event.sourceRevision,rulesetVersion:event.rulesetVersion,predecessorEventIds:event.predecessorEventIds,
    }));
    facts.sort((a,b)=>a.domain.localeCompare(b.domain)||a.subjectId.localeCompare(b.subjectId)||a.eventId.localeCompare(b.eventId));
    const reconstructionHash=canonicalSha256({schema:"aurion.temporal.reconstruction.v1",worldId,epoch,facts:facts.map(f=>({
      eventId:f.eventId,eventHash:f.eventHash,subjectId:f.subjectId,domain:f.domain,state:f.state,evidenceReceiptHash:f.evidenceReceiptHash,sourceWorldRoot:f.sourceWorldRoot,
    }))});
    return {mutationAuthority:"none",status:"MATCH",worldId,epoch,subjectId,domain,facts:Object.freeze(facts),activeEventsCount:active.length,reconstructionHash};
  }
}

export const globalHistoricalWorldStateService=new HistoricalWorldStateService();
