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

export const AURION_NPC_COORDINATION_RESEARCH_LAW: CoordinationLaw = Object.freeze({
  lawId: "aurion-npc-coordination-research-region-patrol.v1",
  lawVersion: 1,
  scope: "region",
  allowedActionPairs: [],
  disallowedActionPairs: [["patrol", "patrol"]],
  tieBreakVersion: 1,
} as const);

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

/**
 * Returns the hash inputs needed to attach coordination evidence to an existing
 * gateway receipt without creating a new persistence/effect authority.
 */
/**
 * Canonically orders actors, then lets the existing utility planner select each
 * actor's action after the coordination law has filtered conflicts with already
 * admitted reservations. The law never selects, mutates, persists, or emits a
 * gateway receipt.
 */
export function resolveNpcUtilityDecisionsWithCoordination(
  entries: readonly CoordinatedNpcUtilityEntry[],
  law: CoordinationLaw = AURION_NPC_COORDINATION_RESEARCH_LAW,
): readonly CoordinatedNpcUtilityResult[] {
  const ordered = [...entries].sort((a, b) => a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0);
  const seen = new Set<string>();
  const reservations: CoordinationReservation[] = [];
  const results: CoordinatedNpcUtilityResult[] = [];

  for (const entry of ordered) {
    if (seen.has(entry.actorId)) throw new Error("NPC_COORDINATION_ACTOR_DUPLICATE");
    seen.add(entry.actorId);
    const result = resolveNpcUtilityWithCoordination(entry, law, reservations);
    results.push(result);
    if (result.decision.winnerId !== null && result.decision.winnerAction !== null) {
      reservations.push(Object.freeze({
        actorId: entry.actorId,
        action: result.decision.winnerAction,
        scopeKey: entry.scopeKey,
        sourceReceiptId: entry.context.sourceReceiptId,
        resolutionIndex: entry.context.resolutionIndex,
        candidateId: result.decision.winnerId,
        utilityScoreBps: result.decision.winnerScoreBps,
      }));
    }
  }

  return Object.freeze(results);
}

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
