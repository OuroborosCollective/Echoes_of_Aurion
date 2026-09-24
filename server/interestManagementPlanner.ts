import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  buildInterestManagementPlanHashInput,
  interestManagementPlanSchema,
  networkCacheKey,
  type InterestManagementPlan,
  type InterestPersistenceMode,
  type StructureInterestRequirement,
} from "../shared/interestManagementProtocol";
import {
  planWorldChunkInterest,
  type WorldChunkInterestPlan,
} from "../shared/worldChunkInterestProtocol";
import type { WorldChunkCacheEntry, WorldChunkStreamingTier } from "../shared/worldChunkStreamingProtocol";
import {
  assertStructureProjectionContract,
  type StructureProjectionContract,
} from "../shared/structureProjectionProtocol";
import type { WorldChunkCoordinate } from "../shared/worldChunkProtocol";

const simulationChunkKey = (coordinate: WorldChunkCoordinate): string =>
  String(coordinate.x) + ":" + String(coordinate.z);

function coordinates(plan: WorldChunkInterestPlan): {
  simulation: readonly WorldChunkCoordinate[];
  network: readonly WorldChunkCoordinate[];
  persistence: readonly WorldChunkCoordinate[];
} {
  return {
    simulation: Object.freeze(plan.active.map(entry => Object.freeze({ ...entry.coordinate }))),
    network: Object.freeze(
      [...plan.active, ...plan.preload].map(entry =>
        Object.freeze({ ...entry.coordinate }),
      ),
    ),
    persistence: Object.freeze(plan.active.map(entry => Object.freeze({ ...entry.coordinate }))),
  };
}

function requiredProjectionForRing(
  ring: "active" | "preload" | "far",
): { requiredProjection: "simulation" | "full" | "hlod"; collisionRequired: boolean } {
  if (ring === "active") return { requiredProjection: "simulation", collisionRequired: true };
  if (ring === "preload") return { requiredProjection: "full", collisionRequired: false };
  return { requiredProjection: "hlod", collisionRequired: false };
}

function structureRequirements(input: {
  worldId: string;
  interest: WorldChunkInterestPlan;
  projections: readonly StructureProjectionContract[];
}): readonly StructureInterestRequirement[] {
  const rings = new Map<string, "active" | "preload" | "far">();
  for (const entry of [...input.interest.active, ...input.interest.preload, ...input.interest.far]) {
    rings.set(simulationChunkKey(entry.coordinate), entry.ring);
  }

  const deduped = new Map<string, StructureInterestRequirement>();
  for (const projection of input.projections) {
    assertStructureProjectionContract(projection);
    if (projection.identity.worldId !== input.worldId) {
      throw new Error("INTEREST_STRUCTURE_WORLD_SCOPE_MISMATCH");
    }
    const ring = rings.get(simulationChunkKey(projection.identity.chunkCoordinate));
    if (!ring) continue;
    const mode = requiredProjectionForRing(ring);
    const requirementBase = {
      observationKey: projection.observationKey,
      worldId: projection.identity.worldId,
      chunkCoordinate: Object.freeze({ ...projection.identity.chunkCoordinate }),
      structureId: projection.identity.structureId,
      anchorId: projection.identity.anchorId,
      confirmedChunkAuthorityStateHash: projection.identity.confirmedChunkAuthorityStateHash,
      sourceCausalRoot: projection.identity.sourceCausalRoot,
      sourceRevision: projection.identity.sourceRevision,
      recipeHash: projection.recipeHash,
      materializationHash: projection.materializationHash,
      requiredProjection: mode.requiredProjection,
      collisionRequired: mode.collisionRequired,
    } as const;
    const cacheKey = networkCacheKey({
      observationKey: requirementBase.observationKey,
      materializationHash: requirementBase.materializationHash,
      requiredProjection: requirementBase.requiredProjection,
    });
    const requirement = Object.freeze({ ...requirementBase, networkCacheKey: cacheKey });
    const previous = deduped.get(projection.observationKey);
    if (!previous) {
      deduped.set(projection.observationKey, requirement);
      continue;
    }
    const rank = (value: StructureInterestRequirement["requiredProjection"]) =>
      value === "simulation" ? 3 : value === "full" ? 2 : 1;
    if (rank(requirement.requiredProjection) > rank(previous.requiredProjection)) {
      deduped.set(projection.observationKey, requirement);
    } else if (
      requirement.requiredProjection === previous.requiredProjection &&
      requirement.networkCacheKey !== previous.networkCacheKey
    ) {
      throw new Error("INTEREST_STRUCTURE_CACHE_IDENTITY_CONFLICT");
    }
  }

  return Object.freeze(
    Array.from(deduped.values()).sort(
      (left, right) =>
        left.chunkCoordinate.z - right.chunkCoordinate.z ||
        left.chunkCoordinate.x - right.chunkCoordinate.x ||
        left.structureId.localeCompare(right.structureId) ||
        left.anchorId.localeCompare(right.anchorId) ||
        left.observationKey.localeCompare(right.observationKey),
    ),
  );
}

