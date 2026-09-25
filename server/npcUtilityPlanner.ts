/**
 * Aurion NPC Utility Planner — deterministic, LLM-free action selection.
 *
 * Issue #486: Consolidates existing NPC needs/goal/action rules into a formal
 * Utility/Goal Planner.
 *
 * Pipeline:
 *   confirmed state → needs → candidate actions → deterministic utility score
 *   → hard constraints → stable tie-break → typed intent
 *
 * This module is a **pure, isolated rule component**. It performs no I/O, no
 * database queries, no wall-clock access, and no LLM calls. The typed intent
 * it produces feeds into the existing canonical action gateway
 * (npcActionGatewayPersistence.ts) — this planner does NOT duplicate receipts,
 * persistence, or effect readback.
 *
 * Determinism rules (Issue #468 §3):
 *  - All arithmetic is integer basis points (BPS).
 *  - No Date.now, Math.random, crypto.randomUUID, process.hrtime, performance.now.
 *  - Same inputs always produce the same outputs and hashes.
 *  - Constraints are evaluated before utility scoring.
 *  - Tie-breaking is deterministic (candidate declaration order).
 */
import {
  NPC_UTILITY_BPS_MAX,
  NPC_UTILITY_BPS_MIN,
  NPC_UTILITY_FATIGUE_INTERRUPT_BPS,
  NPC_UTILITY_GOAL_KEYS,
  NPC_UTILITY_HUNGER_INTERRUPT_BPS,
  NPC_UTILITY_MAX_CANDIDATES,
  NPC_UTILITY_NEED_KEYS,
  NPC_UTILITY_SCORE_MAX,
  NPC_UTILITY_PLANNER_VERSION,
  candidateSetHash,
  utilityDecisionHash,
  type NpcUtilityCandidate,
  type NpcUtilityDecision,
  type NpcUtilityGoalId,
  type NpcUtilityPlannerContext,
} from "../shared/npcUtilityPlannerProtocol";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertBps(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < NPC_UTILITY_BPS_MIN || value > NPC_UTILITY_BPS_MAX) {
    throw new Error(`NPC_UTILITY_${field}_INVALID`);
  }
  return value;
}

function assertSatisfaction(value: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`NPC_UTILITY_${field}_INVALID`);
  }
  return value;
}

function assertId(value: string, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`NPC_UTILITY_${field}_INVALID`);
  }
  return value;
}

function clampScore(value: number): number {
  if (value < NPC_UTILITY_BPS_MIN) return NPC_UTILITY_BPS_MIN;
  if (value > NPC_UTILITY_SCORE_MAX) return NPC_UTILITY_SCORE_MAX;
  return value;
}

// ---------------------------------------------------------------------------
// Constraint evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate hard constraints for a candidate. Returns the effective constraint
 * status and code. Constraints are checked in order; the first failure wins.
 *
 * 1. Candidate's own pre-existing constraint (from market/inventory context).
 * 2. Source receipt staleness — candidate source must match context source.
 * 3. Hunger interrupt — if hunger ≥ 7500 BPS, only "consume" is eligible.
 * 4. Fatigue interrupt — if fatigue ≥ 8500 BPS, only "rest" is eligible.
 *    Hunger takes priority over fatigue when both are above threshold.
 */
function evaluateConstraints(
  candidate: NpcUtilityCandidate,
  context: NpcUtilityPlannerContext,
): Readonly<{ status: "eligible" | "blocked"; code: string | null }> {
  // 1. Pre-existing constraint from the candidate itself.
  if (candidate.constraintStatus === "blocked") {
    return { status: "blocked", code: candidate.constraintCode ?? "PRE_EXISTING_BLOCK" };
  }

  // 2. Source receipt staleness.
  if (candidate.sourceReceiptId !== context.sourceReceiptId) {
    return { status: "blocked", code: "STALE_SOURCE_RECEIPT" };
  }

  // 3. Hunger interrupt — highest priority biological need.
  if (context.hungerBps >= NPC_UTILITY_HUNGER_INTERRUPT_BPS && candidate.action !== "consume") {
    return { status: "blocked", code: "HUNGER_INTERRUPT" };
  }

  // 4. Fatigue interrupt — second priority, only when hunger is not critical.
  if (
    context.hungerBps < NPC_UTILITY_HUNGER_INTERRUPT_BPS &&
    context.fatigueBps >= NPC_UTILITY_FATIGUE_INTERRUPT_BPS &&
    candidate.action !== "rest"
  ) {
    return { status: "blocked", code: "FATIGUE_INTERRUPT" };
  }

  return { status: "eligible", code: null };
}

