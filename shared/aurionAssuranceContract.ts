import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_ASSURANCE_SCHEMA = "aurion.causal-assurance.v1" as const;
export const AURION_PRODUCTION_ASSURANCE_RECEIPT_SCHEMA = "aurion.production-causal-assurance.v1" as const;
export const assuranceKeys = [
  "RUNTIME_REVISION", "BUILD_INPUT", "ARTIFACT", "RUNTIME_IMAGE", "ATTESTATION", "SCHEMA",
  "RECEIPT_CHAIN", "WORLD_ROOT", "REPLAY_SAMPLE", "EFFECT_JOURNAL", "CROSS_ZONE", "PROJECTION",
] as const;
export type AssuranceKey = typeof assuranceKeys[number];
export type AssuranceStatus = "HEALTHY" | "DEGRADED" | "UNVERIFIED" | "CONTRADICTED";
export type AssuranceObservationStatus = "MATCH" | "DEGRADED" | "UNVERIFIED" | "CONTRADICTED";

export type AssuranceObservation = Readonly<{
  key: AssuranceKey;
  status: AssuranceObservationStatus;
  summary: string;
  evidenceHash: string | null;
  sampleCount: number;
}>;

export type AssuranceRecoveryPlan = Readonly<{
  protocol: "aurion.assurance-recovery-plan.v1";
  triggerStatus: Exclude<AssuranceStatus, "HEALTHY"> | null;
  preserveEvidenceHashes: readonly string[];
  actions: readonly ("COLLECT_MISSING_EVIDENCE" | "PRESERVE_CONTRADICTED_EVIDENCE" | "PAUSE_PROMOTION" | "REPLAY_READ_ONLY_SAMPLE" | "REQUEST_OPERATOR_REVIEW")[];
  destructiveActions: readonly never[];
  requiresHumanApproval: true;
  mutationAuthority: "none";
}>;

export type AssuranceSnapshot = Readonly<{
  schema: typeof AURION_ASSURANCE_SCHEMA;
  worldId: string;
  sequence: number;
  observedAtMs: number;
  status: AssuranceStatus;
  observations: readonly AssuranceObservation[];
  recoveryPlan: AssuranceRecoveryPlan;
  snapshotHash: string;
  mutationAuthority: "none";
}>;

export type ProductionAssuranceReceipt = Readonly<{
  schema: typeof AURION_PRODUCTION_ASSURANCE_RECEIPT_SCHEMA;
  sourceRevision: string;
  runtimeSnapshotHash: string;
  attestationGateEvidenceHash: string;
  schemaReadbackEvidenceHash: string;
  snapshot: AssuranceSnapshot;
  mutationAuthority: "none";
  receiptHash: string;
}>;

const HASH = /^sha256:[a-f0-9]{64}$/;
const SUMMARY = /^[A-Z0-9_:-]{3,160}$/;
const OBSERVATION_STATUSES = new Set<AssuranceObservationStatus>(["MATCH", "DEGRADED", "UNVERIFIED", "CONTRADICTED"]);

export function assuranceStatus(observations: readonly AssuranceObservation[]): AssuranceStatus {
  if (observations.some(value => value.status === "CONTRADICTED")) return "CONTRADICTED";
  if (observations.some(value => value.status === "UNVERIFIED")) return "UNVERIFIED";
  if (observations.some(value => value.status === "DEGRADED")) return "DEGRADED";
  return "HEALTHY";
}

function recoveryPlan(status: AssuranceStatus, observations: readonly AssuranceObservation[]): AssuranceRecoveryPlan {
  const missing = observations.some(value => value.status === "UNVERIFIED");
  const contradicted = observations.some(value => value.status === "CONTRADICTED");
  const degraded = observations.some(value => value.status === "DEGRADED");
  const actions: AssuranceRecoveryPlan["actions"][number][] = [];
  if (missing) actions.push("COLLECT_MISSING_EVIDENCE");
  if (degraded) actions.push("REPLAY_READ_ONLY_SAMPLE");
  if (contradicted) actions.push("PRESERVE_CONTRADICTED_EVIDENCE", "PAUSE_PROMOTION");
  if (status !== "HEALTHY") actions.push("REQUEST_OPERATOR_REVIEW");
  return Object.freeze({
    protocol: "aurion.assurance-recovery-plan.v1",
    triggerStatus: status === "HEALTHY" ? null : status,
    preserveEvidenceHashes: Object.freeze(observations.flatMap(value => value.evidenceHash ? [value.evidenceHash] : [])),
    actions: Object.freeze(actions), destructiveActions: Object.freeze([]),
    requiresHumanApproval: true, mutationAuthority: "none",
  });
}