export function planInterestManagement(input: {
  worldId: string;
  canonicalStateHash: string;
  center: WorldChunkCoordinate;
  tier: WorldChunkStreamingTier;
  cached: readonly WorldChunkCacheEntry[];
  confirmedStructureProjections?: readonly StructureProjectionContract[];
  persistenceMode?: InterestPersistenceMode;
}): InterestManagementPlan {
  const interest = planWorldChunkInterest({
    center: input.center,
    tier: input.tier,
    cached: input.cached,
  });
  const chunkSets = coordinates(interest);
  const requirements = structureRequirements({
    worldId: input.worldId,
    interest,
    projections: input.confirmedStructureProjections ?? [],
  });
  const presentation = {
    full: Object.freeze(interest.active.map(entry => Object.freeze({ ...entry.coordinate }))),
    prepared: Object.freeze(interest.preload.map(entry => Object.freeze({ ...entry.coordinate }))),
    hlod: Object.freeze(interest.far.map(entry => Object.freeze({ ...entry.coordinate }))),
  } as const;
  const structureRequirementHash = canonicalSha256({
    domain: "aurion.interest-management-structure-requirements.v1",
    worldId: input.worldId,
    canonicalStateHash: input.canonicalStateHash,
    requirements,
  });
  const envelope = {
    protocol: "aurion.interest-management.v1" as const,
    interestPolicyVersion: interest.version,
    worldId: input.worldId,
    canonicalStateHash: input.canonicalStateHash,
    center: Object.freeze({ ...input.center }),
    tier: input.tier,
    simulationChunks: chunkSets.simulation,
    networkChunks: chunkSets.network,
    persistenceChunks: chunkSets.persistence,
    persistenceMode: input.persistenceMode ?? "evidence-read-only",
    presentation,
    structureRequirements: requirements,
    structureRequirementHash,
  };
  const relevanceHash = canonicalSha256({
    domain: "aurion.interest-management-relevance.v1",
    value: buildInterestManagementPlanHashInput(envelope),
  });
  return Object.freeze(
    interestManagementPlanSchema.parse({
      ...envelope,
      relevanceHash,
    }),
  );
}

export function confirmedStructureRequirementFor(
  plan: InterestManagementPlan,
  observationKey: string,
): StructureInterestRequirement | undefined {
  const match = plan.structureRequirements.find(item => item.observationKey === observationKey);
  return match
    ? Object.freeze({ ...match, chunkCoordinate: Object.freeze({ ...match.chunkCoordinate }) })
    : undefined;
}

export function interestMetrics(plan: InterestManagementPlan): Readonly<{
  simulationChunks: number;
  networkChunks: number;
  persistenceChunks: number;
  presentationChunks: number;
  structureRequirements: number;
  networkVsAllVisibleRatioBps: number;
}> {
  const network = plan.networkChunks.length;
  const presentation =
    plan.presentation.full.length +
    plan.presentation.prepared.length +
    plan.presentation.hlod.length;
  return Object.freeze({
    simulationChunks: plan.simulationChunks.length,
    networkChunks: network,
    persistenceChunks: plan.persistenceChunks.length,
    presentationChunks: presentation,
    structureRequirements: plan.structureRequirements.length,
    networkVsAllVisibleRatioBps:
      presentation === 0 ? 0 : Math.round((network * 10_000) / presentation),
  });
}
