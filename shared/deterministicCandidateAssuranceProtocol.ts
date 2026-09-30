import {
  canonicalJson,
  canonicalSha256,
  domainSha256,
} from "./aurionCanonicalHash";

export const DETERMINISTIC_CANDIDATE_ASSURANCE_VERSION =
  "aurion.deterministic-candidate-assurance.v1" as const;
export const MAX_CANDIDATES = 64;
export const MAX_SEARCH_ROUNDS = 16;
export const STAGNATION_LIMIT = 4;
export const SCORE_BPS_MIN = 0;
export const SCORE_BPS_MAX = 10_000;

const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIMENSIONS = ["fidelity", "alignment", "compliance"] as const;

export type CandidateAssuranceDimension = (typeof DIMENSIONS)[number];
export type CandidateAssuranceObservationStatus =
  | "MATCH"
  | "DEGRADED"
  | "UNVERIFIED"
  | "CONTRADICTED";
export type CandidateAssuranceStatus =
  | "VERIFIED"
  | "DEGRADED"
  | "UNVERIFIED"
  | "CONTRADICTED"
  | "UNPROVABLE";
export type SearchStopReason = "STAGNATION" | "ROUND_LIMIT";

export type DeterministicSearchCandidate = Readonly<{
  candidateId: string;
  sourceReceiptId: string;
  sourceReceiptHash: string;
  inputHash: string;
  outputHash: string;
  parameterHash: string;
  tieBreakKey: string;
  scoreBps: number;
}>;

export type CandidateSearchInput = Readonly<{
  sourceRevision: string;
  rulesetVersion: string;
  decisionKey: string;
  candidates: readonly DeterministicSearchCandidate[];
  maxRounds?: number;
  stagnationLimit?: number;
}>;

export type CandidateSearchRound = Readonly<{
  round: number;
  orderedCandidateIds: readonly string[];
  winnerId: string;
  winnerScoreBps: number;
  improved: boolean;
  diversificationHash: string;
}>;

export type CandidateSearchResult = Readonly<{
  protocol: typeof DETERMINISTIC_CANDIDATE_ASSURANCE_VERSION;
  sourceRevision: string;
  rulesetVersion: string;
  decisionKey: string;
  candidateSetHash: string;
  rounds: readonly CandidateSearchRound[];
  selectedCandidateId: string;
  selectedScoreBps: number;
  stopReason: SearchStopReason;
  searchHash: string;
  mutationAuthority: "none";
}>;

export type CandidateAssuranceObservation = Readonly<{
  dimension: CandidateAssuranceDimension;
  status: CandidateAssuranceObservationStatus;
  sourceRevision: string;
  receiptHash: string | null;
  replayHash: string | null;
  readbackHash: string | null;
  summary: string;
}>;

