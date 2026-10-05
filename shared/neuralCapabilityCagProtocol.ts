import { createHash } from "node:crypto";

/**
 * Contract for connecting the LLM-free neural capability layer with the
 * CAG/Wolfram design, consistency and falsification oracle (AIM #717).
 *
 * Authority boundary:
 * - Aurion remains the only gameplay/world/quest/persistence truth authority.
 * - CAG is an offline/CI design oracle for specification, dataset, neural
 *   artifact and deterministic validators.
 * - CAG output never mutates gameplay state and never activates an artifact.
 * - The runtime path is Neural Artifact -> Deterministic Validator -> Aurion;
 *   nothing on the runtime path may import the CAG provider.
 */
export const AURION_NEURAL_CAPABILITY_CAG_PROTOCOL = "aurion.neural-capability-cag.v1" as const;
export const AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL = "aurion.neural-capability-invariants.v1" as const;

export type NeuralCapabilityCagStatus =
  | "MATCH"
  | "FALSIFIED"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_CONFIGURED"
  | "PROVIDER_FAILED";

export type NeuralConfidenceBucket = "low" | "medium" | "high";

export type NeuralCapabilityIntentContract = Readonly<{
  /** Natural-language capability specification. */
  specText: string;
  /** Formal intent DSL surface. */
  allowedIntents: readonly string[];
  /** Intent label used for reject/quarantine examples. */
  rejectIntent: string;
  /**
   * Deterministic grounding phrases for each formal intent.
   * CAG independently checks these phrases against the bounded spec text.
   */
  specIntentAliases?: Readonly<Record<string, readonly string[]>>;
}>;

export type NeuralCapabilityDatasetEntry = Readonly<{
  input: string;
  intentLabel: string;
  context?: string;
  /** Stable context family identifier used for contradiction checks. */
  contextKey?: string;
  /** Optional truth value for the context family. */
  contextValid?: boolean;
}>;

/** Bounded, structured record the oracle may see for one neural output. */
export type NeuralCapabilityEvaluationRecord = Readonly<{
  intent: string;
  questContextValid: boolean;
  confidenceBucket: NeuralConfidenceBucket;
  schemaValid: boolean;
  validatorResult: "accepted" | "rejected";
}>;

export type NeuralCapabilityDifferentialObservation = Readonly<{
  intent: string;
  questContextValid: boolean;
  validatorResult: "accepted" | "rejected";
}>;

export type NeuralCapabilityDifferentialRecord = Readonly<{
  caseId: string;
  expected: NeuralCapabilityDifferentialObservation;
  legacy: NeuralCapabilityDifferentialObservation;
  neural: NeuralCapabilityDifferentialObservation;
}>;

/** Deterministic invariant mask bits. Order defines the CAG bit-vector layout. */
export const NEURAL_CAPABILITY_INVARIANT = Object.freeze({
  CONTRACT_EMPTY_INTENTS: 1,
  CONTRACT_REJECT_INTENT_MISSING: 2,
  DATASET_UNKNOWN_LABEL: 4,
  DATASET_COVERAGE_GAP: 8,
  DATASET_DUPLICATE_INPUT: 16,
  DATASET_MISSING_REJECT_EXAMPLES: 32,
  EVALUATION_SCHEMA_ACCEPT_CONFLICT: 64,
  EVALUATION_INTENT_OUTSIDE_CONTRACT: 128,
  EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT: 256,
  CONTRACT_SPEC_GROUNDING_MISSING: 512,
  CONTRACT_SPEC_INTENT_UNMENTIONED: 1024,
  DATASET_CONFLICTING_LABEL: 2048,
  DATASET_NEAR_DUPLICATE_CONFLICT: 4096,
  DATASET_CONTEXT_CONTRADICTION: 8192,
  DIFFERENTIAL_DECISION_MISMATCH: 16384,
  DIFFERENTIAL_ACCEPTED_INTENT_MISMATCH: 32768,
  DIFFERENTIAL_CONTEXT_MISMATCH: 65536,
  DIFFERENTIAL_EXPECTATION_MISMATCH: 131072,
} as const);

export type NeuralCapabilityInvariantCode = keyof typeof NEURAL_CAPABILITY_INVARIANT;

