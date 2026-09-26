import { canonicalSha256 } from "./aurionCanonicalHash";
import type { NpcUtilityActionId } from "./npcUtilityPlannerProtocol";

export const NPC_COORDINATION_LAW_VERSION = "aurion-npc-coordination-law.v1" as const;
export const NPC_COORDINATION_MAX_CANDIDATES = 128;
export const NPC_COORDINATION_MAX_RESERVATIONS = 128;

export type CoordinationScope = "chunk" | "region" | "settlement";

export type CoordinationLaw = Readonly<{
  lawId: string;
  lawVersion: number;
  scope: CoordinationScope;
  allowedActionPairs: readonly (readonly [NpcUtilityActionId, NpcUtilityActionId])[];
  disallowedActionPairs: readonly (readonly [NpcUtilityActionId, NpcUtilityActionId])[];
  tieBreakVersion: number;
}>;

export type CoordinationCandidate = Readonly<{
  actorId: string;
  candidateId: string;
  action: NpcUtilityActionId;
  scopeKey: string;
  sourceReceiptId: string;
  resolutionIndex: number;
  utilityScoreBps: number;
}>;

export type CoordinationReservation = Readonly<{
  actorId: string;
  action: NpcUtilityActionId;
  scopeKey: string;
  sourceReceiptId: string;
  resolutionIndex: number;
  candidateId?: string;
  utilityScoreBps?: number;
}>;

export type CoordinationConflict = Readonly<{
  candidate: CoordinationCandidate;
  reservation: CoordinationReservation;
  pair: readonly [NpcUtilityActionId, NpcUtilityActionId];
  code: "DISALLOWED_ACTION_PAIR";
}>;

export type CoordinationFilterResult = Readonly<{
  status: "unchanged" | "filtered" | "coordination_blocked";
  lawHash: string;
  candidateSetHash: string;
  filteredSetHash: string;
  accepted: readonly CoordinationCandidate[];
  blocked: readonly CoordinationCandidate[];
  conflicts: readonly CoordinationConflict[];
  reservationsHash: string;
}>;

export type CoordinationUtilityFloorCertificate = Readonly<{
  alphaBps: number;
  passed: boolean;
  violations: readonly Readonly<{
    actorId: string;
    unconstrainedBestBps: number;
    constrainedBestBps: number | null;
  }>[];
}>;

function text(value: unknown, field: string, max = 128): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new Error(`NPC_COORDINATION_${field}_INVALID`);
  }
  return value;
}

function index(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`NPC_COORDINATION_${field}_INVALID`);
  }
  return value as number;
}

function score(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 40_000) {
    throw new Error("NPC_COORDINATION_UTILITY_SCORE_INVALID");
  }
  return value as number;
}

function pairKey(left: NpcUtilityActionId, right: NpcUtilityActionId): string {
  return left < right ? `${left}\u001f${right}` : `${right}\u001f${left}`;
}

function normalizePairs(
  pairs: readonly (readonly [NpcUtilityActionId, NpcUtilityActionId])[],
): readonly (readonly [NpcUtilityActionId, NpcUtilityActionId])[] {
  const normalized = pairs.map(pair => {
    if (pair.length !== 2) throw new Error("NPC_COORDINATION_ACTION_PAIR_INVALID");
    const [left, right] = pair;
    const key = pairKey(left, right);
    const [first, second] = left < right ? [left, right] : [right, left];
    return Object.freeze([first, second] as const);
  }).sort((a, b) => pairKey(a[0], a[1]).localeCompare(pairKey(b[0], b[1])));
  const seen = new Set<string>();
  for (const pair of normalized) {
    const key = pairKey(pair[0], pair[1]);
    if (seen.has(key)) throw new Error("NPC_COORDINATION_ACTION_PAIR_DUPLICATE");
    seen.add(key);
  }
  return Object.freeze(normalized);
}

