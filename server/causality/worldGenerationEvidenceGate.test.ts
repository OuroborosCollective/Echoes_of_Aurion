import { describe, expect, it } from "vitest";
import {
  worldGenerationParityEvidenceSchema,
  type WorldGenerationParityEvidenceInput,
} from "./worldGenerationEvidenceContract";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
} from "./worldGenerationEvidenceHash";
import {
  assertWorldGenerationEvidenceGate,
  evaluateWorldGenerationEvidenceGate,
} from "./worldGenerationEvidenceGate";

const revision = "a".repeat(40);
const digest = "sha256:" + "1".repeat(64);
const hash = (hex: string) => "sha256:" + hex.repeat(64).slice(0, 64);

const runtimeIdentity = {
  sourceRevision: revision,
  runtimeRevision: revision,
  runtimeImageDigest: digest,
  causalTickSchema: "aurion.causal.tick.v2",
  rulesetVersion: "aurion.zone.rules.v2",
} as const;

function unsigned(overrides: Partial<WorldGenerationParityEvidenceInput> = {}): WorldGenerationParityEvidenceInput {
  return {
    schema: "aurion.world-generation.parity.v1",
    mutationAuthority: "none",
    status: "MATCH",
    runId: "fixture",
    worldId: "echoes-of-aurion-global",
    chunkCoordinate: { x: 3, z: -7 },
    anchorId: "anchor:gate",
    worldSeedHash: hash("2"),
    causalRootHash: hash("3"),
    grammarId: "gate-grammar",
    grammarVersion: "1.0.0",
    recipeHash: "4".repeat(64),
    dependencyRootHash: hash("5"),
    observationKey: hash("6"),
    confirmedChunkAuthorityStateHash: hash("7"),
    materializationHash: hash("8"),
    sourceRevision: revision,
    runtimeRevision: revision,
    runtimeImageDigest: digest,
    causalTickSchema: "aurion.causal.tick.v2",
    rulesetVersion: "aurion.zone.rules.v2",
    fromTick: 1,
    toTick: 1,
    inputRootHash: hash("9"),
    preStateRootHash: hash("a"),
    orderedIntentRootHash: hash("b"),
    authorityStageRootHash: hash("c"),
    rngRootHash: hash("d"),
    postStateRootHash: hash("e"),
    receiptRootHash: hash("f"),
    oracleVerdict: "MATCH",
    oracleResultHash: hash("1"),
    firstDivergenceBoundary: null,
    firstDivergenceStage: null,
    firstDivergenceTick: null,
    firstDivergenceExpectedHash: null,
    firstDivergenceObservedHash: null,
    referenceRuntimeIdentity: runtimeIdentity,
    productionRuntimeIdentity: runtimeIdentity,
    sourceIntelligence: {
      status: "NOT_CONFIGURED",
      parserVersion: null,
      parserRevision: null,
      parserStructureHash: null,
      inspectorVersion: null,
      inspectorRevision: null,
      inspectorFindingsHash: null,
      analysisVersion: null,
      requestSha256: null,
      responseSha256: null,
      analysisFingerprint: null,
      sourceBoundary: "not_configured",
    },
    sourceIntelligenceStatus: "NOT_CONFIGURED",
    determinismHash: hash("0"),
    artifactIntegrityHash: hash("1"),
    timing: {
      grammarCompileMs: 0,
      cagAnalysisMs: 0,
      observationMs: 0,
      materializationMs: 0,
      simulationMs: 0,
      referenceReplayMs: 0,
      persistenceMs: 0,
      serializationMs: 0,
      evidenceWriteMs: 0,
    },
    artifactChecksums: [{ path: "dist/example.js", sha256: hash("2") }],
    createdAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

function evidence(overrides: Partial<WorldGenerationParityEvidenceInput> = {}) {
  const base = unsigned(overrides);
  const determinismHash = computeWorldGenerationDeterminismHash(base);
  const artifactIntegrityHash = computeWorldGenerationArtifactIntegrityHash(base.artifactChecksums);
  return worldGenerationParityEvidenceSchema.parse({
    ...base,
    determinismHash,
    artifactIntegrityHash,
  });
}

describe("AIM-563 World-Generation Evidence Gate", () => {
  it("admits an exact MATCH evidence envelope for an Atlas consumer", () => {
    const value = evidence();
    const result = evaluateWorldGenerationEvidenceGate(value, {
      consumer: "ATLAS_BUILD",
      expectedWorldId: value.worldId,
      expectedSourceRevision: revision,
      expectedRuntimeRevision: revision,
      expectedRuntimeImageDigest: digest,
      expectedCausalTickSchema: value.causalTickSchema,
      expectedRulesetVersion: value.rulesetVersion,
    });
    expect(result.verdict).toBe("ADMIT");
    expect(result.reason).toBeNull();
    expect(result.engine.schema).toBe("aurion.evidence-gate-engine.v1");
    expect(result.engine.verdict).toBe("ADMIT");
    expect(result.engine.checks.every(check => check.pass)).toBe(true);
    expect(result.evidenceDeterminismHash).toBe(value.determinismHash);
    expect(result.evidenceArtifactIntegrityHash).toBe(value.artifactIntegrityHash);
    expect(result.admissionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => assertWorldGenerationEvidenceGate(value, {
      consumer: "ATLAS_BUILD",
      expectedSourceRevision: revision,
      expectedRuntimeImageDigest: digest,
    })).not.toThrow();
  });

  it.each([
    ["FIRST_DIVERGENCE", "STATUS_NOT_MATCH"],
    ["UNPROVABLE", "STATUS_NOT_MATCH"],
  ] as const)("holds non-match evidence: %s", (status, reason) => {
    const value = evidence({ status });
    const result = evaluateWorldGenerationEvidenceGate(value, { consumer: "WORLD_PROJECTION" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe(reason);
  });

  it("holds tampered determinism evidence", () => {
    const value = evidence();
    const tampered = { ...value, determinismHash: hash("9") };
    const result = evaluateWorldGenerationEvidenceGate(tampered, { consumer: "ATLAS_BUILD" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe("DETERMINISM_HASH_INVALID");
  });

  it("holds tampered artifact integrity", () => {
    const value = evidence();
    const tampered = { ...value, artifactIntegrityHash: hash("a") };
    const result = evaluateWorldGenerationEvidenceGate(tampered, { consumer: "ASSET_SHIPPING" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe("ARTIFACT_INTEGRITY_INVALID");
  });

  it("holds exact identity drift", () => {
    const value = evidence();
    expect(evaluateWorldGenerationEvidenceGate(value, {
      consumer: "ATLAS_BUILD",
      expectedSourceRevision: "b".repeat(40),
    }).reason).toBe("SOURCE_REVISION_MISMATCH");
    expect(evaluateWorldGenerationEvidenceGate(value, {
      consumer: "ATLAS_BUILD",
      expectedRuntimeRevision: "b".repeat(40),
    }).reason).toBe("RUNTIME_REVISION_MISMATCH");
    expect(evaluateWorldGenerationEvidenceGate(value, {
      consumer: "ATLAS_BUILD",
      expectedRuntimeImageDigest: hash("b"),
    }).reason).toBe("IMAGE_DIGEST_MISMATCH");
  });

  it("holds reference or production runtime identity drift even without consumer expectations", () => {
    const reference = evidence({
      referenceRuntimeIdentity: {
        ...runtimeIdentity,
        runtimeRevision: "b".repeat(40),
      },
    });
    expect(evaluateWorldGenerationEvidenceGate(reference, { consumer: "RUNTIME_PREP" }).reason)
      .toBe("REFERENCE_RUNTIME_MISMATCH");

    const production = evidence({
      productionRuntimeIdentity: {
        ...runtimeIdentity,
        runtimeRevision: "b".repeat(40),
      },
    });
    expect(evaluateWorldGenerationEvidenceGate(production, { consumer: "RUNTIME_PREP" }).reason)
      .toBe("PRODUCTION_RUNTIME_MISMATCH");
  });

  it("keeps CAG/source intelligence optional while still requiring parity evidence", () => {
    const value = evidence({
      sourceIntelligence: {
        status: "UNAVAILABLE",
        parserVersion: null,
        parserRevision: null,
        parserStructureHash: null,
        inspectorVersion: null,
        inspectorRevision: null,
        inspectorFindingsHash: null,
        analysisVersion: null,
        requestSha256: null,
        responseSha256: null,
        analysisFingerprint: null,
        sourceBoundary: "provider-unavailable",
      },
      sourceIntelligenceStatus: "UNAVAILABLE",
    });
    const result = evaluateWorldGenerationEvidenceGate(value, { consumer: "WORLD_PROJECTION" });
    expect(result.verdict).toBe("ADMIT");
  });

  it("holds when oracle MATCH evidence is missing", () => {
    const value = evidence({ oracleVerdict: null, oracleResultHash: null });
    const result = evaluateWorldGenerationEvidenceGate(value, { consumer: "WORLD_PROJECTION" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe("ORACLE_NOT_MATCH");
  });

  it("fails closed on schema-invalid evidence", () => {
    const result = evaluateWorldGenerationEvidenceGate({ nope: true }, { consumer: "ATLAS_BUILD" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe("SCHEMA_INVALID");
  });
});
