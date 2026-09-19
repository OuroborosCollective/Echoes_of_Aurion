import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_HEADLESS_CAUSAL_ORACLE_SCHEMA = "aurion.headless-causal-oracle.v2" as const;
export type AurionHeadlessCausalOracleStatus = "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE";

export interface AurionOracleCheckpointIdentity {
  worldId: string;
  zoneId: string;
  tick: number;
  snapshotHash: string;
}

export interface AurionHeadlessCausalOracleResult {
  schema: typeof AURION_HEADLESS_CAUSAL_ORACLE_SCHEMA;
  mutationAuthority: "none";
  status: AurionHeadlessCausalOracleStatus;
  zoneId: string;
  requestedRange: { fromTick: number; toTick: number };
  checkpoint: AurionOracleCheckpointIdentity | null;
  warmupTicks: readonly number[];
  verifiedTicks: readonly number[];
  sourceRevision: string | null;
  rulesetVersion: string | null;
  firstDivergence: {
    tick: number;
    stage: string;
    expectedHash: string;
    observedHash: string;
  } | null;
  reason: string | null;
  terminalReceiptHash: string | null;
  finalStateHash: string | null;
  oracleResultHash: string;
}

export type AurionHeadlessCausalOracleUnsignedResult =
  Omit<AurionHeadlessCausalOracleResult, "oracleResultHash">;

export function computeHeadlessCausalOracleResultHash(
  result: AurionHeadlessCausalOracleUnsignedResult,
): string {
  return canonicalSha256({
    schema: result.schema,
    mutationAuthority: result.mutationAuthority,
    status: result.status,
    zoneId: result.zoneId,
    requestedRange: result.requestedRange,
    checkpoint: result.checkpoint,
    warmupTicks: [...result.warmupTicks],
    verifiedTicks: [...result.verifiedTicks],
    sourceRevision: result.sourceRevision,
    rulesetVersion: result.rulesetVersion,
    firstDivergence: result.firstDivergence,
    reason: result.reason,
    terminalReceiptHash: result.terminalReceiptHash,
    finalStateHash: result.finalStateHash,
  });
}

export function sealHeadlessCausalOracleResult(
  result: AurionHeadlessCausalOracleUnsignedResult,
): AurionHeadlessCausalOracleResult {
  return Object.freeze({
    ...result,
    requestedRange: Object.freeze({ ...result.requestedRange }),
    checkpoint: result.checkpoint ? Object.freeze({ ...result.checkpoint }) : null,
    warmupTicks: Object.freeze([...result.warmupTicks]),
    verifiedTicks: Object.freeze([...result.verifiedTicks]),
    firstDivergence: result.firstDivergence ? Object.freeze({ ...result.firstDivergence }) : null,
    oracleResultHash: computeHeadlessCausalOracleResultHash(result),
  });
}