export type CandidateAssurance = Readonly<{
  protocol: typeof DETERMINISTIC_CANDIDATE_ASSURANCE_VERSION;
  sourceRevision: string;
  candidateSetHash: string;
  searchHash: string;
  selectedCandidateId: string;
  observations: readonly CandidateAssuranceObservation[];
  status: CandidateAssuranceStatus;
  mutationAuthority: "none";
  assuranceHash: string;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function assertId(value: string, code: string): void {
  if (typeof value !== "string" || !ID.test(value)) fail(code);
}

function assertHash(value: string, code: string): void {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
}

function assertRevision(value: string, code: string): void {
  if (typeof value !== "string" || !REVISION.test(value)) fail(code);
}

function assertScore(value: number, code: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < SCORE_BPS_MIN ||
    value > SCORE_BPS_MAX
  )
    fail(code);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function validateCandidate(
  candidate: DeterministicSearchCandidate
): DeterministicSearchCandidate {
  assertId(candidate.candidateId, "CANDIDATE_ID_INVALID");
  assertId(candidate.sourceReceiptId, "CANDIDATE_SOURCE_RECEIPT_ID_INVALID");
  assertHash(
    candidate.sourceReceiptHash,
    "CANDIDATE_SOURCE_RECEIPT_HASH_INVALID"
  );
  assertHash(candidate.inputHash, "CANDIDATE_INPUT_HASH_INVALID");
  assertHash(candidate.outputHash, "CANDIDATE_OUTPUT_HASH_INVALID");
  assertHash(candidate.parameterHash, "CANDIDATE_PARAMETER_HASH_INVALID");
  assertId(candidate.tieBreakKey, "CANDIDATE_TIE_BREAK_KEY_INVALID");
  assertScore(candidate.scoreBps, "CANDIDATE_SCORE_INVALID");
  return freeze({ ...candidate });
}

function candidateOrder(
  left: DeterministicSearchCandidate,
  right: DeterministicSearchCandidate
): number {
  return (
    compare(left.tieBreakKey, right.tieBreakKey) ||
    compare(left.candidateId, right.candidateId)
  );
}

function winnerOrder(
  left: DeterministicSearchCandidate,
  right: DeterministicSearchCandidate
): number {
  return right.scoreBps - left.scoreBps || candidateOrder(left, right);
}

function validateInput(input: CandidateSearchInput): {
  sourceRevision: string;
  rulesetVersion: string;
  decisionKey: string;
  candidates: readonly DeterministicSearchCandidate[];
  maxRounds: number;
  stagnationLimit: number;
} {
  assertRevision(input.sourceRevision, "CANDIDATE_SOURCE_REVISION_INVALID");
  assertId(input.rulesetVersion, "CANDIDATE_RULESET_VERSION_INVALID");
  assertId(input.decisionKey, "CANDIDATE_DECISION_KEY_INVALID");
  if (
    !Array.isArray(input.candidates) ||
    input.candidates.length === 0 ||
    input.candidates.length > MAX_CANDIDATES
  )
    fail("CANDIDATE_SET_BOUND_INVALID");
  const candidates = input.candidates
    .map(validateCandidate)
    .sort((left, right) => compare(left.candidateId, right.candidateId));
  if (
    new Set(candidates.map(candidate => candidate.candidateId)).size !==
    candidates.length
  )
    fail("CANDIDATE_ID_DUPLICATE");
  if (
    new Set(candidates.map(candidate => candidate.sourceReceiptId)).size !==
    candidates.length
  )
    fail("CANDIDATE_RECEIPT_DUPLICATE");
  const maxRounds = input.maxRounds ?? MAX_SEARCH_ROUNDS;
  const stagnationLimit = input.stagnationLimit ?? STAGNATION_LIMIT;
  if (
    !Number.isSafeInteger(maxRounds) ||
    maxRounds < 1 ||
    maxRounds > MAX_SEARCH_ROUNDS
  )
    fail("CANDIDATE_ROUND_BOUND_INVALID");
  if (
    !Number.isSafeInteger(stagnationLimit) ||
    stagnationLimit < 1 ||
    stagnationLimit > maxRounds
  )
    fail("CANDIDATE_STAGNATION_BOUND_INVALID");
  return {
    sourceRevision: input.sourceRevision,
    rulesetVersion: input.rulesetVersion,
    decisionKey: input.decisionKey,
    candidates,
    maxRounds,
    stagnationLimit,
  };
}

function candidateSetHash(
  input: Pick<
    CandidateSearchInput,
    "sourceRevision" | "rulesetVersion" | "decisionKey"
  > & { candidates: readonly DeterministicSearchCandidate[] }
): string {
  return domainSha256("aurion.deterministic-candidate-set.v1", [
    input.sourceRevision,
    input.rulesetVersion,
    input.decisionKey,
    input.candidates.map(candidate => ({ ...candidate })),
  ]);
}

function diversificationOrder(
  candidates: readonly DeterministicSearchCandidate[],
  decisionKey: string,
  round: number
): DeterministicSearchCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      compare(
        domainSha256("aurion.deterministic-candidate-diversification.v1", [
          decisionKey,
          round,
          left.candidateId,
        ]),
        domainSha256("aurion.deterministic-candidate-diversification.v1", [
          decisionKey,
          round,
          right.candidateId,
        ])
      ) || candidateOrder(left, right)
  );
}

export function optimizeDeterministicCandidates(
  input: CandidateSearchInput
): CandidateSearchResult {
  const normalized = validateInput(input);
  const setHash = candidateSetHash(normalized);
  const canonicalWinner = [...normalized.candidates].sort(winnerOrder)[0]!;
  const rounds: CandidateSearchRound[] = [];
  let previousWinner: DeterministicSearchCandidate | null = null;
  let stagnation = 0;
  for (let round = 0; round < normalized.maxRounds; round += 1) {
    const ordered = diversificationOrder(
      normalized.candidates,
      normalized.decisionKey,
      round
    );
    const winner = [...ordered].sort(winnerOrder)[0]!;
    const improved =
      previousWinner === null ||
      winner.scoreBps > previousWinner.scoreBps ||
      (winner.scoreBps === previousWinner.scoreBps &&
        winner.candidateId !== previousWinner.candidateId &&
        candidateOrder(winner, previousWinner) < 0);
    stagnation = improved ? 0 : stagnation + 1;
    rounds.push(
      freeze({
        round,
        orderedCandidateIds: freeze(
          ordered.map(candidate => candidate.candidateId)
        ),
        winnerId: winner.candidateId,
        winnerScoreBps: winner.scoreBps,
        improved,
        diversificationHash: domainSha256(
          "aurion.deterministic-candidate-round.v1",
          [setHash, round, ordered.map(candidate => candidate.candidateId)]
        ),
      })
    );
    previousWinner = winner;
    if (stagnation >= normalized.stagnationLimit) break;
  }
  const stopReason: SearchStopReason =
    stagnation >= normalized.stagnationLimit ? "STAGNATION" : "ROUND_LIMIT";
  const unsigned = {
    protocol: DETERMINISTIC_CANDIDATE_ASSURANCE_VERSION,
    sourceRevision: normalized.sourceRevision,
    rulesetVersion: normalized.rulesetVersion,
    decisionKey: normalized.decisionKey,
    candidateSetHash: setHash,
    rounds: freeze(rounds),
    selectedCandidateId: canonicalWinner.candidateId,
    selectedScoreBps: canonicalWinner.scoreBps,
    stopReason,
    mutationAuthority: "none" as const,
  };
  return freeze({ ...unsigned, searchHash: canonicalSha256(unsigned) });
}

