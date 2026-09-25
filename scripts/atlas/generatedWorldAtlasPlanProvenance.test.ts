import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  buildGeneratedWorldAtlasPlan,
} from "./generatedWorldAtlasPlan";
import {
  buildGeneratedStructurePresentationProvenance,
} from "./generatedStructurePresentationProvenance";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
} from "../../server/causality/worldGenerationEvidenceHash";
import { worldGenerationParityEvidenceSchema } from "../../server/causality/worldGenerationEvidenceContract";

const hash = (value: string) => canonicalSha256({ value });
const revision = "a".repeat(40);
const image = "sha256:" + "1".repeat(64);

function buildProjection() {
  const identity = {
    protocol: "aurion.structure-observation.v1" as const,
    worldId: "echoes-of-aurion-global",
    epoch: 1,
    chunkCoordinate: { x: 7, z: -9 },
    structureId: "structure:test",
    anchorId: "anchor:test",
    grammarId: "grammar:test",
    grammarVersion: "1.0.0",
    worldSeedHash: hash("seed"),
    confirmedChunkAuthorityStateHash: hash("authority"),
    sourceRevision: revision,
    sourceCausalRoot: hash("root"),
  };
  const materialization = {
    protocol: "aurion.structure-materialization.v1" as const,
    observationKey: hash("observation"),
    recipeHash: "2".repeat(64),
    state: "BASE_GRAMMAR" as const,
    primitives: [],
    deltaOverride: null,
    footprint: {
      protocol: "aurion.structure-footprint.v1" as const,
      semantics: "projection-only" as const,
      primitives: [],
      deltaOverridePositionMm: null,
    },
    collision: {
      protocol: "aurion.structure-collision-descriptor.v1" as const,
      semantics: "projection-only" as const,
      primitiveIds: [],
      deltaOverride: false,
    },
    presentation: {
      protocol: "aurion.structure-presentation-descriptor.v1" as const,
      semantics: "presentation-only" as const,
      assetKeys: ["wall", "roof"],
      primitiveKinds: ["box" as const],
    },
    materializationHash: hash("materialization"),
  };
  const envelope = {
    protocol: "aurion.structure-projection.v1" as const,
    observationKey: materialization.observationKey,
    identity,
    recipeHash: materialization.recipeHash,
    materializationHash: materialization.materializationHash,
    footprint: materialization.footprint,
    collision: materialization.collision,
    presentation: materialization.presentation,
    collisionProjection: {
      protocol: "aurion.structure-collision-projection.v1" as const,
      observationKey: materialization.observationKey,
      confirmedChunkAuthorityStateHash: identity.confirmedChunkAuthorityStateHash,
      footprint: materialization.footprint,
      collision: materialization.collision,
    },
    npcProjection: {
      protocol: "aurion.structure-npc-projection.v1" as const,
      observationKey: materialization.observationKey,
      worldId: identity.worldId,
      chunkCoordinate: identity.chunkCoordinate,
      structureId: identity.structureId,
      anchorId: identity.anchorId,
      grammarId: identity.grammarId,
      grammarVersion: identity.grammarVersion,
      confirmedChunkAuthorityStateHash: identity.confirmedChunkAuthorityStateHash,
      sourceCausalRoot: identity.sourceCausalRoot,
      sourceRevision: identity.sourceRevision,
      recipeHash: materialization.recipeHash,
      materializationHash: materialization.materializationHash,
    },
    networkProjection: {
      protocol: "aurion.structure-network-projection.v1" as const,
      observationKey: materialization.observationKey,
      worldId: identity.worldId,
      chunkCoordinate: identity.chunkCoordinate,
      structureId: identity.structureId,
      anchorId: identity.anchorId,
      recipeHash: materialization.recipeHash,
      materializationHash: materialization.materializationHash,
      footprint: materialization.footprint,
    },
    ax1Projection: {
      protocol: "aurion.structure-ax1-projection.v1" as const,
      observationKey: materialization.observationKey,
      worldId: identity.worldId,
      chunkCoordinate: identity.chunkCoordinate,
      structureId: identity.structureId,
      anchorId: identity.anchorId,
      grammarId: identity.grammarId,
      grammarVersion: identity.grammarVersion,
      recipeHash: materialization.recipeHash,
      materializationHash: materialization.materializationHash,
      presentation: materialization.presentation,
    },
  };
  return {
    ...envelope,
    projectionHash: canonicalSha256({ domain: "aurion.structure-projection.v1", envelope }),
  };
}

