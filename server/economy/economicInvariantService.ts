import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { readAssetLineage } from "./ownershipLedger";
import { readEconomicEvents } from "./economicLedgerPersistence";
import { readEconomicSourceCoverage } from "./economicSourceCoverage";

export async function auditEconomicLedger(worldId:string){
  const events=await readEconomicEvents(worldId);
  const supply=new Map<string,bigint>(),assets=new Set<string>(),violations:string[]=[];
  for(const event of events){
    for(const delta of event.resourceDeltas)supply.set(delta.resourceId,(supply.get(delta.resourceId)??0n)+BigInt(delta.deltaExact));
    for(const transition of event.assetTransitions)assets.add(transition.assetId);
  }
  for(const assetId of [...assets].sort()){
    const lineage=await readAssetLineage(worldId,assetId);
    if(lineage.status!=="MATCH")violations.push(`${assetId}:${lineage.status}`);
  }
  const resourceSupplyDeltas=Object.freeze(Object.fromEntries([...supply.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value.toString(10)])));
  const coverage=await readEconomicSourceCoverage(worldId);
  const status=violations.length?"CONTRADICTED" as const:coverage.status==="MATCH"?"MATCH" as const:"UNPROVABLE" as const;
  const auditHash=canonicalSha256({
    schema:"aurion.economic-audit.v2",worldId,eventHashes:events.map(event=>event.eventHash),resourceSupplyDeltas,
    violations:[...violations].sort(),coverageHash:coverage.coverageHash,coverageStatus:coverage.status,
  });
  return Object.freeze({
    mutationAuthority:"none" as const,status,worldId,eventCount:events.length,resourceSupplyDeltas,assetCount:assets.size,
    violations:Object.freeze(violations.sort()),coverage,auditHash,
  });
}
