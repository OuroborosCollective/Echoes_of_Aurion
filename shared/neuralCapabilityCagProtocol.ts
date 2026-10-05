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
  /** Natural language specification of the capability. */
  specText: string;
  /** Formal intent DSL surface, e.g. ["accept_quest", "request_turn_in"]. */
  allowedIntents: readonly string[];
  /** Intent label used for reject/quarantine examples. */
  rejectIntent: string;
}>;

export type NeuralCapabilityDatasetEntry = Readonly<{
  input: string;
  intentLabel: string;
  context?: string;
}>;

/** Bounded, structured record the oracle may see for one neural output. */
export type NeuralCapabilityEvaluationRecord = Readonly<{
  intent: string;
  questContextValid: boolean;
  confidenceBucket: NeuralConfidenceBucket;
  schemaValid: boolean;
  validatorResult: "accepted" | "rejected";
}>;

/** Deterministic invariant mask bits. Order defines the bit-vector layout. */
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

export type NeuralCapabilityInvariantReport = Readonly<{
  protocol: typeof AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL;
  mask: number;
  diagnostics: readonly NeuralCapabilityInvariantDiagnostic[];
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

export function sha256Prefixed(value: string): string {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}

/** Stable canonical serialization: sorted keys, no whitespace, no floats ambiguity. */
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

export function computeSpecSha256(contract: NeuralCapabilityIntentContract): string {
  return sha256Prefixed("aurion.neural-capability-spec.v1::" + canonicalize({
    specText: contract.specText,
    allowedIntents: [...contract.allowedIntents],
    rejectIntent: contract.rejectIntent,
  }));
}

export function computeDatasetSha256(dataset: readonly NeuralCapabilityDatasetEntry[]): string {
  return sha256Prefixed("aurion.neural-capability-dataset.v1::" + canonicalize(dataset.map(entry => ({
    input: entry.input,
    intentLabel: entry.intentLabel,
    context: entry.context ?? null,
  }))));
}

export function computeArtifactSha256(artifactManifest: unknown): string {
  return sha256Prefixed("aurion.neural-capability-artifact.v1::" + canonicalize(artifactManifest));
}

function normalizeInput(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure deterministic invariant evaluation over the bounded contract, dataset
 * and neural evaluation records. No provider, no clock, no randomness.
 */
export function evaluateNeuralCapabilityInvariants(
  contract: NeuralCapabilityIntentContract,
  dataset: readonly NeuralCapabilityDatasetEntry[],
  evaluations: readonly NeuralCapabilityEvaluationRecord[],
): NeuralCapabilityInvariantReport {
  const diagnostics: NeuralCapabilityInvariantDiagnostic[] = [];
  let mask = 0;
  const allowed = new Set(contract.allowedIntents);

  if (contract.allowedIntents.length === 0) {
    mask |= NEURAL_CAPABILITY_INVARIANT.CONTRACT_EMPTY_INTENTS;
    diagnostics.push({ code: "CONTRACT_EMPTY_INTENTS" });
  }
  if (!allowed.has(contract.rejectIntent)) {
    mask |= NEURAL_CAPABILITY_INVARIANT.CONTRACT_REJECT_INTENT_MISSING;
    diagnostics.push({ code: "CONTRACT_REJECT_INTENT_MISSING", detail: contract.rejectIntent });
  }

  const seenLabels = new Set<string>();
  const seenInputs = new Set<string>();
  for (const entry of dataset) {
    seenLabels.add(entry.intentLabel);
    if (!allowed.has(entry.intentLabel)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_UNKNOWN_LABEL;
      diagnostics.push({ code: "DATASET_UNKNOWN_LABEL", detail: entry.intentLabel });
    }
    const key = normalizeInput(entry.input);
    if (seenInputs.has(key)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_DUPLICATE_INPUT;
      diagnostics.push({ code: "DATASET_DUPLICATE_INPUT", detail: key });
    }
    seenInputs.add(key);
  }
  for (const intent of contract.allowedIntents) {
    if (!seenLabels.has(intent)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_COVERAGE_GAP;
      diagnostics.push({ code: "DATASET_COVERAGE_GAP", detail: intent });
    }
  }
  if (dataset.length > 0 && !seenLabels.has(contract.rejectIntent)) {
    mask |= NEURAL_CAPABILITY_INVARIANT.DATASET_MISSING_REJECT_EXAMPLES;
    diagnostics.push({ code: "DATASET_MISSING_REJECT_EXAMPLES", detail: contract.rejectIntent });
  }

  for (const evaluation of evaluations) {
    if (!evaluation.schemaValid && evaluation.validatorResult === "accepted") {
      mask |= NEURAL_CAPABILITY_INVARIANT.EVALUATION_SCHEMA_ACCEPT_CONFLICT;
      diagnostics.push({ code: "EVALUATION_SCHEMA_ACCEPT_CONFLICT", detail: evaluation.intent });
    }
    if (!allowed.has(evaluation.intent)) {
      mask |= NEURAL_CAPABILITY_INVARIANT.EVALUATION_INTENT_OUTSIDE_CONTRACT;
      diagnostics.push({ code: "EVALUATION_INTENT_OUTSIDE_CONTRACT", detail: evaluation.intent });
    }
    if (evaluation.confidenceBucket === "high" && !evaluation.questContextValid && evaluation.validatorResult === "accepted") {
      mask |= NEURAL_CAPABILITY_INVARIANT.EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT;
      diagnostics.push({ code: "EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT", detail: evaluation.intent });
    }
  }

  const sortedDiagnostics = Object.freeze(
    diagnostics.slice().sort((a, b) =>
      NEURAL_CAPABILITY_INVARIANT[a.code] - NEURAL_CAPABILITY_INVARIANT[b.code]
      || cmp(a.detail ?? "", b.detail ?? "")),
  );
  return Object.freeze({
    protocol: AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
    mask,
    diagnostics: sortedDiagnostics,
    resultHash: sha256Prefixed(canonicalize({
      protocol: AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
      mask,
      diagnostics: sortedDiagnostics,
    })),
    mutationAuthority: "none",
  });
}

/**
 * Bit-vector view of the invariant mask, ordered by ascending bit value.
 * This is the bounded payload a CAG probe may independently re-aggregate.
 */
export function neuralCapabilityInvariantBitVector(report: NeuralCapabilityInvariantReport): readonly number[] {
  return Object.freeze(NEURAL_CAPABILITY_INVARIANT_CODES.map(code =>
    (report.mask & NEURAL_CAPABILITY_INVARIANT[code]) !== 0 ? 1 : 0));
}
