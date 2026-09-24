import { canonicalWorldGenerationHash } from "./worldGenerationEvidenceContract";

export const AURION_EVIDENCE_GATE_ENGINE_SCHEMA = "aurion.evidence-gate-engine.v1" as const;

export type EvidenceGateVerdict = "ADMIT" | "HOLD";

export type EvidenceGateCheck = Readonly<{
  id: string;
  pass: boolean;
  reason: string | null;
}>;

export type EvidenceGateEngineResult = Readonly<{
  schema: typeof AURION_EVIDENCE_GATE_ENGINE_SCHEMA;
  verdict: EvidenceGateVerdict;
  consumer: string;
  checks: readonly EvidenceGateCheck[];
  firstFailure: string | null;
  admissionHash: string;
}>;

/**
 * AIM-175 compatibility layer.
 *
 * This is the generic evidence-gate aggregation primitive. Domain-specific
 * gates (e.g. #563 World-Generation) own their policy checks; this engine
 * only evaluates the already-computed checks and emits one deterministic
 * admission receipt. It never creates or mutates domain truth.
 */
export function evaluateEvidenceGateEngine(input: Readonly<{
  consumer: string;
  checks: readonly EvidenceGateCheck[];
}>): EvidenceGateEngineResult {
  const checks = Object.freeze(input.checks.map(check => Object.freeze({
    id: check.id,
    pass: check.pass,
    reason: check.reason ?? null,
  })));
  const firstFailure = checks.find(check => !check.pass)?.reason ?? null;
  const verdict: EvidenceGateVerdict = firstFailure === null ? "ADMIT" : "HOLD";

  return Object.freeze({
    schema: AURION_EVIDENCE_GATE_ENGINE_SCHEMA,
    verdict,
    consumer: input.consumer,
    checks,
    firstFailure,
    admissionHash: canonicalWorldGenerationHash({
      schema: AURION_EVIDENCE_GATE_ENGINE_SCHEMA,
      consumer: input.consumer,
      verdict,
      checks,
      firstFailure,
    }),
  });
}

export function assertEvidenceGateEngineAdmitted(
  result: EvidenceGateEngineResult,
): asserts result is EvidenceGateEngineResult & { verdict: "ADMIT"; firstFailure: null } {
  if (result.verdict !== "ADMIT") {
    throw new Error("EVIDENCE_GATE_ENGINE_" + (result.firstFailure ?? "HOLD"));
  }
}