export const NEURAL_CAPABILITY_INVARIANT_CODES: readonly NeuralCapabilityInvariantCode[] = Object.freeze(
  (Object.keys(NEURAL_CAPABILITY_INVARIANT) as NeuralCapabilityInvariantCode[])
    .slice()
    .sort((a, b) => NEURAL_CAPABILITY_INVARIANT[a] - NEURAL_CAPABILITY_INVARIANT[b]),
);

export type NeuralCapabilityInvariantDiagnostic = Readonly<{
  code: NeuralCapabilityInvariantCode;
  detail?: string;
}>;

export type NeuralCapabilityInvariantSummary = Readonly<{
  specMissingCount: number;
  datasetConflictCount: number;
  nearDuplicateConflictCount: number;
  contextContradictionCount: number;
  differentialMismatchCount: number;
}>;

export type NeuralCapabilityInvariantReport = Readonly<{
  protocol: typeof AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL;
  mask: number;
  diagnostics: readonly NeuralCapabilityInvariantDiagnostic[];
  summary: NeuralCapabilityInvariantSummary;
  resultHash: string;
  mutationAuthority: "none";
}>;

export type NeuralCapabilityCagReport = Readonly<{
  protocol: typeof AURION_NEURAL_CAPABILITY_CAG_PROTOCOL;
  capabilityId: string;
  artifactSha256: string;
  specSha256: string;
  datasetSha256: string;
  status: NeuralCapabilityCagStatus;
  invariantMask: number;
  requestSha256: string;
  responseSha256: string | null;
  observedMask: number | null;
  mutationAuthority: "none";
}>;

export type NeuralCapabilityCagBoundedInput = Readonly<{
  normalizedSpec: string;
  specAliasGroups: readonly (readonly string[])[];
  exactDatasetRows: readonly (readonly [string, string])[];
  nearDatasetRows: readonly (readonly [string, string])[];
  contextRows: readonly (readonly [string, 0 | 1])[];
  differentialRows: readonly (readonly [
    0 | 1,
    0 | 1,
    string,
    string,
    0 | 1,
    0 | 1,
    0 | 1,
    string,
    0 | 1
  ])[];
}>;

export function sha256Prefixed(value: string): string {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}

/** Stable canonical serialization: sorted keys, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + canonicalize(record[key])).join(",") + "}";
}

const sha256PrefixedPattern = /^sha256:[0-9a-f]{64}$/;

export function isSha256Prefixed(value: string): boolean {
  return sha256PrefixedPattern.test(value);
}

function normalizedAliases(contract: NeuralCapabilityIntentContract): Readonly<Record<string, readonly string[]>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(contract.specIntentAliases ?? {})
      .sort(([a], [b]) => cmp(a, b))
      .map(([intent, aliases]) => [intent, Object.freeze([...aliases])]),
  ));
}

export function computeSpecSha256(contract: NeuralCapabilityIntentContract): string {
  return sha256Prefixed("aurion.neural-capability-spec.v1::" + canonicalize({
    specText: contract.specText,
    allowedIntents: [...contract.allowedIntents],
    rejectIntent: contract.rejectIntent,
    specIntentAliases: normalizedAliases(contract),
  }));
}

export function computeDatasetSha256(dataset: readonly NeuralCapabilityDatasetEntry[]): string {
  return sha256Prefixed("aurion.neural-capability-dataset.v1::" + canonicalize(dataset.map(entry => ({
    input: entry.input,
    intentLabel: entry.intentLabel,
    context: entry.context ?? null,
    contextKey: entry.contextKey ?? null,
    contextValid: entry.contextValid ?? null,
  }))));
}

export function computeArtifactSha256(artifactManifest: unknown): string {
  return sha256Prefixed("aurion.neural-capability-artifact.v1::" + canonicalize(artifactManifest));
}

function normalizeInput(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

function normalizePhrase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function addDiagnostic(
  diagnostics: NeuralCapabilityInvariantDiagnostic[],
  code: NeuralCapabilityInvariantCode,
  detail?: string,
): void {
  diagnostics.push(detail === undefined ? { code } : { code, detail });
}

function countConflictingLabels(rows: readonly (readonly [string, string])[]): number {
  const byKey = new Map<string, Set<string>>();
  for (const [key, label] of rows) {
    const labels = byKey.get(key) ?? new Set<string>();
    labels.add(label);
    byKey.set(key, labels);
  }
  let count = 0;
  for (const labels of byKey.values()) if (labels.size > 1) count += 1;
  return count;
}

function countContextContradictions(rows: readonly (readonly [string, 0 | 1])[]): number {
  const byKey = new Map<string, Set<number>>();
  for (const [key, value] of rows) {
    const values = byKey.get(key) ?? new Set<number>();
    values.add(value);
    byKey.set(key, values);
  }
  let count = 0;
  for (const values of byKey.values()) if (values.size > 1) count += 1;
  return count;
}

function differentialRecordMismatch(record: NeuralCapabilityDifferentialRecord): boolean {
  const decisionMismatch = record.legacy.validatorResult !== record.neural.validatorResult;
  const acceptedIntentMismatch =
    record.legacy.validatorResult === "accepted"
    && record.neural.validatorResult === "accepted"
    && record.legacy.intent !== record.neural.intent;
  const contextMismatch = record.legacy.questContextValid !== record.neural.questContextValid;
  const expectationMismatch = [record.legacy, record.neural].some(observation =>
    observation.validatorResult !== record.expected.validatorResult
    || observation.intent !== record.expected.intent
    || observation.questContextValid !== record.expected.questContextValid);
  return decisionMismatch || acceptedIntentMismatch || contextMismatch || expectationMismatch;
}

/**
 * Privacy-minimized bounded material used by the offline CAG probe.
 * Dataset text never leaves this boundary: only normalized-key hashes and labels
 * are exposed. Natural-language spec text and its declared aliases are bounded
 * build-time inputs, never gameplay state.
 */
