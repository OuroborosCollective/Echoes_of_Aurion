import {
  createSpatialConstraintField,
  planDeterministic3DTraversal,
  type SpatialConstraintField,
  type SpatialTraversalMode,
  type SpatialTraversalPathCandidate,
} from "../shared/spatialConstraintFieldProtocol";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { WorldChunkCoordinate } from "../shared/worldChunkProtocol";
import { worldNatureCollision } from "./worldNatureCollision";
import {
  resolveNpcUtilityDecision,
  type NpcUtilityCandidate,
  type NpcUtilityDecision,
  type NpcUtilityPlannerContext,
} from "../shared/npcUtilityPlannerProtocol";

export type SpatialNpcCandidateRoute = Readonly<{
  candidateId: string;
  worldRevision: string;
  capabilities: readonly SpatialTraversalMode[];
  route: SpatialTraversalPathCandidate;
}>;

export type SpatialNpcDecisionResult = Readonly<{
  decision: NpcUtilityDecision;
  routePlans: ReadonlyMap<string, ReturnType<typeof planDeterministic3DTraversal>>;
}>;

/** Canonical source identity for a chunk's active nature-collision geometry. */
export function sourceStructureHashForChunk(coordinate: WorldChunkCoordinate): string {
  const obstacles = worldNatureCollision.obstaclesForChunk(coordinate)
    .map(obstacle => ({
      id: obstacle.id,
      assetId: obstacle.assetId,
      origin: obstacle.origin,
      hull: obstacle.hull,
    }))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return canonicalSha256({
    domain: "aurion.spatial-constraint.source-structure.v1",
    coordinate,
    collisionSource: "WorldNatureCollision",
    obstacles,
  });
}

/**
 * Build one deterministic chunk field over the existing Aurion collision source.
 * The field is a constraint descriptor only; it does not mutate world or entity state.
 */
export function createChunkSpatialConstraintField(input: Readonly<{
  worldRevision: string;
  navigationRevision: string;
  coordinate: WorldChunkCoordinate;
  minAltitudeQ16?: number;
  maxAltitudeQ16?: number;
  traversalCostQ16: number;
  riskQ16: number;
  allowedModes: readonly SpatialTraversalMode[];
}>): SpatialConstraintField {
  return createSpatialConstraintField({
    worldRevision: input.worldRevision,
    chunkKey: `${input.coordinate.x}:${input.coordinate.z}`,
    sourceStructureHash: sourceStructureHashForChunk(input.coordinate),
    navigationRevision: input.navigationRevision,
    ...(input.minAltitudeQ16 === undefined ? {} : { minAltitudeQ16: input.minAltitudeQ16 }),
    ...(input.maxAltitudeQ16 === undefined ? {} : { maxAltitudeQ16: input.maxAltitudeQ16 }),
    traversalCostQ16: input.traversalCostQ16,
    riskQ16: input.riskQ16,
    allowedModes: input.allowedModes,
  });
}

/**
 * Existing NPC utility selection can consume spatial feasibility as a hard constraint.
 * Utility scoring/tie-breaks remain in the canonical planner; this adapter never chooses
 * or persists a gameplay action and returns the deterministic route evidence separately.
 */
export function resolveSpatiallyConstrainedNpcUtilityDecision(
  context: NpcUtilityPlannerContext,
  routes: readonly SpatialNpcCandidateRoute[],
): SpatialNpcDecisionResult {
  const byCandidate = new Map<string, SpatialNpcCandidateRoute>();
  for (const route of routes) {
    if (byCandidate.has(route.candidateId)) throw new Error("SPATIAL_NPC_CANDIDATE_ROUTE_DUPLICATE");
    byCandidate.set(route.candidateId, route);
  }

  const gatedCandidates: NpcUtilityCandidate[] = context.candidates.map(candidate => {
    const spatial = byCandidate.get(candidate.id);
    if (!spatial) {
      return Object.freeze({
        ...candidate,
        constraintStatus: "blocked",
        constraintCode: "SPATIAL_ROUTE_REQUIRED",
      });
    }
    if (spatial.route.mode !== spatial.capabilities[0] && !spatial.capabilities.includes(spatial.route.mode)) {
      return Object.freeze({
        ...candidate,
        constraintStatus: "blocked",
        constraintCode: "SPATIAL_TRAVERSAL_MODE_BLOCKED",
      });
    }
    try {
      const plan = planDeterministic3DTraversal({
        worldRevision: spatial.worldRevision,
        capabilities: spatial.capabilities,
        candidates: [spatial.route],
      });
      if (plan.candidateId !== spatial.route.id) throw new Error("SPATIAL_ROUTE_NOT_SELECTED");
      return candidate;
    } catch {
      return Object.freeze({
        ...candidate,
        constraintStatus: "blocked",
        constraintCode: "SPATIAL_ROUTE_INFEASIBLE",
      });
    }
  });

  const decision = resolveNpcUtilityDecision(Object.freeze({
    ...context,
    candidates: Object.freeze(gatedCandidates),
  }));
  const routePlans = new Map<string, ReturnType<typeof planDeterministic3DTraversal>>();
  for (const route of routes) {
    const candidate = gatedCandidates.find(value => value.id === route.candidateId);
    if (!candidate || candidate.constraintStatus === "blocked") continue;
    routePlans.set(candidate.id, planDeterministic3DTraversal({
      worldRevision: route.worldRevision,
      capabilities: route.capabilities,
      candidates: [route.route],
    }));
  }
  return Object.freeze({ decision, routePlans });
}