function validateLaw(law: CoordinationLaw): CoordinationLaw {
  text(law.lawId, "LAW_ID");
  if (!Number.isSafeInteger(law.lawVersion) || law.lawVersion < 1) throw new Error("NPC_COORDINATION_LAW_VERSION_INVALID");
  if (!["chunk", "region", "settlement"].includes(law.scope)) throw new Error("NPC_COORDINATION_SCOPE_INVALID");
  if (!Number.isSafeInteger(law.tieBreakVersion) || law.tieBreakVersion < 1) throw new Error("NPC_COORDINATION_TIE_BREAK_VERSION_INVALID");
  normalizePairs(law.allowedActionPairs);
  normalizePairs(law.disallowedActionPairs);
  const allowed = new Set(law.allowedActionPairs.map(pair => pairKey(pair[0], pair[1])));
  for (const pair of law.disallowedActionPairs) {
    if (allowed.has(pairKey(pair[0], pair[1]))) throw new Error("NPC_COORDINATION_LAW_PAIR_CONFLICT");
  }
  return Object.freeze({
    lawId: law.lawId,
    lawVersion: law.lawVersion,
    scope: law.scope,
    allowedActionPairs: normalizePairs(law.allowedActionPairs),
    disallowedActionPairs: normalizePairs(law.disallowedActionPairs),
    tieBreakVersion: law.tieBreakVersion,
  });
}

export function coordinationLawHash(law: CoordinationLaw): string {
  const normalized = validateLaw(law);
  return canonicalSha256({
    domain: NPC_COORDINATION_LAW_VERSION,
    lawId: normalized.lawId,
    lawVersion: normalized.lawVersion,
    scope: normalized.scope,
    allowedActionPairs: normalized.allowedActionPairs,
    disallowedActionPairs: normalized.disallowedActionPairs,
    tieBreakVersion: normalized.tieBreakVersion,
  });
}

function validateCandidate(candidate: CoordinationCandidate): CoordinationCandidate {
  text(candidate.actorId, "ACTOR_ID");
  text(candidate.candidateId, "CANDIDATE_ID");
  text(candidate.action, "ACTION", 32);
  text(candidate.scopeKey, "SCOPE_KEY", 256);
  text(candidate.sourceReceiptId, "SOURCE_RECEIPT_ID");
  index(candidate.resolutionIndex, "RESOLUTION_INDEX");
  score(candidate.utilityScoreBps);
  return Object.freeze(candidate);
}

function validateReservation(reservation: CoordinationReservation): CoordinationReservation {
  text(reservation.actorId, "RESERVATION_ACTOR_ID");
  text(reservation.action, "RESERVATION_ACTION", 32);
  text(reservation.scopeKey, "RESERVATION_SCOPE_KEY", 256);
  text(reservation.sourceReceiptId, "RESERVATION_SOURCE_RECEIPT_ID");
  index(reservation.resolutionIndex, "RESERVATION_RESOLUTION_INDEX");
  if (reservation.candidateId !== undefined) text(reservation.candidateId, "RESERVATION_CANDIDATE_ID");
  if (reservation.utilityScoreBps !== undefined) score(reservation.utilityScoreBps);
  return Object.freeze(reservation);
}

function canonicalCandidates(candidates: readonly CoordinationCandidate[]): readonly CoordinationCandidate[] {
  const normalized = candidates.map(validateCandidate).sort((a, b) =>
    a.actorId.localeCompare(b.actorId)
    || a.scopeKey.localeCompare(b.scopeKey)
    || a.candidateId.localeCompare(b.candidateId)
    || a.action.localeCompare(b.action)
  );
  if (normalized.length > NPC_COORDINATION_MAX_CANDIDATES) throw new Error("NPC_COORDINATION_CANDIDATES_OVERFLOW");
  const seen = new Set<string>();
  for (const candidate of normalized) {
    const key = `${candidate.actorId}\u001f${candidate.candidateId}`;
    if (seen.has(key)) throw new Error("NPC_COORDINATION_CANDIDATE_DUPLICATE");
    seen.add(key);
  }
  return Object.freeze(normalized);
}

function canonicalReservations(reservations: readonly CoordinationReservation[]): readonly CoordinationReservation[] {
  const normalized = reservations.map(validateReservation).sort((a, b) =>
    a.actorId.localeCompare(b.actorId)
    || a.scopeKey.localeCompare(b.scopeKey)
    || a.action.localeCompare(b.action)
    || (a.candidateId ?? "").localeCompare(b.candidateId ?? "")
  );
  if (normalized.length > NPC_COORDINATION_MAX_RESERVATIONS) throw new Error("NPC_COORDINATION_RESERVATIONS_OVERFLOW");
  return Object.freeze(normalized);
}

export function coordinationCandidateSetHash(candidates: readonly CoordinationCandidate[]): string {
  return canonicalSha256({
    domain: `${NPC_COORDINATION_LAW_VERSION}:candidate-set`,
    candidates: canonicalCandidates(candidates),
  });
}