// ---------------------------------------------------------------------------
// Utility scoring
// ---------------------------------------------------------------------------

/**
 * Compute the utility score for an eligible candidate using integer BPS
 * arithmetic.
 *
 *   score = needPressureBps * 2 + benefitBps - riskBps - costBps
 *         + personalityBonus + goalPersistenceBonus
 *
 * All inputs and the output are safe integers in BPS. The output is clamped
 * to [0, 40000].
 */
function scoreCandidate(
  candidate: NpcUtilityCandidate,
  context: NpcUtilityPlannerContext,
): number {
  let score =
    candidate.needPressureBps * 2 +
    candidate.benefitBps -
    candidate.riskBps -
    candidate.costBps;

  // Personality bonus for the candidate's goal.
  const personalityBonus = context.personalityBonusBps?.[candidate.goal];
  if (personalityBonus !== undefined) {
    score += assertBps(personalityBonus, "PERSONALITY_BONUS");
  }

  // Goal persistence bonus — rewards staying with the current goal.
  if (context.currentGoal !== undefined && candidate.goal === context.currentGoal) {
    const persistenceBonus = context.goalPersistenceBonusBps ?? 0;
    if (persistenceBonus !== 0) {
      score += assertBps(persistenceBonus, "GOAL_PERSISTENCE_BONUS");
    }
  }

  return clampScore(score);
}

// ---------------------------------------------------------------------------
// Stable sort comparison
// ---------------------------------------------------------------------------

/**
 * Compare two scored candidates for winner selection.
 * Primary: higher score wins (descending).
 * Secondary: earlier declaration order wins (ascending by original index).
 * This guarantees a total order with no non-deterministic tie-breaking.
 */
function compareScored(
  a: Readonly<{ index: number; score: number }>,
  b: Readonly<{ index: number; score: number }>,
): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.index - b.index;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a deterministic NPC utility decision from the given context.
 *
 * This is the sole entry point of the planner. It is a pure function:
 * no side effects, no I/O, no wall-clock, no randomness.
 *
 * @throws if the context is structurally invalid.
 */
