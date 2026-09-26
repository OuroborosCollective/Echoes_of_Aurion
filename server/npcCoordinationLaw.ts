import {
  coordinationCandidateSetHash,
  coordinationLawHash,
  coordinationReservationsHash,
  filterCoordinationCandidates,
  type CoordinationCandidate,
  type CoordinationLaw,
  type CoordinationReservation,
  type CoordinationFilterResult,
} from "../shared/npcCoordinationLawProtocol";
import {
  resolveNpcUtilityDecision,
  resolveNpcUtilityScores,
  type NpcUtilityCandidate,
  type NpcUtilityDecision,
  type NpcUtilityPlannerContext,
  type NpcUtilityScoredCandidate,
} from "./npcUtilityPlanner";

export type CoordinatedNpcUtilityEntry = Readonly<{
  actorId: string;
  scopeKey: string;
  context: NpcUtilityPlannerContext;
}>;

export type CoordinatedNpcUtilityResult = Readonly<{
  actorId: string;
  scopeKey: string;
  lawHash: string;
  decision: NpcUtilityDecision;
  scored: readonly NpcUtilityScoredCandidate[];
  coordination: CoordinationFilterResult;
}>;

function asCoordinationCandidate(
  actorId: string,
  scopeKey: string,
  candidate: NpcUtilityScoredCandidate,
  sourceReceiptId: string,
  resolutionIndex: number,
): CoordinationCandidate {
  return Object.freeze({
    actorId,
    candidateId: candidate.id,
    action: candidate.action,
    scopeKey,
    sourceReceiptId,
    resolutionIndex,
    utilityScoreBps: candidate.scoreBps,
  });
}

function blockCandidate(candidate: NpcUtilityCandidate, code: string): NpcUtilityCandidate {
  return Object.freeze({
    ...candidate,
    constraintStatus: "blocked",
    constraintCode: candidate.constraintStatus === "blocked"
      ? candidate.constraintCode
      : code,
  });
}

/**
 * Applies only the coordination constraint. The existing Aurion utility planner
 * remains responsible for scoring and deterministic winner selection.
 *
 * No database, gateway, network, wall-clock or legacy donor imports are allowed
 * in this layer.
 */
export function resolveNpcUtilityWithCoordination(
  entry: CoordinatedNpcUtilityEntry,
  law: CoordinationLaw,
  reservations: readonly CoordinationReservation[] = [],
): CoordinatedNpcUtilityResult {
  const scored = resolveNpcUtilityScores(entry.context);
  const candidates = scored.map(candidate =>
    asCoordinationCandidate(
      entry.actorId,
      entry.scopeKey,
      candidate,
      entry.context.sourceReceiptId,
      entry.context.resolutionIndex,
    ),
  );
  const coordination = filterCoordinationCandidates(candidates, law, reservations);
  const blockedIds = new Set(coordination.blocked.map(candidate => candidate.candidateId));
  const constrainedCandidates = entry.context.candidates.map(candidate =>
    blockedIds.has(candidate.id)
      ? blockCandidate(candidate, "COORDINATION_BLOCKED")
      : candidate,
  );
  const decision = resolveNpcUtilityDecision({
    ...entry.context,
    candidates: Object.freeze(constrainedCandidates),
  });
  const constrainedScored = resolveNpcUtilityScores({
    ...entry.context,
    candidates: Object.freeze(constrainedCandidates),
  });

  return Object.freeze({
    actorId: entry.actorId,
    scopeKey: entry.scopeKey,
    lawHash: coordination.lawHash,
    decision,
    scored: constrainedScored,
    coordination,
  });
}

export function coordinationEvidenceFingerprint(
  result: CoordinatedNpcUtilityResult,
): string {
  return coordinationLawHash({
    lawId: "evidence-fingerprint",
    lawVersion: 1,
    scope: "region",
    allowedActionPairs: [],
    disallowedActionPairs: [],
    tieBreakVersion: 1,
  }) && coordinationCandidateSetHash([
    ...result.coordination.accepted,
    ...result.coordination.blocked,
  ]);
}

/**
 * Returns the hash inputs needed to attach coordination evidence to an existing
 * gateway receipt without creating a new persistence/effect authority.
 */
export function coordinationReadbackMetadata(
  result: CoordinatedNpcUtilityResult,
): Readonly<{
  lawHash: string;
  candidateSetHash: string;
  filteredSetHash: string;
  reservationsHash: string;
  decisionHash: string;
}> {
  return Object.freeze({
    lawHash: result.coordination.lawHash,
    candidateSetHash: result.coordination.candidateSetHash,
    filteredSetHash: result.coordination.filteredSetHash,
    reservationsHash: result.coordination.reservationsHash,
    decisionHash: result.decision.decisionHash,
  });
}

export {
  coordinationCandidateSetHash,
  coordinationLawHash,
  coordinationReservationsHash,
};
