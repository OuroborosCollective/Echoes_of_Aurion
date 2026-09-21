import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { economicResourceImbalances } from "../../shared/aurionEconomicEventContract";
import { readAssetLineage } from "./ownershipLedger";
import { readEconomicEvents, verifyEconomicMaterializedEvent } from "./economicLedgerPersistence";
import { readEconomicSourceCoverage } from "./economicSourceCoverage";

function reasonOf(error:unknown){return error instanceof Error?error.message:String(error);}

function isUnprovableReason(reason:string){
  return reason.includes("_MISSING")||
    reason.includes("_UNAVAILABLE")||
    reason.includes("_UNPROVABLE")||
    reason.includes("_UNSUPPORTED")||
    reason.includes("_LIMIT");
}

export async function auditEconomicLedger(worldId:string){
  const coverage=await readEconomicSourceCoverage(worldId);
  let events:Awaited<ReturnType<typeof readEconomicEvents>>;
  try{
    events=await readEconomicEvents(worldId);
  }catch(error){
    const reason=reasonOf(error);
    const auditHash=canonicalSha256({
      schema:"aurion.economic-audit.v3",worldId,status:"UNPROVABLE",reason,coverageHash:coverage.coverageHash,coverageStatus:coverage.status,
    });
    return Object.freeze({
      mutationAuthority:"none" as const,status:"UNPROVABLE" as const,worldId,reason,eventCount:0,
      resourceSupplyDeltas:Object.freeze({}),assetCount:0,violations:Object.freeze([]),gaps:Object.freeze([reason]),coverage,auditHash,
    });
  }

  const supply=new Map<string,bigint>(),assets=new Set<string>(),violations:string[]=[],gaps:string[]=[];
  for(const event of events){
    for(const imbalance of economicResourceImbalances(event.resourceDeltas)){
      violations.push(`UNBALANCED_EVENT:${event.eventId}:${imbalance.resourceId}:${imbalance.deltaExact}`);
    }
    try{
      await verifyEconomicMaterializedEvent(event);
    }catch(error){
      const reason=reasonOf(error);
      const record=`SOURCE_PROVENANCE:${event.eventId}:${reason}`;
      if(isUnprovableReason(reason)) gaps.push(record); else violations.push(record);
    }
    for(const delta of event.resourceDeltas)supply.set(delta.resourceId,(supply.get(delta.resourceId)??0n)+BigInt(delta.deltaExact));
    for(const transition of event.assetTransitions)assets.add(transition.assetId);
  }
  for(const [resourceId,total] of supply) if(total!==0n) violations.push(`UNBALANCED_SUPPLY:${resourceId}:${total.toString(10)}`);
  for(const assetId of [...assets].sort()){
    try{
      const lineage=await readAssetLineage(worldId,assetId);
      if(lineage.status==="CONTRADICTED") violations.push(`ASSET_LINEAGE:${assetId}:CONTRADICTED`);
      else if(lineage.status==="UNPROVABLE") gaps.push(`ASSET_LINEAGE:${assetId}:UNPROVABLE`);
    }catch(error){
      gaps.push(`ASSET_LINEAGE:${assetId}:${reasonOf(error)}`);
    }
  }
  const resourceSupplyDeltas=Object.freeze(Object.fromEntries(
    [...supply.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value.toString(10)]),
  ));
  const status=violations.length||coverage.status==="CONTRADICTED"
    ?"CONTRADICTED" as const
    :gaps.length||coverage.status==="UNPROVABLE"
      ?"UNPROVABLE" as const
      :"MATCH" as const;
  const auditHash=canonicalSha256({
    schema:"aurion.economic-audit.v3",worldId,status,eventHashes:events.map(event=>event.eventHash),resourceSupplyDeltas,
    violations:[...violations].sort(),gaps:[...gaps].sort(),coverageHash:coverage.coverageHash,coverageStatus:coverage.status,
  });
  return Object.freeze({
    mutationAuthority:"none" as const,status,worldId,
    reason:status==="CONTRADICTED"?"ECONOMIC_AUDIT_CONTRADICTED":status==="UNPROVABLE"?"ECONOMIC_AUDIT_UNPROVABLE":null,
    eventCount:events.length,resourceSupplyDeltas,assetCount:assets.size,
    violations:Object.freeze(violations.sort()),gaps:Object.freeze(gaps.sort()),coverage,auditHash,
  });
}
