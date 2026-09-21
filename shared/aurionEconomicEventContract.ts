import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_ECONOMIC_EVENT_SCHEMA = "aurion.economic-event.v2" as const;
export const aurionEconomicSourceKinds = ["trade_crafting","loot_v2","market_transaction","system_sale","guild_bank","progression_points"] as const;
export type AurionEconomicSourceKind = (typeof aurionEconomicSourceKinds)[number];
export type AurionEconomicEventType = "economic_transition";

export type AurionEconomicResourceDelta = Readonly<{resourceId:string;accountId:string;deltaExact:string}>;
export type AurionEconomicAssetTransition = Readonly<{
  assetId:string;
  transitionKind:"create"|"transfer"|"consume";
  fromOwnerId:string|null;
  toOwnerId:string|null;
}>;

export interface AurionEconomicEvent {
  schema:typeof AURION_ECONOMIC_EVENT_SCHEMA;
  eventId:string;
  worldId:string;
  epoch:number;
  eventType:AurionEconomicEventType;
  sourceKind:AurionEconomicSourceKind;
  sourceId:string;
  sourceEvidenceHash:string;
  temporalEventId:string;
  temporalEventHash:string;
  sourceWorldRoot:string;
  sourceRevision:string;
  rulesetVersion:string;
  resourceDeltas:readonly AurionEconomicResourceDelta[];
  assetTransitions:readonly AurionEconomicAssetTransition[];
  eventHash:string;
}

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH=/^sha256:[a-f0-9]{64}$/;
const REV=/^[a-f0-9]{40}$/;
const EXACT=/^-?(0|[1-9][0-9]*)$/;

function canonDeltas(values:readonly AurionEconomicResourceDelta[]):readonly AurionEconomicResourceDelta[]{
  const rows=values.map(value=>{
    if(!ID.test(value.resourceId)||!ID.test(value.accountId)||!EXACT.test(value.deltaExact)||BigInt(value.deltaExact)===0n) throw new Error("ECONOMIC_RESOURCE_DELTA_INVALID");
    return Object.freeze({...value});
  }).sort((a,b)=>a.resourceId.localeCompare(b.resourceId)||a.accountId.localeCompare(b.accountId));
  const keys=rows.map(row=>`${row.resourceId}:${row.accountId}`);
  if(new Set(keys).size!==keys.length) throw new Error("ECONOMIC_RESOURCE_DELTA_DUPLICATE");
  return Object.freeze(rows);
}
function canonAssets(values:readonly AurionEconomicAssetTransition[]):readonly AurionEconomicAssetTransition[]{
  const rows=values.map(value=>{
    if(!ID.test(value.assetId)||value.fromOwnerId!==null&&!ID.test(value.fromOwnerId)||value.toOwnerId!==null&&!ID.test(value.toOwnerId)) throw new Error("ECONOMIC_ASSET_TRANSITION_INVALID");
    if(value.transitionKind==="create"&&(value.fromOwnerId!==null||value.toOwnerId===null)) throw new Error("ECONOMIC_ASSET_CREATE_INVALID");
    if(value.transitionKind==="transfer"&&(value.fromOwnerId===null||value.toOwnerId===null||value.fromOwnerId===value.toOwnerId)) throw new Error("ECONOMIC_ASSET_TRANSFER_INVALID");
    if(value.transitionKind==="consume"&&(value.fromOwnerId===null||value.toOwnerId!==null)) throw new Error("ECONOMIC_ASSET_CONSUME_INVALID");
    return Object.freeze({...value});
  }).sort((a,b)=>a.assetId.localeCompare(b.assetId));
  if(new Set(rows.map(row=>row.assetId)).size!==rows.length) throw new Error("ECONOMIC_ASSET_TRANSITION_DUPLICATE");
  return Object.freeze(rows);
}

export function createEconomicEvent(input:Omit<AurionEconomicEvent,"schema"|"eventHash"|"resourceDeltas"|"assetTransitions">&{
  resourceDeltas:readonly AurionEconomicResourceDelta[];
  assetTransitions:readonly AurionEconomicAssetTransition[];
}):AurionEconomicEvent{
  for(const id of [input.eventId,input.worldId,input.sourceId,input.temporalEventId]) if(!ID.test(id)) throw new Error("ECONOMIC_IDENTITY_INVALID");
  if(!Number.isSafeInteger(input.epoch)||input.epoch<1) throw new Error("ECONOMIC_EPOCH_INVALID");
  if(!aurionEconomicSourceKinds.includes(input.sourceKind)) throw new Error("ECONOMIC_SOURCE_KIND_INVALID");
  if(!HASH.test(input.sourceEvidenceHash)||!HASH.test(input.temporalEventHash)||!HASH.test(input.sourceWorldRoot)) throw new Error("ECONOMIC_HASH_INVALID");
  if(!REV.test(input.sourceRevision)||!input.rulesetVersion.trim()||input.rulesetVersion.length>64) throw new Error("ECONOMIC_SOURCE_IDENTITY_INVALID");
  const resourceDeltas=canonDeltas(input.resourceDeltas),assetTransitions=canonAssets(input.assetTransitions);
  if(input.eventType!=="economic_transition"||(resourceDeltas.length===0&&assetTransitions.length===0)) throw new Error("ECONOMIC_EVENT_SHAPE_INVALID");
  const unsigned={schema:AURION_ECONOMIC_EVENT_SCHEMA,...input,resourceDeltas,assetTransitions};
  return Object.freeze({...unsigned,eventHash:canonicalSha256(unsigned)});
}
