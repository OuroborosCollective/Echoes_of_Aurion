import {
  canonicalWorldGenerationHash,
  worldGenerationParityEvidenceSchema,
  type WorldGenerationParityEvidence,
  type WorldGenerationRuntimeIdentity,
} from "./worldGenerationEvidenceContract";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
  verifyWorldGenerationArtifactIntegrityHash,
  verifyWorldGenerationDeterminismHash,
} from "./worldGenerationEvidenceHash";

export const AURION_WORLD_GENERATION_EVIDENCE_GATE = "aurion.world-generation.evidence-gate.v1" as const;

export type WorldGenerationConsumerKind =
  | "ATLAS_BUILD"
  | "WORLD_PROJECTION"
  | "ASSET_SHIPPING"
  | "RUNTIME_PREP";

export type WorldGenerationEvidenceGateReason =
  | "SCHEMA_INVALID"
  | "STATUS_NOT_MATCH"
  | "ORACLE_NOT_MATCH"
  | "DETERMINISM_HASH_INVALID"
  | "ARTIFACT_INTEGRITY_INVALID"
  | "SOURCE_REVISION_MISMATCH"
  | "RUNTIME_REVISION_MISMATCH"
  | "IMAGE_DIGEST_MISMATCH"
  | "CAUSAL_SCHEMA_MISMATCH"
  | "RULESET_MISMATCH"
  | "REFERENCE_RUNTIME_MISMATCH"
  | "PRODUCTION_RUNTIME_MISMATCH"
  | "WORLD_ID_MISMATCH";

export type WorldGenerationEvidenceGateInput = Readonly<{
  consumer: WorldGenerationConsumerKind;
  expectedWorldId?: string;
  expectedSourceRevision?: string;
  expectedRuntimeRevision?: string;
  expectedRuntimeImageDigest?: string;
  expectedCausalTickSchema?: string;
  expectedRulesetVersion?: string;
  requireOracleMatch?: boolean;
  requireArtifactIntegrity?: boolean;
}>;

export type WorldGenerationEvidenceGateAdmission = Readonly<{
  schema: typeof AURION_WORLD_GENERATION_EVIDENCE_GATE;
  verdict: "ADMIT" | "HOLD";
  consumer: WorldGenerationConsumerKind;
  reason: WorldGenerationEvidenceGateReason | null;
  evidenceDeterminismHash: string;
  evidenceArtifactIntegrityHash: string;
  admissionHash: string;
  expected: Readonly<{
    worldId: string | null;
    sourceRevision: string | null;
    runtimeRevision: string | null;
    runtimeImageDigest: string | null;
    causalTickSchema: string | null;
    rulesetVersion: string | null;
  }>;
}>;

function identityMatches(
  identity: WorldGenerationRuntimeIdentity,
  sourceRevision: string,
  runtimeRevision: string,
  imageDigest: string,
  causalTickSchema: string,
  rulesetVersion: string,
): boolean {
  return identity.sourceRevision === sourceRevision &&
    identity.runtimeRevision === runtimeRevision &&
    identity.runtimeImageDigest === imageDigest &&
    identity.causalTickSchema === causalTickSchema &&
    identity.rulesetVersion === rulesetVersion;
}

function admission(
  input: WorldGenerationEvidenceGateInput,
  evidence: WorldGenerationParityEvidence,
  verdict: "ADMIT" | "HOLD",
  reason: WorldGenerationEvidenceGateReason | null,
): WorldGenerationEvidenceGateAdmission {
  const expected = Object.freeze({
    worldId: input.expectedWorldId ?? null,
    sourceRevision: input.expectedSourceRevision ?? null,
    runtimeRevision: input.expectedRuntimeRevision ?? null,
    runtimeImageDigest: input.expectedRuntimeImageDigest ?? null,
    causalTickSchema: input.expectedCausalTickSchema ?? null,
    rulesetVersion: input.expectedRulesetVersion ?? null,
  });
  const evidenceDeterminismHash = computeWorldGenerationDeterminismHash({
    ...evidence,
    determinismHash: undefined as never,
    artifactIntegrityHash: undefined as never,
  } as never);
  const evidenceArtifactIntegrityHash = computeWorldGenerationArtifactIntegrityHash(evidence.artifactChecksums);
  return Object.freeze({
    schema: AURION_WORLD_GENERATION_EVIDENCE_GATE,
    verdict,
    consumer: input.consumer,
    reason,
    evidenceDeterminismHash,
    evidenceArtifactIntegrityHash,
    admissionHash: canonicalWorldGenerationHash({
      schema: AURION_WORLD_GENERATION_EVIDENCE_GATE,
      consumer: input.consumer,
      verdict,
      reason,
      evidenceDeterminismHash,
      evidenceArtifactIntegrityHash,
      expected,
    }),
    expected,
  });
}