export function sealAssuranceSnapshot(input: {
  worldId: string; sequence: number; observedAtMs: number; observations: readonly AssuranceObservation[];
}): AssuranceSnapshot {
  if (!input.worldId.trim() || !Number.isSafeInteger(input.sequence) || input.sequence < 1 ||
      !Number.isSafeInteger(input.observedAtMs) || input.observedAtMs < 0) throw Error("ASSURANCE_IDENTITY_INVALID");
  if (input.observations.length !== assuranceKeys.length) throw Error("ASSURANCE_OBSERVATION_SET_INCOMPLETE");
  const byKey = new Map(input.observations.map(value => [value.key, value]));
  if (byKey.size !== assuranceKeys.length || assuranceKeys.some(key => !byKey.has(key))) throw Error("ASSURANCE_OBSERVATION_SET_INVALID");
  const observations = Object.freeze(assuranceKeys.map(key => {
    const value = byKey.get(key)!;
    if (!OBSERVATION_STATUSES.has(value.status) || !SUMMARY.test(value.summary) ||
        (value.evidenceHash !== null && !HASH.test(value.evidenceHash)) ||
        !Number.isSafeInteger(value.sampleCount) || value.sampleCount < 0) throw Error(`ASSURANCE_OBSERVATION_INVALID:${key}`);
    return Object.freeze({ ...value });
  }));
  const status = assuranceStatus(observations);
  const plan = recoveryPlan(status, observations);
  const unsigned = { schema: AURION_ASSURANCE_SCHEMA, worldId: input.worldId, sequence: input.sequence,
    observedAtMs: input.observedAtMs, status, observations, recoveryPlan: plan, mutationAuthority: "none" as const };
  return Object.freeze({ ...unsigned, snapshotHash: canonicalSha256(unsigned) });
}

export function verifyAssuranceSnapshot(value: AssuranceSnapshot): boolean {
  try {
    const rebuilt = sealAssuranceSnapshot(value);
    return rebuilt.snapshotHash === value.snapshotHash && rebuilt.status === value.status &&
      canonicalSha256(rebuilt) === canonicalSha256(value);
  } catch { return false; }
}

export function sealProductionAssuranceReceipt(input: Omit<ProductionAssuranceReceipt, "schema" | "mutationAuthority" | "receiptHash">): ProductionAssuranceReceipt {
  if (!/^[a-f0-9]{40}$/.test(input.sourceRevision) ||
      ![input.runtimeSnapshotHash, input.attestationGateEvidenceHash, input.schemaReadbackEvidenceHash].every(value => HASH.test(value)) ||
      !verifyAssuranceSnapshot(input.snapshot)) throw Error("PRODUCTION_ASSURANCE_EVIDENCE_INVALID");
  const byKey = new Map(input.snapshot.observations.map(value => [value.key, value]));
  if (byKey.get("RUNTIME_REVISION")?.status !== "MATCH" ||
      byKey.get("RUNTIME_REVISION")?.evidenceHash !== canonicalSha256({ sourceRevision: input.sourceRevision }) ||
      byKey.get("ATTESTATION")?.status !== "MATCH" || byKey.get("ATTESTATION")?.evidenceHash !== input.attestationGateEvidenceHash ||
      byKey.get("SCHEMA")?.status !== "MATCH" || byKey.get("SCHEMA")?.evidenceHash !== input.schemaReadbackEvidenceHash)
    throw Error("PRODUCTION_ASSURANCE_BINDING_INVALID");
  const unsigned = Object.freeze({ schema: AURION_PRODUCTION_ASSURANCE_RECEIPT_SCHEMA,
    sourceRevision: input.sourceRevision, runtimeSnapshotHash: input.runtimeSnapshotHash,
    attestationGateEvidenceHash: input.attestationGateEvidenceHash,
    schemaReadbackEvidenceHash: input.schemaReadbackEvidenceHash,
    snapshot: input.snapshot, mutationAuthority: "none" as const });
  return Object.freeze({ ...unsigned, receiptHash: canonicalSha256(unsigned) });
}

export function verifyProductionAssuranceReceipt(value: ProductionAssuranceReceipt): boolean {
  try {
    const rebuilt = sealProductionAssuranceReceipt(value);
    return rebuilt.receiptHash === value.receiptHash && canonicalSha256(rebuilt) === canonicalSha256(value);
  } catch { return false; }
}
