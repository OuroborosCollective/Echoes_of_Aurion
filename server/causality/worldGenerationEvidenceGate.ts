import {
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
import {
  evaluateEvidenceGateEngine,
  type EvidenceGateCheck,
  type EvidenceGateEngineResult,
} from "./evidenceGateEngine";

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
  engine: EvidenceGateEngineResult;
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

function expectedContext(input: WorldGenerationEvidenceGateInput) {
  return Object.freeze({
    worldId: input.expectedWorldId ?? null,
    sourceRevision: input.expectedSourceRevision ?? null,
    runtimeRevision: input.expectedRuntimeRevision ?? null,
    runtimeImageDigest: input.expectedRuntimeImageDigest ?? null,
    causalTickSchema: input.expectedCausalTickSchema ?? null,
    rulesetVersion: input.expectedRulesetVersion ?? null,
  });
}

function admission(
  input: WorldGenerationEvidenceGateInput,
  evidence: WorldGenerationParityEvidence,
  checks: readonly EvidenceGateCheck[],
): WorldGenerationEvidenceGateAdmission {
  const expected = expectedContext(input);
  const engine = evaluateEvidenceGateEngine({
    consumer: input.consumer,
    checks,
  });
  const evidenceDeterminismHash = computeWorldGenerationDeterminismHash({
    ...evidence,
    determinismHash: undefined as never,
    artifactIntegrityHash: undefined as never,
  } as never);
  const evidenceArtifactIntegrityHash = computeWorldGenerationArtifactIntegrityHash(evidence.artifactChecksums);

  return Object.freeze({
    schema: AURION_WORLD_GENERATION_EVIDENCE_GATE,
    verdict: engine.verdict,
    consumer: input.consumer,
    reason: engine.firstFailure as WorldGenerationEvidenceGateReason | null,
    evidenceDeterminismHash,
    evidenceArtifactIntegrityHash,
    engine,
    admissionHash: engine.admissionHash,
    expected,
  });
}

export function evaluateWorldGenerationEvidenceGate(
  value: unknown,
  input: WorldGenerationEvidenceGateInput,
): WorldGenerationEvidenceGateAdmission {
  const parsed = worldGenerationParityEvidenceSchema.safeParse(value);
  if (!parsed.success) {
    const engine = evaluateEvidenceGateEngine({
      consumer: input.consumer,
      checks: [{ id: "schema", pass: false, reason: "SCHEMA_INVALID" }],
    });
    return Object.freeze({
      schema: AURION_WORLD_GENERATION_EVIDENCE_GATE,
      verdict: "HOLD",
      consumer: input.consumer,
      reason: "SCHEMA_INVALID",
      evidenceDeterminismHash: "sha256:" + "0".repeat(64),
      evidenceArtifactIntegrityHash: "sha256:" + "0".repeat(64),
      engine,
      admissionHash: engine.admissionHash,
      expected: expectedContext(input),
    });
  }

  const evidence = parsed.data;
  const checks: EvidenceGateCheck[] = [];

  const add = (id: string, pass: boolean, reason: WorldGenerationEvidenceGateReason) =>
    checks.push({ id, pass, reason: pass ? null : reason });

  add("status_match", evidence.status === "MATCH", "STATUS_NOT_MATCH");
  add(
    "oracle_match",
    (input.requireOracleMatch ?? true)
      ? evidence.oracleVerdict === "MATCH" && evidence.oracleResultHash !== null
      : true,
    "ORACLE_NOT_MATCH",
  );
  add(
    "determinism_hash",
    verifyWorldGenerationDeterminismHash(evidence),
    "DETERMINISM_HASH_INVALID",
  );
  add(
    "artifact_integrity",
    (input.requireArtifactIntegrity ?? true)
      ? verifyWorldGenerationArtifactIntegrityHash(evidence)
      : true,
    "ARTIFACT_INTEGRITY_INVALID",
  );

  if (input.expectedWorldId !== undefined) {
    add("expected_world", evidence.worldId === input.expectedWorldId, "WORLD_ID_MISMATCH");
  }
  if (input.expectedSourceRevision !== undefined) {
    add("expected_source_revision", evidence.sourceRevision === input.expectedSourceRevision, "SOURCE_REVISION_MISMATCH");
  }
  if (input.expectedRuntimeRevision !== undefined) {
    add("expected_runtime_revision", evidence.runtimeRevision === input.expectedRuntimeRevision, "RUNTIME_REVISION_MISMATCH");
  }
  if (input.expectedRuntimeImageDigest !== undefined) {
    add("expected_runtime_image", evidence.runtimeImageDigest === input.expectedRuntimeImageDigest, "IMAGE_DIGEST_MISMATCH");
  }
  if (input.expectedCausalTickSchema !== undefined) {
    add("expected_causal_schema", evidence.causalTickSchema === input.expectedCausalTickSchema, "CAUSAL_SCHEMA_MISMATCH");
  }
  if (input.expectedRulesetVersion !== undefined) {
    add("expected_ruleset", evidence.rulesetVersion === input.expectedRulesetVersion, "RULESET_MISMATCH");
  }

  add(
    "reference_runtime_identity",
    identityMatches(
      evidence.referenceRuntimeIdentity,
      evidence.sourceRevision,
      evidence.runtimeRevision,
      evidence.runtimeImageDigest,
      evidence.causalTickSchema,
      evidence.rulesetVersion,
    ),
    "REFERENCE_RUNTIME_MISMATCH",
  );
  add(
    "production_runtime_identity",
    identityMatches(
      evidence.productionRuntimeIdentity,
      evidence.sourceRevision,
      evidence.runtimeRevision,
      evidence.runtimeImageDigest,
      evidence.causalTickSchema,
      evidence.rulesetVersion,
    ),
    "PRODUCTION_RUNTIME_MISMATCH",
  );

  return admission(input, evidence, checks);
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
