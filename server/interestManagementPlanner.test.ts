import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { createStructureProjectionContract } from "../shared/structureProjectionProtocol";
import { interestMetrics, planInterestManagement } from "./interestManagementPlanner";

function structureProjection(chunkCoordinate: { x: number; z: number }, structureId: string) {
  const identity = {
    protocol: "aurion.structure-observation.v1" as const,
    worldId: "echoes-of-aurion-global",
    epoch: 9,
    chunkCoordinate,
    structureId,
    anchorId: "anchor:" + structureId,
    grammarId: "village-house",
    grammarVersion: "1.0.0",
    worldSeedHash: canonicalSha256({ seed: "interest-test" }),
    confirmedChunkAuthorityStateHash: canonicalSha256({ chunk: chunkCoordinate }),
    sourceRevision: "c".repeat(40),
    sourceCausalRoot: canonicalSha256({ root: "interest-test", chunk: chunkCoordinate }),
  };
  const observationKey = canonicalSha256({
    domain: "aurion.structure-observation-key.v1",
    identity,
  });
  const materializationEnvelope = {
    protocol: "aurion.structure-materialization.v1" as const,
    observationKey,
    recipeHash: "1".repeat(64),
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
      assetKeys: [],
      primitiveKinds: [],
    },
  };
  return createStructureProjectionContract({
    identity,
    recipeHash: materializationEnvelope.recipeHash,
    materialization: {
      ...materializationEnvelope,
      materializationHash: canonicalSha256({
        domain: "aurion.structure-materialization.v1",
        materialization: materializationEnvelope,
      }),
    },
  });
}

describe("AIM-489 interest management", () => {
  it("splits simulation, network, persistence and presentation without mutating the canonical world", () => {
    const activeStructure = structureProjection({ x: 0, z: 0 }, "house-active");
    const plan = planInterestManagement({
      worldId: "echoes-of-aurion-global",
      canonicalStateHash: canonicalSha256({ state: "confirmed-1" }),
      center: { x: 0, z: 0 },
      tier: "phone",
      cached: [],
      confirmedStructureProjections: [activeStructure],
    });

    expect(plan.simulationChunks).toHaveLength(1);
    expect(plan.networkChunks).toHaveLength(9);
    expect(plan.persistenceChunks).toHaveLength(1);
    expect(plan.persistenceMode).toBe("evidence-read-only");
    expect(plan.presentation.full).toHaveLength(1);
    expect(plan.presentation.prepared).toHaveLength(8);
    expect(plan.presentation.hlod).toHaveLength(0);
    expect(plan.structureRequirements).toHaveLength(1);
    expect(plan.structureRequirements[0]).toMatchObject({
      observationKey: activeStructure.observationKey,
      requiredProjection: "simulation",
      collisionRequired: true,
    });
    expect(plan.structureRequirements[0]?.networkCacheKey).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps one confirmed structure identity while changing only the interest projection band", () => {
    const structure = structureProjection({ x: 2, z: 0 }, "house-far");
    const far = planInterestManagement({
      worldId: "echoes-of-aurion-global",
      canonicalStateHash: canonicalSha256({ state: "confirmed-2" }),
      center: { x: 0, z: 0 },
      tier: "desktop",
      cached: [],
      confirmedStructureProjections: [structure],
    });
    const preload = planInterestManagement({
      worldId: "echoes-of-aurion-global",
      canonicalStateHash: canonicalSha256({ state: "confirmed-2" }),
      center: { x: 1, z: 0 },
      tier: "desktop",
      cached: [],
      confirmedStructureProjections: [structure],
    });

    expect(far.structureRequirements[0]?.observationKey).toBe(structure.observationKey);
    expect(preload.structureRequirements[0]?.observationKey).toBe(structure.observationKey);
    expect(far.structureRequirements[0]?.requiredProjection).toBe("hlod");
    expect(preload.structureRequirements[0]?.requiredProjection).toBe("full");
    expect(far.structureRequirements[0]?.networkCacheKey).not.toBe(
      preload.structureRequirements[0]?.networkCacheKey,
    );
  });

  it("reconnect/cache eviction reproduces the same relevance set for the same confirmed state", () => {
    const structureA = structureProjection({ x: 0, z: 0 }, "house-a");
    const structureB = structureProjection({ x: 1, z: 1 }, "house-b");
    const input = {
      worldId: "echoes-of-aurion-global",
      canonicalStateHash: canonicalSha256({ state: "confirmed-3" }),
      center: { x: 0, z: 0 },
      tier: "desktop" as const,
      confirmedStructureProjections: [structureA, structureB],
    };
    const first = planInterestManagement({ ...input, cached: [] });
    const afterEviction = planInterestManagement({ ...input, cached: [] });
    expect(afterEviction).toEqual(first);
    expect(afterEviction.relevanceHash).toBe(first.relevanceHash);
  });

  it("is deterministic under structure input reorder and exposes measurable relevance counts", () => {
    const one = structureProjection({ x: 0, z: 0 }, "house-one");
    const two = structureProjection({ x: 0, z: 0 }, "house-two");
    const args = {
      worldId: "echoes-of-aurion-global",
      canonicalStateHash: canonicalSha256({ state: "confirmed-4" }),
      center: { x: 0, z: 0 },
      tier: "desktop" as const,
      cached: [],
    };
    const a = planInterestManagement({
      ...args,
      confirmedStructureProjections: [one, two],
    });
    const b = planInterestManagement({
      ...args,
      confirmedStructureProjections: [two, one],
    });
    expect(b).toEqual(a);
    expect(interestMetrics(a)).toMatchObject({
      simulationChunks: 1,
      networkChunks: 25,
      persistenceChunks: 1,
      presentationChunks: 25,
      structureRequirements: 2,
      networkVsAllVisibleRatioBps: 10_000,
    });
  });

  it("never treats HLOD or network filtering as a delete operation", () => {
    const farStructure = structureProjection({ x: 2, z: 2 }, "house-hlod");
    const plan = planInterestManagement({
      worldId: "echoes-of-aurion-global",
      canonicalStateHash: canonicalSha256({ state: "confirmed-5" }),
      center: { x: 0, z: 0 },
      tier: "desktop",
      cached: [],
      confirmedStructureProjections: [farStructure],
      persistenceMode: "none",
    });
    expect(plan.structureRequirements[0]?.requiredProjection).toBe("hlod");
    expect(plan.persistenceMode).toBe("none");
    expect(JSON.stringify(plan)).not.toContain("delete");
    expect(plan.structureRequirements[0]?.observationKey).toBe(farStructure.observationKey);
  });
});