export function resolveNpcUtilityDecision(
  context: NpcUtilityPlannerContext,
): NpcUtilityDecision {
  // --- Validate context ---

  const sourceReceiptId = assertId(context.sourceReceiptId, "SOURCE_RECEIPT_ID");
  if (!Number.isSafeInteger(context.resolutionIndex) || context.resolutionIndex < 0) {
    throw new Error("NPC_UTILITY_RESOLUTION_INDEX_INVALID");
  }

  const hungerBps = assertBps(context.hungerBps, "HUNGER_BPS");
  const fatigueBps = assertBps(context.fatigueBps, "FATIGUE_BPS");

  // Validate needs.
  const needs = {} as Record<string, number>;
  for (const key of NPC_UTILITY_NEED_KEYS) {
    needs[key] = assertSatisfaction(context.needs[key], `NEED_${key.toUpperCase()}`);
  }

  // Validate candidates.
  const candidates = context.candidates;
  if (candidates.length === 0) {
    throw new Error("NPC_UTILITY_CANDIDATES_EMPTY");
  }
  if (candidates.length > NPC_UTILITY_MAX_CANDIDATES) {
    throw new Error("NPC_UTILITY_CANDIDATES_OVERFLOW");
  }

  const seenIds = new Set<string>();
  for (const candidate of candidates) {
    assertId(candidate.id, "CANDIDATE_ID");
    if (seenIds.has(candidate.id)) throw new Error("NPC_UTILITY_CANDIDATE_DUPLICATE");
    seenIds.add(candidate.id);
    assertId(candidate.sourceReceiptId, "CANDIDATE_SOURCE_RECEIPT_ID");
    assertBps(candidate.needPressureBps, "CANDIDATE_NEED_PRESSURE");
    assertBps(candidate.benefitBps, "CANDIDATE_BENEFIT");
    assertBps(candidate.riskBps, "CANDIDATE_RISK");
    assertBps(candidate.costBps, "CANDIDATE_COST");
    if (!NPC_UTILITY_GOAL_KEYS.includes(candidate.goal)) {
      throw new Error("NPC_UTILITY_CANDIDATE_GOAL_INVALID");
    }
    if (!["consume", "rest", "produce", "trade", "caravan", "patrol", "socialize"].includes(candidate.action)) {
      throw new Error("NPC_UTILITY_CANDIDATE_ACTION_INVALID");
    }
  }

  // --- Compute candidate set hash (over ALL candidates, including blocked) ---

  const cHash = candidateSetHash(candidates);

  // --- Apply constraints, then score eligible candidates ---

  let eligibleCount = 0;
  let blockedCount = 0;
  const scored: Array<{ index: number; score: number; candidate: NpcUtilityCandidate }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const constraint = evaluateConstraints(candidate, context);

    if (constraint.status === "blocked") {
      blockedCount++;
      continue;
    }

    eligibleCount++;
    const score = scoreCandidate(candidate, context);
    scored.push({ index: i, score, candidate });
  }

  // --- Select winner with stable tie-break ---

  let winnerId: string | null = null;
  let winnerAction: NpcUtilityDecision["winnerAction"] = null;
  let winnerGoal: NpcUtilityDecision["winnerGoal"] = null;
  let winnerScoreBps = 0;

  if (scored.length > 0) {
    // Sort by score descending, then by original index ascending (stable tie-break).
    scored.sort(compareScored);
    const winner = scored[0];
    winnerId = winner.candidate.id;
    winnerAction = winner.candidate.action;
    winnerGoal = winner.candidate.goal;
    winnerScoreBps = winner.score;
  }

  // --- Build and hash the decision ---

  const decisionWithoutHash: Omit<NpcUtilityDecision, "decisionHash"> = {
    version: NPC_UTILITY_PLANNER_VERSION,
    sourceReceiptId,
    resolutionIndex: context.resolutionIndex,
    winnerId,
    winnerAction,
    winnerGoal,
    winnerScoreBps,
    candidateSetHash: cHash,
    candidateCount: candidates.length,
    eligibleCount,
    blockedCount,
  };

  const decisionHash = utilityDecisionHash(decisionWithoutHash);

  return Object.freeze({ ...decisionWithoutHash, decisionHash });
}

// ---------------------------------------------------------------------------
// Candidate factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a candidate with default constraint status "eligible".
 * Convenience helper for callers building candidate sets.
 */
export function makeCandidate(
  fields: Omit<NpcUtilityCandidate, "constraintStatus" | "constraintCode"> &
    Partial<Pick<NpcUtilityCandidate, "constraintStatus" | "constraintCode">>,
): NpcUtilityCandidate {
  return Object.freeze({
    ...fields,
    constraintStatus: fields.constraintStatus ?? "eligible",
    constraintCode: fields.constraintCode ?? null,
  });
}

/**
 * Create a blocked candidate with the given constraint code.
 */
export function blockedCandidate(
  fields: Omit<NpcUtilityCandidate, "constraintStatus" | "constraintCode">,
  code: string,
): NpcUtilityCandidate {
  return Object.freeze({
    ...fields,
    constraintStatus: "blocked",
    constraintCode: code,
  });
}

// Re-export protocol types for convenience
export {
  NPC_UTILITY_PLANNER_VERSION,
  NPC_UTILITY_NEED_KEYS,
  NPC_UTILITY_GOAL_KEYS,
  NPC_UTILITY_ACTION_KEYS,
  NPC_UTILITY_NEED_GOAL,
  NPC_UTILITY_BPS_MIN,
  NPC_UTILITY_BPS_MAX,
  NPC_UTILITY_SCORE_MAX,
  NPC_UTILITY_HUNGER_INTERRUPT_BPS,
  NPC_UTILITY_FATIGUE_INTERRUPT_BPS,
  candidateSetHash,
  utilityDecisionHash,
  type NpcUtilityCandidate,
  type NpcUtilityDecision,
  type NpcUtilityGoalId,
  type NpcUtilityNeedId,
  type NpcUtilityActionId,
  type NpcUtilityPlannerContext,
} from "../shared/npcUtilityPlannerProtocol";