export function buildNeuralCapabilityCagBoundedInput(
  contract: NeuralCapabilityIntentContract,
  dataset: readonly NeuralCapabilityDatasetEntry[],
  differentials: readonly NeuralCapabilityDifferentialRecord[],
): NeuralCapabilityCagBoundedInput {
  const aliasCount = Object.values(contract.specIntentAliases ?? {}).reduce((sum, aliases) => sum + aliases.length, 0);
  if (
    contract.specText.length > 2048
    || contract.allowedIntents.length > 64
    || aliasCount > 256
    || dataset.length > 512
    || differentials.length > 512
  ) {
    throw new Error("NEURAL_CAPABILITY_CAG_INPUT_BOUNDS");
  }

  const normalizedSpec = normalizePhrase(contract.specText);
  const specAliasGroups = Object.freeze(contract.allowedIntents.map(intent =>
    Object.freeze((contract.specIntentAliases?.[intent] ?? []).map(normalizePhrase).filter(Boolean)),
  ));

  const exactDatasetRows = Object.freeze(dataset.map(entry => {
    const exactKey = canonicalize({
      input: normalizeInput(entry.input),
      context: normalizeInput(entry.context ?? ""),
      contextKey: normalizeInput(entry.contextKey ?? ""),
    });
    return Object.freeze([
      sha256Prefixed("aurion.neural-capability-dataset-exact.v1::" + exactKey),
      entry.intentLabel,
    ] as const);
  }));

  const nearDatasetRows = Object.freeze(dataset.map(entry => Object.freeze([
    sha256Prefixed("aurion.neural-capability-dataset-near.v1::" + normalizePhrase(entry.input)),
    entry.intentLabel,
  ] as const)));

  const contextRows = Object.freeze(dataset.flatMap(entry => {
    if (entry.contextKey === undefined || entry.contextValid === undefined) return [];
    const contextKey = canonicalize({
      input: normalizeInput(entry.input),
      intentLabel: entry.intentLabel,
      contextKey: normalizeInput(entry.contextKey),
    });
    return [Object.freeze([
      sha256Prefixed("aurion.neural-capability-context.v1::" + contextKey),
      entry.contextValid ? 1 : 0,
    ] as const)];
  }));

  const differentialRows = Object.freeze(differentials.map(record => Object.freeze([
    record.legacy.validatorResult === "accepted" ? 1 : 0,
    record.neural.validatorResult === "accepted" ? 1 : 0,
    record.legacy.intent,
    record.neural.intent,
    record.legacy.questContextValid ? 1 : 0,
    record.neural.questContextValid ? 1 : 0,
    record.expected.validatorResult === "accepted" ? 1 : 0,
    record.expected.intent,
    record.expected.questContextValid ? 1 : 0,
  ] as const)));

  return Object.freeze({
    normalizedSpec,
    specAliasGroups,
    exactDatasetRows,
    nearDatasetRows,
    contextRows,
    differentialRows,
  });
}

