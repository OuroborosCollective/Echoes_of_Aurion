import test from "node:test";
import assert from "node:assert/strict";
import {
  worldGenerationParityEvidenceSchema,
  type WorldGenerationParityEvidenceInput,
} from "../../server/causality/worldGenerationEvidenceContract";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
} from "../../server/causality/worldGenerationEvidenceHash";
import { buildGeneratedWorldAtlasPlan } from "./generatedWorldAtlasPlan";

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

function evidence(overrides: Partial<WorldGenerationParityEvidenceInput> = {}) {
  const base: WorldGenerationParityEvidenceInput = {
    schema: "aurion.world-generation.parity.v1",
    mutationAuthority: "none",
    status: "MATCH",
    runId: "generated-world-atlas-plan-test",
    worldId: "echoes-of-aurion-global",
    chunkCoordinate: { x: 2, z: -4 },
    anchorId: "anchor:generated-structure",
    worldSeedHash: hash("2"),
    causalRootHash: hash("3"),
    grammarId: "generated-structure",
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
    artifactChecksums: [{ path: "evidence/generated-world.bin", sha256: hash("2") }],
    createdAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
  const determinismHash = computeWorldGenerationDeterminismHash(base);
  const artifactIntegrityHash = computeWorldGenerationArtifactIntegrityHash(base.artifactChecksums);
  return worldGenerationParityEvidenceSchema.parse({ ...base, determinismHash, artifactIntegrityHash });
}

const gateContext = {
  expectedWorldId: "echoes-of-aurion-global",
  expectedSourceRevision: revision,
  expectedRuntimeRevision: revision,
  expectedRuntimeImageDigest: digest,
  expectedCausalTickSchema: identity.causalTickSchema,
  expectedRulesetVersion: identity.rulesetVersion,
} as const;

const atlas = {
  schemaVersion: "aurion.deterministic-atlas-plan.v1",
  atlasId: "generated-structure-presentation",
  family: "generated-structure",
  pageWidth: 32,
  pageHeight: 32,
  padding: 1,
  gutter: 1,
  rotationAllowed: false,
  sourceManifestHash: hash("3"),
  sourceInputs: [
    {
      assetId: "wall-a",
      path: "generated/wall-a.webp",
      contentSha256: hash("a").slice(7),
      width: 8,
      height: 8,
      compatibilityClass: "basecolor-srgb",
      localityBucket: "chunk-2--4",
    },
    {
      assetId: "wall-b",
      path: "generated/wall-b.webp",
      contentSha256: hash("b").slice(7),
      width: 12,
      height: 8,
      compatibilityClass: "basecolor-srgb",
      localityBucket: "chunk-2--4",
    },
    {
      assetId: "wall-a-alias",
      path: "generated/wall-a-alias.webp",
      contentSha256: hash("a").slice(7),
      width: 8,
      height: 8,
      compatibilityClass: "basecolor-srgb",
      localityBucket: "chunk-2--4",
    },
  ],
};

test("#505 requires #563 admission before building the presentation plan", () => {
  const output = buildGeneratedWorldAtlasPlan({
    evidence: evidence(),
    gateContext,
    atlas,
  });

  assert.equal(output.schemaVersion, "aurion.generated-world-atlas-plan.v1");
  assert.equal(output.consumer, "ATLAS_BUILD");
  assert.match(output.admissionHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(output.plan.planHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(output.plan.groups.length, 1);
  assert.equal(output.plan.groups[0]?.dedupeGroups.length, 2);
});

test("#505 is insensitive to source input order after #563 admission", () => {
  const first = buildGeneratedWorldAtlasPlan({
    evidence: evidence(),
    gateContext,
    atlas,
  });
  const second = buildGeneratedWorldAtlasPlan({
    evidence: evidence(),
    gateContext,
    atlas: {
      ...atlas,
      sourceInputs: [...atlas.sourceInputs].reverse(),
    },
  });

  assert.equal(second.plan.planHash, first.plan.planHash);
  assert.equal(second.admissionHash, first.admissionHash);
});

test("#505 fails closed before packing when parity evidence is not MATCH", () => {
  assert.throws(
    () => buildGeneratedWorldAtlasPlan({
      evidence: evidence({ status: "FIRST_DIVERGENCE" }),
      gateContext,
      atlas,
    }),
    /ATLAS_WORLD_GENERATION_EVIDENCE_GATE_STATUS_NOT_MATCH/,
  );
});

test("#505 fails closed when exact runtime identity drifts", () => {
  assert.throws(
    () => buildGeneratedWorldAtlasPlan({
      evidence: evidence(),
      gateContext: {
        ...gateContext,
        expectedRuntimeImageDigest: hash("f"),
      },
      atlas,
    }),
    /ATLAS_WORLD_GENERATION_EVIDENCE_GATE_IMAGE_DIGEST_MISMATCH/,
  );
});