export function evaluateWorldGenerationEvidenceGate(
  value: unknown,
  input: WorldGenerationEvidenceGateInput,
): WorldGenerationEvidenceGateAdmission {
  const parsed = worldGenerationParityEvidenceSchema.safeParse(value);
  if (!parsed.success) {
    const fallback = value as Partial<WorldGenerationParityEvidence>;
    return Object.freeze({
      schema: AURION_WORLD_GENERATION_EVIDENCE_GATE,
      verdict: "HOLD",
      consumer: input.consumer,
      reason: "SCHEMA_INVALID",
      evidenceDeterminismHash: typeof fallback.determinismHash === "string" ? fallback.determinismHash : "sha256:" + "0".repeat(64),
      evidenceArtifactIntegrityHash: typeof fallback.artifactIntegrityHash === "string" ? fallback.artifactIntegrityHash : "sha256:" + "0".repeat(64),
      admissionHash: canonicalWorldGenerationHash({
        schema: AURION_WORLD_GENERATION_EVIDENCE_GATE,
        consumer: input.consumer,
        verdict: "HOLD",
        reason: "SCHEMA_INVALID",
      }),
      expected: Object.freeze({
        worldId: input.expectedWorldId ?? null,
        sourceRevision: input.expectedSourceRevision ?? null,
        runtimeRevision: input.expectedRuntimeRevision ?? null,
        runtimeImageDigest: input.expectedRuntimeImageDigest ?? null,
        causalTickSchema: input.expectedCausalTickSchema ?? null,
        rulesetVersion: input.expectedRulesetVersion ?? null,
      }),
    });
  }

  const evidence = parsed.data;
  const fallbackAdmission = (reason: WorldGenerationEvidenceGateReason) =>
    admission(input, evidence, "HOLD", reason);

  if (evidence.status !== "MATCH") return fallbackAdmission("STATUS_NOT_MATCH");
  if ((input.requireOracleMatch ?? true) &&
      (evidence.oracleVerdict !== "MATCH" || evidence.oracleResultHash === null)) {
    return fallbackAdmission("ORACLE_NOT_MATCH");
  }
  if (!verifyWorldGenerationDeterminismHash(evidence)) return fallbackAdmission("DETERMINISM_HASH_INVALID");
  if ((input.requireArtifactIntegrity ?? true) && !verifyWorldGenerationArtifactIntegrityHash(evidence)) {
    return fallbackAdmission("ARTIFACT_INTEGRITY_INVALID");
  }

  if (input.expectedWorldId !== undefined && evidence.worldId !== input.expectedWorldId) {
    return fallbackAdmission("WORLD_ID_MISMATCH");
  }
  if (input.expectedSourceRevision !== undefined && evidence.sourceRevision !== input.expectedSourceRevision) {
    return fallbackAdmission("SOURCE_REVISION_MISMATCH");
  }
  if (input.expectedRuntimeRevision !== undefined && evidence.runtimeRevision !== input.expectedRuntimeRevision) {
    return fallbackAdmission("RUNTIME_REVISION_MISMATCH");
  }
  if (input.expectedRuntimeImageDigest !== undefined && evidence.runtimeImageDigest !== input.expectedRuntimeImageDigest) {
    return fallbackAdmission("IMAGE_DIGEST_MISMATCH");
  }
  if (input.expectedCausalTickSchema !== undefined && evidence.causalTickSchema !== input.expectedCausalTickSchema) {
    return fallbackAdmission("CAUSAL_SCHEMA_MISMATCH");
  }
  if (input.expectedRulesetVersion !== undefined && evidence.rulesetVersion !== input.expectedRulesetVersion) {
    return fallbackAdmission("RULESET_MISMATCH");
  }

  if (!identityMatches(
    evidence.referenceRuntimeIdentity,
    evidence.sourceRevision,
    evidence.runtimeRevision,
    evidence.runtimeImageDigest,
    evidence.causalTickSchema,
    evidence.rulesetVersion,
  )) {
    return fallbackAdmission("REFERENCE_RUNTIME_MISMATCH");
  }

  if (!identityMatches(
    evidence.productionRuntimeIdentity,
    evidence.sourceRevision,
    evidence.runtimeRevision,
    evidence.runtimeImageDigest,
    evidence.causalTickSchema,
    evidence.rulesetVersion,
  )) {
    return fallbackAdmission("PRODUCTION_RUNTIME_MISMATCH");
  }

  return admission(input, evidence, "ADMIT", null);
}

export function assertWorldGenerationEvidenceGate(
  value: unknown,
  input: WorldGenerationEvidenceGateInput,
): asserts value is WorldGenerationParityEvidence {
  const result = evaluateWorldGenerationEvidenceGate(value, input);
  if (result.verdict !== "ADMIT") {
    throw new Error("WORLD_GENERATION_EVIDENCE_GATE_" + result.reason);
  }
}