export function replayDeterministicCandidates(
  input: CandidateSearchInput,
  expected: CandidateSearchResult
): boolean {
  try {
    const actual = optimizeDeterministicCandidates(input);
    return (
      actual.searchHash === expected.searchHash &&
      canonicalJson(actual) === canonicalJson(expected)
    );
  } catch {
    return false;
  }
}

function observationStatus(
  observations: readonly CandidateAssuranceObservation[]
): CandidateAssuranceStatus {
  if (observations.some(observation => observation.status === "CONTRADICTED"))
    return "CONTRADICTED";
  if (
    observations.some(
      observation =>
        observation.receiptHash === null ||
        observation.replayHash === null ||
        observation.readbackHash === null
    )
  )
    return "UNPROVABLE";
  if (observations.some(observation => observation.status === "UNVERIFIED"))
    return "UNVERIFIED";
  if (observations.some(observation => observation.status === "DEGRADED"))
    return "DEGRADED";
  return "VERIFIED";
}

export function assessDeterministicCandidate(input: {
  search: CandidateSearchResult;
  observations: readonly CandidateAssuranceObservation[];
}): CandidateAssurance {
  const search = input.search;
  assertRevision(search.sourceRevision, "ASSURANCE_SOURCE_REVISION_INVALID");
  assertHash(search.candidateSetHash, "ASSURANCE_CANDIDATE_SET_HASH_INVALID");
  assertHash(search.searchHash, "ASSURANCE_SEARCH_HASH_INVALID");
  assertId(search.selectedCandidateId, "ASSURANCE_SELECTED_CANDIDATE_INVALID");
  if (input.observations.length !== DIMENSIONS.length)
    fail("ASSURANCE_DIMENSION_SET_INCOMPLETE");
  const byDimension = new Map(
    input.observations.map(observation => [observation.dimension, observation])
  );
  if (
    byDimension.size !== DIMENSIONS.length ||
    DIMENSIONS.some(dimension => !byDimension.has(dimension))
  )
    fail("ASSURANCE_DIMENSION_SET_INVALID");
  const observations = freeze(
    DIMENSIONS.map(dimension => {
      const observation = byDimension.get(dimension)!;
      if (
        !["MATCH", "DEGRADED", "UNVERIFIED", "CONTRADICTED"].includes(
          observation.status
        )
      )
        fail(`ASSURANCE_STATUS_INVALID:${dimension}`);
      if (observation.sourceRevision !== search.sourceRevision)
        fail(`ASSURANCE_REVISION_MISMATCH:${dimension}`);
      if (!observation.summary.match(/^[A-Z0-9_:-]{3,160}$/))
        fail(`ASSURANCE_SUMMARY_INVALID:${dimension}`);
      for (const hash of [
        observation.receiptHash,
        observation.replayHash,
        observation.readbackHash,
      ])
        if (hash !== null)
          assertHash(hash, `ASSURANCE_EVIDENCE_HASH_INVALID:${dimension}`);
      if (
        observation.status === "MATCH" &&
        (observation.receiptHash === null ||
          observation.replayHash === null ||
          observation.readbackHash === null)
      )
        fail(`ASSURANCE_EVIDENCE_INCOMPLETE:${dimension}`);
      return freeze({ ...observation });
    })
  );
  const status = observationStatus(observations);
  const unsigned = {
    protocol: DETERMINISTIC_CANDIDATE_ASSURANCE_VERSION,
    sourceRevision: search.sourceRevision,
    candidateSetHash: search.candidateSetHash,
    searchHash: search.searchHash,
    selectedCandidateId: search.selectedCandidateId,
    observations,
    status,
    mutationAuthority: "none" as const,
  };
  return freeze({ ...unsigned, assuranceHash: canonicalSha256(unsigned) });
}

export function verifyDeterministicCandidateAssurance(
  value: CandidateAssurance
): boolean {
  try {
    const rebuilt = assessDeterministicCandidate({
      search: {
        protocol: value.protocol,
        sourceRevision: value.sourceRevision,
        rulesetVersion: "verification",
        decisionKey: "verification",
        candidateSetHash: value.candidateSetHash,
        rounds: [],
        selectedCandidateId: value.selectedCandidateId,
        selectedScoreBps: 0,
        stopReason: "ROUND_LIMIT",
        searchHash: value.searchHash,
        mutationAuthority: "none",
      },
      observations: value.observations,
    });
    return (
      rebuilt.assuranceHash === value.assuranceHash &&
      canonicalJson(rebuilt) === canonicalJson(value)
    );
  } catch {
    return false;
  }
}
