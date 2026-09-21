import type { AurionTemporalDomain, AurionTemporalEvent } from "./aurionTemporalEventContract";

export type TemporalQueryStatus = "MATCH" | "UNPROVABLE" | "CONTRADICTED";

export interface TemporalStateQuery {
  worldId: string;
  epoch: number;
  subjectId?: string;
  domain?: AurionTemporalDomain;
  requiredWorldRoot?: string;
}

export interface TemporalFactRecord {
  factId: string;
  eventId: string;
  subjectId: string;
  domain: AurionTemporalDomain;
  validFromEpoch: number;
  validToEpoch: number | null;
  state: Record<string, unknown>;
  payload?: Record<string, unknown>;
  evidenceReceiptHash: string;
  sourceWorldRoot: string;
  predecessorEventIds: string[];
}

export interface HistoricalStateReconstructionResult {
  status: TemporalQueryStatus;
  worldId: string;
  epoch: number;
  subjectId?: string;
  domain?: AurionTemporalDomain;
  facts: TemporalFactRecord[];
  activeEventsCount: number;
  reason?: string;
  unprovableGaps?: string[];
  reconstructedWorldRoot?: string;
}

export interface CausalExplainStep {
  stepIndex: number;
  eventId: string;
  domain: AurionTemporalDomain;
  epoch: number;
  subjectIds: string[];
  description: string;
  sourceReceiptHash: string;
  receiptHash?: string;
  sourceWorldRoot: string;
  predecessorEventIds: string[];
  payload: Record<string, unknown>;
}

export interface CausalExplainResult {
  status: TemporalQueryStatus;
  targetFact: string;
  targetEpoch: number;
  chain: CausalExplainStep[];
  rootEvidenceReached: boolean;
  reason?: string;
  dagCycleDetected?: boolean;
}