/**
 * Pure deterministic invariant evaluation over bounded contract, dataset,
 * neural evaluation and differential records. No provider, clock or randomness.
 */
export function evaluateNeuralCapabilityInvariants(
  contract: NeuralCapabilityIntentContract,
  dataset: readonly NeuralCapabilityDatasetEntry[],
  evaluations: readonly NeuralCapabilityEvaluationRecord[],
  differentials: readonly NeuralCapabilityDifferentialRecord[] = [],
): NeuralCapabilityInvariantReport {
  const diagnostics: NeuralCapabilityInvariantDiagnostic[] = [];
  let mask = 0;
  const allowed = new Set(contract.allowedIntents);

  if (contract.allowedIntents.length === 0) {
    mask |= NEURAL_CAPABILITY_INVARIANT.CONTRACT_EMPTY_INTENTS;
    addDiagnostic(diagnostics, "CONTRACT_EMPTY_INTENTS");
  }
  if (!allowed.has(contract.rejectIntent)) {
    mask |= NEURAL_CAPABILITY_INVARIANT.CONTRACT_REJECT_INTENT_MISSING;
    addDiagnostic(diagnostics, "CONTRACT_REJECT_INTENT_MISSING", contract.rejectIntent);
  }

  const normalizedSpec = normalizePhrase(contract.specText);
  let specMissingCount = 0;
  for (const intent of contract.allowedIntents) {
    const aliases = (contract.specIntentAliases?.[intent] ?? []).map(normalizePhrase).filter(Boolean);
    if (aliases.length === 0) {
      mask |= NEURAL_CAPABILITY_INVARIANT.CONTRACT_SPEC_GROUNDING_MISSING;
      addDiagnostic(diagnostics, "CONTRACT_SPEC_GROUNDING_MISSING", intent);
      specMissingCount += 1;
      continue;
    }
    if (!aliases.some(alias => normalizedSpec.includes(alias))) {
      mask |= NEURAL_CAPABILITY_INVARIANT.CONTRACT_SPEC_INTENT_UNMENTIONED;
      addDiagnostic(diagnostics, "CONTRACT_SPEC_INTENT_UNMENTIONED", intent);
      specMissingCount += 1;
    }
  }

  const seenLabels = new Set<string>();
  const seenInputs = new Set<string>();
  for (const entry of dataset) {
    seenLabels.add(entry.intentLabel);
    if (!allowed.has(entry.intentLabel)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_UNKNOWN_LABEL;
      addDiagnostic(diagnostics, "DATASET_UNKNOWN_LABEL", entry.intentLabel);
    }
    const key = normalizeInput(entry.input);
    if (seenInputs.has(key)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_DUPLICATE_INPUT;
      addDiagnostic(diagnostics, "DATASET_DUPLICATE_INPUT", sha256Prefixed(key));
    }
    seenInputs.add(key);
  }
  for (const intent of contract.allowedIntents) {
    if (!seenLabels.has(intent)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_COVERAGE_GAP;
      addDiagnostic(diagnostics, "DATASET_COVERAGE_GAP", intent);
    }
  }
  if (dataset.length > 0 && !seenLabels.has(contract.rejectIntent)) {
    mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_MISSING_REJECT_EXAMPLES;
    addDiagnostic(diagnostics, "DATASET_MISSING_REJECT_EXAMPLES", contract.rejectIntent);
  }

  const bounded = buildNeuralCapabilityCagBoundedInput(contract, dataset, differentials);
  const datasetConflictCount = countConflictingLabels(bounded.exactDatasetRows);
  const nearDuplicateConflictCount = countConflictingLabels(bounded.nearDatasetRows);
  const contextContradictionCount = countContextContradictions(bounded.contextRows);

  if (datasetConflictCount > 0) {
    mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_CONFLICTING_LABEL;
    addDiagnostic(diagnostics, "DATASET_CONFLICTING_LABEL", String(datasetConflictCount));
  }
  if (nearDuplicateConflictCount > 0) {
    mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_NEAR_DUPLICATE_CONFLICT;
    addDiagnostic(diagnostics, "DATASET_NEAR_DUPLICATE_CONFLICT", String(nearDuplicateConflictCount));
  }
  if (contextContradictionCount > 0) {
    mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_CONTEXT_CONTRADICTION;
    addDiagnostic(diagnostics, "DATASET_CONTEXT_CONTRADICTION", String(contextContradictionCount));
  }

  for (const evaluation of evaluations) {
    if (!evaluation.schemaValid && evaluation.validatorResult === "accepted") {
      mask |= NEURAL_CAPABILITY_INVARIANT.EVALUATION_SCHEMA_ACCEPT_CONFLICT;
      addDiagnostic(diagnostics, "EVALUATION_SCHEMA_ACCEPT_CONFLICT", evaluation.intent);
    }
    if (!allowed.has(evaluation.intent)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.EVALUATION_INTENT_OUTSIDE_CONTRACT;
      addDiagnostic(diagnostics, "EVALUATION_INTENT_OUTSIDE_CONTRACT", evaluation.intent);
    }
    if (evaluation.confidenceBucket === "high" && !evaluation.questContextValid && evaluation.validatorResult === "accepted") {
      mask |= NEURAL_CAPABILITY_INVARIANT.EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT;
      addDiagnostic(diagnostics, "EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT", evaluation.intent);
    }
  }

  let differentialMismatchCount = 0;
  for (const differential of differentials) {
    let mismatch = false;
    if (differential.legacy.validatorResult !== differential.neural.validatorResult) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_DECISION_MISMATCH;
      addDiagnostic(diagnostics, "DIFFERENTIAL_DECISION_MISMATCH", differential.caseId);
      mismatch = true;
    }
    if (
      differential.legacy.validatorResult === "accepted"
      && differential.neural.validatorResult === "accepted"
      && differential.legacy.intent !== differential.neural.intent
    ) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_ACCEPTED_INTENT_MISMATCH;
      addDiagnostic(diagnostics, "DIFFERENTIAL_ACCEPTED_INTENT_MISMATCH", differential.caseId);
      mismatch = true;
    }
    if (differential.legacy.questContextValid !== differential.neural.questContextValid) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_CONTEXT_MISMATCH;
      addDiagnostic(diagnostics, "DIFFERENTIAL_CONTEXT_MISMATCH", differential.caseId);
      mismatch = true;
    }
    if ([differential.legacy, differential.neural].some(observation =>
      observation.validatorResult !== differential.expected.validatorResult
      || observation.intent !== differential.expected.intent
      || observation.questContextValid !== differential.expected.questContextValid
    )) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_EXPECTATION_MISMATCH;
      addDiagnostic(diagnostics, "DIFFERENTIAL_EXPECTATION_MISMATCH", differential.caseId);
      mismatch = true;
    }
    if (mismatch || differentialRecordMismatch(differential)) differentialMismatchCount += 1;
  }

  const summary = Object.freeze({
    specMissingCount,
    datasetConflictCount,
    nearDuplicateConflictCount,
    contextContradictionCount,
    differentialMismatchCount,
  });

  const sortedDiagnostics = Object.freeze(
    diagnostics.slice().sort((a, b) =>
      NEURAL_CAPABILITY_INVARIANT[a.code] - NEURAL_CAPABILITY_INVARIANT[b.code]
      || cmp(a.detail ?? "", b.detail ?? "")),
  );
  return Object.freeze({
    protocol: AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
    mask,
    diagnostics: sortedDiagnostics,
    summary,
    resultHash: sha256Prefixed(canonicalize({
      protocol: AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
      mask,
      diagnostics: sortedDiagnostics,
      summary,
    })),
    mutationAuthority: "none",
  });
}

/** Bit-vector view of the invariant mask, ordered by ascending bit value. */
export function neuralCapabilityInvariantBitVector(report: NeuralCapabilityInvariantReport): readonly number[] {
  return Object.freeze(NEURAL_CAPABILITY_INVARIANT_CODES.map(code =>
    (report.mask & NEURAL_CAPABILITY_INVARIANT[code]) !== 0 ? 1 : 0));
}
