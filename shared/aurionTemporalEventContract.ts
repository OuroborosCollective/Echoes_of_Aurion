import { canonicalJson, canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_TEMPORAL_EVENT_SCHEMA = "aurion.temporal.event.v1" as const;
export const AURION_TEMPORAL_EVENT_MAX_SUBJECTS = 32;
export const AURION_TEMPORAL_EVENT_MAX_PREDECESSORS = 32;
export const AURION_TEMPORAL_EVENT_MAX_PAYLOAD_BYTES = 60_000;

export const aurionTemporalDomains = ["world","zone","quest","npc","faction","economy","ownership","social"] as const;
export type AurionTemporalDomain = (typeof aurionTemporalDomains)[number];

const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const WORLD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface AurionTemporalEvent {
  schema: typeof AURION_TEMPORAL_EVENT_SCHEMA;
  eventId: string;
  worldId: string;
  epoch: number;
  domain: AurionTemporalDomain;
  subjectIds: readonly string[];
  validFromEpoch: number;
  validToEpoch: number | null;
  sourceReceiptHash: string;
  sourceWorldRoot: string;
  sourceRevision: string;
  rulesetVersion: string;
  predecessorEventIds: readonly string[];
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
  eventHash: string;
}

function sortedUnique(values: readonly string[], pattern: RegExp, maximum: number, label: string): readonly string[] {
  if (values.length < 1 || values.length > maximum) throw new Error(`${label}_COUNT_INVALID`);
  const copy=[...values];
  if (copy.some(value=>!pattern.test(value))) throw new Error(`${label}_IDENTITY_INVALID`);
  const sorted=copy.sort((a,b)=>a<b?-1:a>b?1:0);
  if(new Set(sorted).size!==sorted.length) throw new Error(`${label}_DUPLICATE`);
  return Object.freeze(sorted);
}

function payloadBytes(payload: Readonly<Record<string, unknown>>): number {
  return new TextEncoder().encode(canonicalJson(payload)).byteLength;
}

export function computeTemporalPayloadHash(payload: Readonly<Record<string, unknown>>): string {
  if (payloadBytes(payload) > AURION_TEMPORAL_EVENT_MAX_PAYLOAD_BYTES) throw new Error("TEMPORAL_PAYLOAD_TOO_LARGE");
  return canonicalSha256(payload);
}

export function computeTemporalEventHash(event: Omit<AurionTemporalEvent,"eventHash"|"payloadHash"|"schema"|"payload">, payloadHash: string): string {
  return canonicalSha256({
    schema:AURION_TEMPORAL_EVENT_SCHEMA,
    eventId:event.eventId,
    worldId:event.worldId,
    epoch:event.epoch,
    domain:event.domain,
    subjectIds:[...event.subjectIds],
    validFromEpoch:event.validFromEpoch,
    validToEpoch:event.validToEpoch,
    sourceReceiptHash:event.sourceReceiptHash,
    sourceWorldRoot:event.sourceWorldRoot,
    sourceRevision:event.sourceRevision,
    rulesetVersion:event.rulesetVersion,
    predecessorEventIds:[...event.predecessorEventIds],
    payloadHash,
  });
}

export function createTemporalEvent(params: {
  eventId:string;
  worldId:string;
  epoch:number;
  domain:AurionTemporalDomain;
  subjectIds:readonly string[];
  validFromEpoch?:number;
  validToEpoch?:number|null;
  sourceReceiptHash:string;
  sourceWorldRoot:string;
  sourceRevision:string;
  rulesetVersion:string;
  predecessorEventIds?:readonly string[];
  payload:Readonly<Record<string,unknown>>;
}): AurionTemporalEvent {
  if(!EVENT_ID.test(params.eventId)) throw new Error("TEMPORAL_EVENT_ID_INVALID");
  if(!WORLD_ID.test(params.worldId)) throw new Error("TEMPORAL_WORLD_ID_INVALID");
  if(!Number.isSafeInteger(params.epoch)||params.epoch<1) throw new Error("TEMPORAL_EPOCH_INVALID");
  if(!aurionTemporalDomains.includes(params.domain)) throw new Error("TEMPORAL_DOMAIN_INVALID");
  if(!HASH.test(params.sourceReceiptHash)||!HASH.test(params.sourceWorldRoot)) throw new Error("TEMPORAL_SOURCE_HASH_INVALID");
  if(!REVISION.test(params.sourceRevision)) throw new Error("TEMPORAL_SOURCE_REVISION_INVALID");
  if(!params.rulesetVersion.trim()||params.rulesetVersion.length>64) throw new Error("TEMPORAL_RULESET_INVALID");
  const validFromEpoch=params.validFromEpoch??params.epoch;
  const validToEpoch=params.validToEpoch??null;
  if(!Number.isSafeInteger(validFromEpoch)||validFromEpoch<params.epoch) throw new Error("TEMPORAL_VALID_FROM_INVALID");
  if(validToEpoch!==null&&(!Number.isSafeInteger(validToEpoch)||validToEpoch<=validFromEpoch)) throw new Error("TEMPORAL_VALID_TO_INVALID");
  const subjectIds=sortedUnique(params.subjectIds,SUBJECT_ID,AURION_TEMPORAL_EVENT_MAX_SUBJECTS,"TEMPORAL_SUBJECT");
  const predecessorEventIds=params.predecessorEventIds?.length
    ? sortedUnique(params.predecessorEventIds,EVENT_ID,AURION_TEMPORAL_EVENT_MAX_PREDECESSORS,"TEMPORAL_PREDECESSOR")
    : Object.freeze([] as string[]);
  if(predecessorEventIds.includes(params.eventId)) throw new Error("TEMPORAL_SELF_PREDECESSOR");
  const payload=Object.freeze({...params.payload});
  const payloadHash=computeTemporalPayloadHash(payload);
  const base={eventId:params.eventId,worldId:params.worldId,epoch:params.epoch,domain:params.domain,subjectIds,validFromEpoch,validToEpoch,
    sourceReceiptHash:params.sourceReceiptHash,sourceWorldRoot:params.sourceWorldRoot,sourceRevision:params.sourceRevision,
    rulesetVersion:params.rulesetVersion,predecessorEventIds};
  return Object.freeze({schema:AURION_TEMPORAL_EVENT_SCHEMA,...base,payload,payloadHash,eventHash:computeTemporalEventHash(base,payloadHash)});
}

export function verifyTemporalEventIntegrity(event:AurionTemporalEvent): {valid:boolean;reason?:string} {
  try {
    if(event.schema!==AURION_TEMPORAL_EVENT_SCHEMA) return {valid:false,reason:"INVALID_SCHEMA"};
    const normalized=createTemporalEvent({...event,predecessorEventIds:event.predecessorEventIds,payload:event.payload});
    if(canonicalJson(normalized)!==canonicalJson(event)) return {valid:false,reason:"NON_CANONICAL_OR_HASH_MISMATCH"};
    return {valid:true};
  } catch(error) {
    return {valid:false,reason:error instanceof Error?error.message:String(error)};
  }
}
