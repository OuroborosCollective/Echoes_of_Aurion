import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  assertGeneratedStructurePresentationProvenance,
  buildGeneratedStructurePresentationProvenance,
} from "./generatedStructurePresentationProvenance";

const hash = (v: string) => canonicalSha256({ v });

function projection() {
  const identity = {
    protocol: "aurion.structure-observation.v1" as const,
    worldId: "echoes-of-aurion-global",
    epoch: 9,
    chunkCoordinate: { x: 12, z: -8 },
    structureId: "house:9",
    anchorId: "anchor:house",
    grammarId: "house-grammar",
    grammarVersion: "1.0.0",
    worldSeedHash: hash("seed"),
    confirmedChunkAuthorityStateHash: hash("authority"),
    sourceRevision: "a".repeat(40),
    sourceCausalRoot: hash("root"),
  };

  const materialization = {
    protocol: "aurion.structure-materialization.v1" as const,
    observationKey: hash("observation"),
    recipeHash: "b".repeat(64),
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
      assetKeys: ["house_wall", "house_roof"],
      primitiveKinds: ["box" as const],
    },
    materializationHash: hash("materialization"),
  };

  const contract = {
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
    projectionHash: "",
  };

  const { projectionHash: _ignored, ...envelope } = contract;
  contract.projectionHash = canonicalSha256({ domain: "aurion.structure-projection.v1", envelope });
  return contract;
}

test("#505 derives provenance from the canonical #515 projection", () => {
  const result = buildGeneratedStructurePresentationProvenance(projection());
  assert.equal(result.protocol, "aurion.generated-structure.presentation-provenance.v1");
  assert.equal(result.observationKey, projection().observationKey);
  assert.deepEqual(result.presentation.assetKeys, ["house_roof", "house_wall"]);
  assert.deepEqual(result.presentation.primitiveKinds, ["box"]);
  assert.match(result.provenanceHash, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotThrow(() => assertGeneratedStructurePresentationProvenance(result));
});

test("#505 provenance changes when the presentation asset lineage changes", () => {
  const baseProjection = projection();
  const base = buildGeneratedStructurePresentationProvenance(baseProjection);
  const changedEnvelope = {
    ...baseProjection,
    presentation: {
      ...baseProjection.presentation,
      assetKeys: ["house_wall", "house_door"],
    },
    ax1Projection: {
      ...baseProjection.ax1Projection,
      presentation: {
        ...baseProjection.ax1Projection.presentation,
        assetKeys: ["house_wall", "house_door"],
      },
    },
  };
  const { projectionHash: _ignored, ...changedUnsigned } = changedEnvelope;
  const changed = buildGeneratedStructurePresentationProvenance({
    ...changedUnsigned,
    projectionHash: canonicalSha256({ domain: "aurion.structure-projection.v1", envelope: changedUnsigned }),
  });
  assert.notEqual(changed.provenanceHash, base.provenanceHash);
  assert.notEqual(changed.presentation.assetKeys, base.presentation.assetKeys);
});

test("#505 provenance rejects tampering", () => {
  const value = buildGeneratedStructurePresentationProvenance(projection());
  const tampered = { ...value, materializationHash: hash("tampered") };
  assert.throws(
    () => assertGeneratedStructurePresentationProvenance(tampered),
    /GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_HASH_MISMATCH/,
  );
});
