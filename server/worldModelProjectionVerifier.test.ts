import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { createStructureProjectionContract } from "../shared/structureProjectionProtocol";
import {
  compareWorldModelProjections,
  verifyWorldModelProjection,
} from "./worldModelProjectionVerifier";

const worldRevision = "a".repeat(40);
const worldStateHash = canonicalSha256({ world: "confirmed-1", epoch: 7 });
const wrongStateHash = canonicalSha256({ world: "confirmed-2", epoch: 7 });

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
  confirmedChunkAuthorityStateHash: worldStateHash,
  sourceRevision: worldRevision,
  sourceCausalRoot: canonicalSha256({ root: "root-7" }),
};

const observationKey = canonicalSha256({
  domain: "aurion.structure-observation-key.v1",
  identity,
});

const materializationBase = {
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

function projectionContract(assetKeys = ["tower_stone"]) {
  const materialization = {
    ...materializationBase,
    presentation: {
      ...materializationBase.presentation,
      assetKeys,
    },
    materializationHash: canonicalSha256({
      domain: "aurion.structure-materialization.v1",
      materialization: {
        ...materializationBase,
        presentation: {
          ...materializationBase.presentation,
          assetKeys,
        },
      },
    }),
  };

  return createStructureProjectionContract({
    identity,
    recipeHash: materialization.recipeHash,
    materialization,
  });
}

const canonicalProjection = projectionContract();
const presentationVariant = projectionContract(["tower_stone", "tower_detail_lod"]);

function inputFor(contract: ReturnType<typeof projectionContract>, overrides: Record<string, unknown> = {}) {
  return {
    worldRevision,
    worldStateHash,
    projectionHash: contract.projectionHash,
    recipeHash: contract.recipeHash,
    observationKey: contract.observationKey,
    projectionContract: contract,
    ...overrides,
  };
}

describe("worldModelProjectionVerifier", () => {
  it("verifies an actual Aurion projection contract against exact revision and canonical state", () => {
    const result = verifyWorldModelProjection(inputFor(canonicalProjection));

    expect(result.status).toBe("MATCH");
    expect(result.divergenceBoundary).toBeNull();
    expect(result.projectionChanged).toBe(false);
    expect(result.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("allows presentation-only change when canonical world identity is unchanged", () => {
    const result = compareWorldModelProjections(
      inputFor(canonicalProjection),
      inputFor(presentationVariant),
    );

    expect(result.status).toBe("MATCH");
    expect(result.projectionChanged).toBe(true);
    expect(result.divergenceBoundary).toBeNull();
  });

  it("detects canonical world-state changes before treating the difference as presentation-only", () => {
    const result = compareWorldModelProjections(
      inputFor(canonicalProjection),
      inputFor(presentationVariant, { worldStateHash: wrongStateHash }),
    );

    expect(result.status).toBe("FIRST_DIVERGENCE");
    expect(result.divergenceBoundary).toBe("CANONICAL_STATE");
    expect(result.diagnostic).toBe("PROJECTION_CANONICAL_STATE_CHANGED");
  });

  it("detects revision drift at the authority boundary", () => {
    const result = verifyWorldModelProjection(
      inputFor(canonicalProjection, { worldRevision: "b".repeat(40) }),
    );

    expect(result.status).toBe("FIRST_DIVERGENCE");
    expect(result.divergenceBoundary).toBe("WORLD_REVISION");
  });

  it("fails closed when only detached hashes are supplied", () => {
    const result = verifyWorldModelProjection({
      worldRevision,
      worldStateHash,
      projectionHash: canonicalProjection.projectionHash,
      recipeHash: canonicalProjection.recipeHash,
      observationKey: canonicalProjection.observationKey,
    });

    expect(result.status).toBe("UNPROVABLE");
    expect(result.diagnostic).toBe("PROJECTION_CONTRACT_UNPROVABLE");
  });

  it("fails closed for tampered projection content even when the observed hash is unchanged", () => {
    const tampered = structuredClone(canonicalProjection) as Record<string, unknown>;
    (tampered.ax1Projection as Record<string, unknown>).presentation = {
      ...((tampered.ax1Projection as Record<string, unknown>).presentation as Record<string, unknown>),
      assetKeys: ["tampered_asset"],
    };

    const result = verifyWorldModelProjection(
      inputFor(canonicalProjection, { projectionContract: tampered }),
    );

    expect(result.status).toBe("UNPROVABLE");
    expect(result.diagnostic).toBe("PROJECTION_CONTRACT_UNPROVABLE");
  });

  it("is stable across repeated verification of the same cache rebuild", () => {
    const first = verifyWorldModelProjection(inputFor(canonicalProjection));
    const second = verifyWorldModelProjection(inputFor(canonicalProjection));

    expect(second).toEqual(first);
  });
});
