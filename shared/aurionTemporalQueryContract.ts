import type { AurionTemporalDomain } from "./aurionTemporalEventContract";

export type TemporalQueryStatus = "MATCH" | "UNPROVABLE" | "CONTRADICTED";

export interface TemporalStateQuery {
  worldId:string;
  epoch:number;
  subjectId?:string;
  domain?:AurionTemporalDomain;
  requiredWorldRoot?:string;
}

export interface TemporalFactRecord {
  factId:string;
  eventId:string;
  eventHash:string;
  subjectId:string;
  domain:AurionTemporalDomain;
  validFromEpoch:number;
  validToEpoch:number|null;
  state:Readonly<Record<string,unknown>>;
  evidenceReceiptHash:string;
  sourceWorldRoot:string;
  sourceRevision:string;
  rulesetVersion:string;
  predecessorEventIds:readonly string[];
}

export interface HistoricalStateReconstructionResult {
  mutationAuthority:"none";
  status:TemporalQueryStatus;
  worldId:string;
  epoch:number;
  subjectId?:string;
  domain?:AurionTemporalDomain;
  facts:readonly TemporalFactRecord[];
  activeEventsCount:number;
  reason?:string;
  unprovableGaps?:readonly string[];
  reconstructionHash?:string;
}

export interface CausalExplainStep {
  stepIndex:number;
  eventId:string;
  eventHash:string;
  domain:AurionTemporalDomain;
  epoch:number;
  subjectIds:readonly string[];
  sourceReceiptHash:string;
  sourceWorldRoot:string;
  sourceRevision:string;
  rulesetVersion:string;
  predecessorEventIds:readonly string[];
  payload:Readonly<Record<string,unknown>>;
}

export interface CausalExplainResult {
  mutationAuthority:"none";
  status:TemporalQueryStatus;
  targetFact:string;
  targetEpoch:number;
  chain:readonly CausalExplainStep[];
  rootEvidenceReached:boolean;
  reason?:string;
  dagCycleDetected?:boolean;
}
