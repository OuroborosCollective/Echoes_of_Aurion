import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  createStructureProjectionContract,
  assertStructureProjectionContract,
  structureProjectionAssetKeys,
} from "../shared/structureProjectionProtocol";

const identity = {
  protocol: "aurion.structure-observation.v1" as const,
  worldId: "echoes-of-aurion-global",
  epoch: 7,
  chunkCoordinate: { x: -4, z: 9 },
  structureId: "tower-7",
  anchorId: "anchor:tower-7",
  grammarId: "tower",
  grammarVersion: "2.0.0",
  worldSeedHash: canonicalSha256({ seed: "seed-7" }),
  confirmedChunkAuthorityStateHash: canonicalSha256({ chunk: "confirmed-7" }),
  sourceRevision: "b".repeat(40),
  sourceCausalRoot: canonicalSha256({ root: "root-7" }),
};

const observationKey = canonicalSha256({ domain: "aurion.structure-observation-key.v1", identity });

const materializationEnvelope = {
  protocol: "aurion.structure-materialization.v1" as const,
  observationKey,
  recipeHash: "4".repeat(64),
  state: "BASE_GRAMMAR" as const,
  primitives: [{
    id: "root:tower/primitive",
    source: "grammar" as const,
    primitive: "box" as const,
    assetKey: "tower_stone",
    materialKey: "stone",
    positionMm: { x: 1_000, y: 0, z: 2_000 },
    rotationDiscrete: { x: 0, y: 1, z: 0 },
    sizeMm: { x: 4_000, y: 8_000, z: 4_000 },
  }],
  deltaOverride: null,
  footprint: {
    protocol: "aurion.structure-footprint.v1" as const,
    semantics: "projection-only" as const,
    primitives: [{
      id: "root:tower/primitive",
      positionMm: { x: 1_000, z: 2_000 },
      sizeMm: { x: 4_000, z: 4_000 },
      rotationDiscrete: { x: 0, y: 1, z: 0 },
    }],
    deltaOverridePositionMm: null,
  },
  collision: {
    protocol: "aurion.structure-collision-descriptor.v1" as const,
    semantics: "projection-only" as const,
    primitiveIds: ["root:tower/primitive"],
    deltaOverride: false,
  },
  presentation: {
    protocol: "aurion.structure-presentation-descriptor.v1" as const,
    semantics: "presentation-only" as const,
    assetKeys: ["tower_stone"],
    primitiveKinds: ["box" as const],
  },
};

const materialization = {
  ...materializationEnvelope,
  materializationHash: canonicalSha256({ domain: "aurion.structure-materialization.v1", materialization: materializationEnvelope }),
};

describe("structureProjectionProtocol", () => {
  it("creates one canonical projection identity for collision, NPC, network and AX1", () => {
    const contract = createStructureProjectionContract({
      identity,
      recipeHash: materialization.recipeHash,
      materialization,
    });

    expect(contract.observationKey).toBe(identity && observationKey);
    expect(contract.collisionProjection.observationKey).toBe(contract.observationKey);
    expect(contract.npcProjection.observationKey).toBe(contract.observationKey);
    expect(contract.networkProjection.observationKey).toBe(contract.observationKey);
    expect(contract.ax1Projection.observationKey).toBe(contract.observationKey);
    expect(contract.npcProjection).not.toHaveProperty("assetKeys");
    expect(contract.networkProjection).not.toHaveProperty("presentation");
    expect(contract.ax1Projection.presentation.assetKeys).toEqual(["tower_stone"]);
    expect(structureProjectionAssetKeys(contract)).toEqual(["tower_stone"]);
    assertStructureProjectionContract(contract);
  });

  it("does not change projection identity when consumer-local presentation data is derived", () => {
    const contract = createStructureProjectionContract({
      identity,
      recipeHash: materialization.recipeHash,
      materialization,
    });
    const presentationVariant = {
      ...materialization,
      presentation: {
        ...materialization.presentation,
        assetKeys: ["tower_stone", "tower_detail_lod"],
      },
      materializationHash: canonicalSha256({
        domain: "aurion.structure-materialization.v1",
        materialization: {
          ...materializationEnvelope,
          presentation: {
            ...materialization.presentation,
            assetKeys: ["tower_stone", "tower_detail_lod"],
          },
        },
      }),
    };
    const variant = createStructureProjectionContract({
      identity,
      recipeHash: materialization.recipeHash,
      materialization: presentationVariant,
    });
    expect(variant.observationKey).toBe(contract.observationKey);
    expect(variant.npcProjection.observationKey).toBe(contract.npcProjection.observationKey);
    expect(variant.networkProjection.observationKey).toBe(contract.networkProjection.observationKey);
    expect(variant.ax1Projection.observationKey).toBe(contract.ax1Projection.observationKey);
    expect(variant.materializationHash).not.toBe(contract.materializationHash);
  });

  it("fails closed when a materialization belongs to a different observation or recipe", () => {
    expect(() => createStructureProjectionContract({
      identity,
      recipeHash: materialization.recipeHash,
      materialization: { ...materialization, observationKey: canonicalSha256({ wrong: true }) },
    })).toThrow("STRUCTURE_PROJECTION_OBSERVATION_KEY_MISMATCH");

    expect(() => createStructureProjectionContract({
      identity,
      recipeHash: "5".repeat(64),
      materialization,
    })).toThrow("STRUCTURE_PROJECTION_RECIPE_HASH_MISMATCH");
  });
});