function buildEvidence(provenance: ReturnType<typeof buildGeneratedStructurePresentationProvenance>) {
  const base = {
    schema: "aurion.world-generation.parity.v1" as const,
    mutationAuthority: "none" as const,
    status: "MATCH" as const,
    runId: "atlas-provenance",
    worldId: provenance.worldId,
    chunkCoordinate: provenance.chunkCoordinate,
    anchorId: provenance.anchorId,
    worldSeedHash: hash("seed"),
    causalRootHash: provenance.sourceCausalRoot,
    grammarId: provenance.grammarId,
    grammarVersion: provenance.grammarVersion,
    recipeHash: provenance.recipeHash,
    dependencyRootHash: hash("dependency"),
    observationKey: provenance.observationKey,
    confirmedChunkAuthorityStateHash: provenance.confirmedChunkAuthorityStateHash,
    materializationHash: provenance.materializationHash,
    sourceRevision: provenance.sourceRevision,
    runtimeRevision: revision,
    runtimeImageDigest: image,
    causalTickSchema: "aurion.causal.tick.v2",
    rulesetVersion: "aurion.zone.rules.v2",
    fromTick: 1,
    toTick: 1,
    inputRootHash: hash("input"),
    preStateRootHash: hash("pre"),
    orderedIntentRootHash: hash("intent"),
    authorityStageRootHash: hash("authority"),
    rngRootHash: hash("rng"),
    postStateRootHash: hash("post"),
    receiptRootHash: hash("receipt"),
    oracleVerdict: "MATCH" as const,
    oracleResultHash: hash("oracle"),
    firstDivergenceBoundary: null,
    firstDivergenceStage: null,
    firstDivergenceTick: null,
    firstDivergenceExpectedHash: null,
    firstDivergenceObservedHash: null,
    referenceRuntimeIdentity: {
      sourceRevision: revision,
      runtimeRevision: revision,
      runtimeImageDigest: image,
      causalTickSchema: "aurion.causal.tick.v2",
      rulesetVersion: "aurion.zone.rules.v2",
    },
    productionRuntimeIdentity: {
      sourceRevision: revision,
      runtimeRevision: revision,
      runtimeImageDigest: image,
      causalTickSchema: "aurion.causal.tick.v2",
      rulesetVersion: "aurion.zone.rules.v2",
    },
    sourceIntelligence: {
      status: "NOT_CONFIGURED" as const,
      parserVersion: null, parserRevision: null, parserStructureHash: null,
      inspectorVersion: null, inspectorRevision: null, inspectorFindingsHash: null,
      analysisVersion: null, requestSha256: null, responseSha256: null,
      analysisFingerprint: null, sourceBoundary: "not_configured",
    },
    sourceIntelligenceStatus: "NOT_CONFIGURED" as const,
    determinismHash: "",
    artifactIntegrityHash: "",
    timing: {
      grammarCompileMs: 0, cagAnalysisMs: 0, observationMs: 0, materializationMs: 0,
      simulationMs: 0, referenceReplayMs: 0, persistenceMs: 0, serializationMs: 0, evidenceWriteMs: 0,
    },
    artifactChecksums: [{ path: "fixture.bin", sha256: hash("artifact") }],
    createdAt: "2026-09-25T00:00:00.000Z",
  };
  return worldGenerationParityEvidenceSchema.parse({
    ...base,
    determinismHash: computeWorldGenerationDeterminismHash(base),
    artifactIntegrityHash: computeWorldGenerationArtifactIntegrityHash(base.artifactChecksums),
  });
}

test("#505 binds generated-world atlas planning to the canonical #515 presentation descriptor", () => {
  const projection = buildProjection();
  const provenance = buildGeneratedStructurePresentationProvenance(projection);
  const evidence = buildEvidence(provenance);
  const atlas = {
    schemaVersion: "aurion.deterministic-atlas-plan.v1",
    atlasId: "provenance-plan",
    family: "generated-structure",
    pageWidth: 64,
    pageHeight: 64,
    padding: 1,
    gutter: 1,
    rotationAllowed: false,
    sourceManifestHash: hash("source-manifest"),
    sourceInputs: [{
      assetId: "wall",
      path: "generated/wall.webp",
      contentSha256: "3".repeat(64),
      width: 16,
      height: 16,
      compatibilityClass: "basecolor-srgb",
      localityBucket: "chunk-7--9",
    }],
  };

  const result = buildGeneratedWorldAtlasPlan({
    evidence,
    structureProjection: projection,
    gateContext: {
      expectedWorldId: provenance.worldId,
      expectedSourceRevision: revision,
      expectedRuntimeRevision: revision,
      expectedRuntimeImageDigest: image,
      expectedCausalTickSchema: "aurion.causal.tick.v2",
      expectedRulesetVersion: "aurion.zone.rules.v2",
    },
    atlas,
  });

  assert.equal(result.presentationProvenance?.observationKey, provenance.observationKey);
  assert.equal(result.presentationProvenance?.recipeHash, provenance.recipeHash);
  assert.equal(result.presentationProvenance?.materializationHash, provenance.materializationHash);
  assert.equal(result.plan.groups[0]?.pages[0]?.placements.length, 1);
});

test("#505 refuses an atlas when presentation provenance drifts from parity evidence", () => {
  const projection = buildProjection();
  const provenance = buildGeneratedStructurePresentationProvenance(projection);
  const evidence = buildEvidence(provenance);
  const changedUnsigned = { ...evidence, materializationHash: hash("different") };
  const changedEvidence = worldGenerationParityEvidenceSchema.parse({
    ...changedUnsigned,
    determinismHash: computeWorldGenerationDeterminismHash(changedUnsigned),
  });

  assert.throws(
    () => buildGeneratedWorldAtlasPlan({
      evidence: changedEvidence,
      structureProjection: projection,
      gateContext: {
        expectedWorldId: provenance.worldId,
        expectedSourceRevision: revision,
        expectedRuntimeRevision: revision,
        expectedRuntimeImageDigest: image,
        expectedCausalTickSchema: "aurion.causal.tick.v2",
        expectedRulesetVersion: "aurion.zone.rules.v2",
      },
      atlas: {
        schemaVersion: "aurion.deterministic-atlas-plan.v1",
        atlasId: "provenance-plan",
        family: "generated-structure",
        pageWidth: 64,
        pageHeight: 64,
        padding: 1,
        gutter: 1,
        rotationAllowed: false,
        sourceInputs: [{
          assetId: "wall",
          path: "generated/wall.webp",
          contentSha256: "3".repeat(64),
          width: 16,
          height: 16,
          compatibilityClass: "basecolor-srgb",
          localityBucket: "chunk-7--9",
        }],
      },
    }),
    /ATLAS_PRESENTATION_EVIDENCE_MATERIALIZATIONHASH_MISMATCH/,
  );
});
