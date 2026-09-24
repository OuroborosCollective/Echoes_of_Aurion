import { describe, expect, it } from "vitest";
import {
  worldGenerationParityEvidenceSchema,
  type WorldGenerationParityEvidenceInput,
} from "../../server/causality/worldGenerationEvidenceContract";
import { computeWorldGenerationArtifactIntegrityHash, computeWorldGenerationDeterminismHash } from "../../server/causality/worldGenerationEvidenceHash";
import { evaluateGeneratedWorldAtlasInput, assertGeneratedWorldAtlasInput } from "./worldGenerationAtlasAdmission";

const revision = "a".repeat(40);
const digest = "sha256:" + "1".repeat(64);
const hash = (hex: string) => "sha256:" + hex.repeat(64).slice(0, 64);
const identity = {
  sourceRevision: revision,
  runtimeRevision: revision,
  runtimeImageDigest: digest,
  causalTickSchema: "aurion.causal.tick.v2",
  rulesetVersion: "aurion.zone.rules.v2",
} as const;

function createEvidence(overrides: Partial<WorldGenerationParityEvidenceInput> = {}) {
  const base: WorldGenerationParityEvidenceInput = {
    schema: "aurion.world-generation.parity.v1",
    mutationAuthority: "none",
    status: "MATCH",
    runId: "atlas-admission-fixture",
    worldId: "echoes-of-aurion-global",
    chunkCoordinate: { x: 8, z: -3 },
    anchorId: "anchor:atlas",
    worldSeedHash: hash("2"),
    causalRootHash: hash("3"),
    grammarId: "city-house",
    grammarVersion: "1.0.0",
    recipeHash: "4".repeat(64),
    dependencyRootHash: hash("5"),
    observationKey: hash("6"),
    confirmedChunkAuthorityStateHash: hash("7"),
    materializationHash: hash("8"),
    sourceRevision: revision,
    runtimeRevision: revision,
    runtimeImageDigest: digest,
    causalTickSchema: identity.causalTickSchema,
    rulesetVersion: identity.rulesetVersion,
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
    referenceRuntimeIdentity: identity,
    productionRuntimeIdentity: identity,
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
    artifactChecksums: [{ path: "dist/atlas.bin", sha256: hash("2") }],
    createdAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
  const determinismHash = computeWorldGenerationDeterminismHash(base);
  const artifactIntegrityHash = computeWorldGenerationArtifactIntegrityHash(base.artifactChecksums);
  return worldGenerationParityEvidenceSchema.parse({ ...base, determinismHash, artifactIntegrityHash });
}

const context = {
  expectedWorldId: "echoes-of-aurion-global",
  expectedSourceRevision: revision,
  expectedRuntimeRevision: revision,
  expectedRuntimeImageDigest: digest,
  expectedCausalTickSchema: identity.causalTickSchema,
  expectedRulesetVersion: identity.rulesetVersion,
};

describe("#505 generated-world atlas admission", () => {
  it("admits only verified #510 MATCH evidence", () => {
    const result = evaluateGeneratedWorldAtlasInput(createEvidence(), context);
    expect(result.verdict).toBe("ADMIT");
    expect(result.consumer).toBe("ATLAS_BUILD");
    expect(() => assertGeneratedWorldAtlasInput(createEvidence(), context)).not.toThrow();
  });

  it("holds an evidence mismatch before any atlas build is allowed", () => {
    const result = evaluateGeneratedWorldAtlasInput(createEvidence({ status: "FIRST_DIVERGENCE" }), context);
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe("STATUS_NOT_MATCH");
  });

  it("holds exact runtime-image drift", () => {
    const result = evaluateGeneratedWorldAtlasInput(createEvidence(), {
      ...context,
      expectedRuntimeImageDigest: hash("9"),
    });
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe("IMAGE_DIGEST_MISMATCH");
  });
});