export function coordinationReservationsHash(reservations: readonly CoordinationReservation[]): string {
  return canonicalSha256({
    domain: `${NPC_COORDINATION_LAW_VERSION}:reservations`,
    reservations: canonicalReservations(reservations),
  });
}

function pairAllowed(action: NpcUtilityActionId, other: NpcUtilityActionId, law: CoordinationLaw): boolean {
  const key = pairKey(action, other);
  const disallowed = new Set(law.disallowedActionPairs.map(pair => pairKey(pair[0], pair[1])));
  if (disallowed.has(key)) return false;
  if (law.allowedActionPairs.length === 0) return true;
  return law.allowedActionPairs.some(pair => pairKey(pair[0], pair[1]) === key);
}

export function filterCoordinationCandidates(
  candidates: readonly CoordinationCandidate[],
  law: CoordinationLaw,
  reservations: readonly CoordinationReservation[] = [],
): CoordinationFilterResult {
  const normalizedLaw = validateLaw(law);
  const normalizedCandidates = canonicalCandidates(candidates);
  const normalizedReservations = canonicalReservations(reservations);
  const lawHash = coordinationLawHash(normalizedLaw);
  const conflicts: CoordinationConflict[] = [];
  const accepted: CoordinationCandidate[] = [];
  const blocked: CoordinationCandidate[] = [];

  for (const candidate of normalizedCandidates) {
    const reservation = normalizedReservations.find(item =>
      item.actorId !== candidate.actorId
      && item.scopeKey === candidate.scopeKey
      && !pairAllowed(candidate.action, item.action, normalizedLaw)
    );
    if (!reservation) {
      accepted.push(candidate);
      continue;
    }
    const pair: readonly [NpcUtilityActionId, NpcUtilityActionId] =
      candidate.action < reservation.action
        ? [candidate.action, reservation.action]
        : [reservation.action, candidate.action];
    conflicts.push(Object.freeze({ candidate, reservation, pair, code: "DISALLOWED_ACTION_PAIR" }));
    blocked.push(candidate);
  }

  const status =
    blocked.length === 0
      ? "unchanged"
      : accepted.length === 0
        ? "coordination_blocked"
        : "filtered";

  return Object.freeze({
    status,
    lawHash,
    candidateSetHash: coordinationCandidateSetHash(normalizedCandidates),
    filteredSetHash: coordinationCandidateSetHash(accepted),
    accepted: Object.freeze(accepted),
    blocked: Object.freeze(blocked),
    conflicts: Object.freeze(conflicts.sort((a, b) =>
      a.candidate.actorId.localeCompare(b.candidate.actorId)
      || a.candidate.candidateId.localeCompare(b.candidate.candidateId)
      || a.reservation.actorId.localeCompare(b.reservation.actorId)
    )),
    reservationsHash: coordinationReservationsHash(normalizedReservations),
  });
}

export function coordinationUtilityFloorCertificate(
  unconstrained: readonly CoordinationCandidate[],
  constrained: readonly CoordinationCandidate[],
  alphaBps: number,
): CoordinationUtilityFloorCertificate {
  if (!Number.isSafeInteger(alphaBps) || alphaBps < 0 || alphaBps > 10_000) {
    throw new Error("NPC_COORDINATION_ALPHA_INVALID");
  }
  const base = canonicalCandidates(unconstrained);
  const after = canonicalCandidates(constrained);
  const actors = [...new Set(base.map(candidate => candidate.actorId))].sort();
  const violations: Array<{
    actorId: string;
    unconstrainedBestBps: number;
    constrainedBestBps: number | null;
  }> = [];

  for (const actorId of actors) {
    const unconstrainedBest = Math.max(...base.filter(c => c.actorId === actorId).map(c => c.utilityScoreBps));
    const constrainedForActor = after.filter(c => c.actorId === actorId);
    const constrainedBest = constrainedForActor.length
      ? Math.max(...constrainedForActor.map(c => c.utilityScoreBps))
      : null;
    if (constrainedBest === null || constrainedBest * 10_000 < unconstrainedBest * alphaBps) {
      violations.push(Object.freeze({ actorId, unconstrainedBestBps: unconstrainedBest, constrainedBestBps: constrainedBest }));
    }
  }

  return Object.freeze({
    alphaBps,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

export type {
  NpcUtilityActionId,
};
