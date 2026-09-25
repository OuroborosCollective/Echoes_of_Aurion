/**
 * Aurion NPC Utility Planner Protocol — shared contract surface.
 *
 * Issue #486: A formal Utility/Goal Planner without LLM.
 *
 * Design rules (Issue #468 §3 Determinism):
 *  - All scores are integer basis points (BPS). No float arithmetic in the
 *    scoring path.
 *  - No wall-clock, no Math.random, no Date.now, no crypto.randomUUID.
 *  - The planner is a pure function: same inputs → same outputs, same hashes.
 *  - Candidate set hash is part of decision provenance.
 *  - Constraints are evaluated before utility scoring.
 *  - Tie-breaking is deterministic (candidate declaration order).
 *  - The planner does NOT duplicate receipt/persistence systems. It produces a
 *    typed intent that feeds into the existing canonical action gateway.
 */
import { canonicalSha256 } from "./aurionCanonicalHash";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const NPC_UTILITY_PLANNER_VERSION = "aurion-npc-utility-planner.v1" as const;

// ---------------------------------------------------------------------------
// Enumerations — aligned with the existing NPC system (wasdNpcCapsule)
// ---------------------------------------------------------------------------

export const NPC_UTILITY_NEED_KEYS = [
  "safety",
  "resources",
  "belonging",
  "status",
  "wealth",
  "power",
] as const;
export type NpcUtilityNeedId = (typeof NPC_UTILITY_NEED_KEYS)[number];

export const NPC_UTILITY_GOAL_KEYS = [
  "seek_safety",
  "gather_resources",
  "socialize",
  "gain_reputation",
  "trade",
  "expand_influence",
] as const;
export type NpcUtilityGoalId = (typeof NPC_UTILITY_GOAL_KEYS)[number];

export const NPC_UTILITY_ACTION_KEYS = [
  "consume",
  "rest",
  "produce",
  "trade",
  "caravan",
  "patrol",
  "socialize",
] as const;
export type NpcUtilityActionId = (typeof NPC_UTILITY_ACTION_KEYS)[number];

/** Need → Goal mapping, aligned with the existing `needGoal` table. */
export const NPC_UTILITY_NEED_GOAL: Readonly<
  Record<NpcUtilityNeedId, NpcUtilityGoalId>
> = Object.freeze({
  safety: "seek_safety",
  resources: "gather_resources",
  belonging: "socialize",
  status: "gain_reputation",
  wealth: "trade",
  power: "expand_influence",
});

// ---------------------------------------------------------------------------
// BPS constants
// ---------------------------------------------------------------------------

export const NPC_UTILITY_BPS_MIN = 0;
export const NPC_UTILITY_BPS_MAX = 10_000;
export const NPC_UTILITY_SCORE_MAX = 40_000;

/** Interrupt thresholds — aligned with existing resolveLivingWorldTick. */
export const NPC_UTILITY_HUNGER_INTERRUPT_BPS = 7_500;
export const NPC_UTILITY_FATIGUE_INTERRUPT_BPS = 8_500;

/** Maximum number of candidates per decision. */
export const NPC_UTILITY_MAX_CANDIDATES = 32;

// ---------------------------------------------------------------------------
// Candidate — a proposed action with its utility factors
// ---------------------------------------------------------------------------

export type NpcUtilityCandidate = Readonly<{
  /** Stable unique identifier within this decision. */
  id: string;
  /** The action to perform if this candidate wins. */
  action: NpcUtilityActionId;
  /** The strategic goal this candidate serves. */
  goal: NpcUtilityGoalId;
  /** Pressure from the associated need, 0–10000 (10000 − satisfactionBps). */
  needPressureBps: number;
  /** Expected benefit, 0–10000. */
  benefitBps: number;
  /** Expected risk, 0–10000. */
  riskBps: number;
  /** Resource cost, 0–10000. */
  costBps: number;
  /** Provenance receipt — must match the context source receipt. */
  sourceReceiptId: string;
  /** Pre-existing constraint from the context (market, inventory, etc.). */
  constraintStatus: "eligible" | "blocked";
  /** Null if eligible, error code if blocked. */
  constraintCode: string | null;
}>;

// ---------------------------------------------------------------------------
// Context — the input to the planner
// ---------------------------------------------------------------------------

export type NpcUtilityPlannerContext = Readonly<{
  /** The confirmed source decision receipt that authorizes this planning step. */
  sourceReceiptId: string;
  /** Monotonically increasing resolution index (tick-aligned). */
  resolutionIndex: number;
  /** NPC need satisfaction levels, 0–1 per need. */
  needs: Readonly<Record<NpcUtilityNeedId, number>>;
  /** NPC hunger in BPS, 0–10000. */
  hungerBps: number;
  /** NPC fatigue in BPS, 0–10000. */
  fatigueBps: number;
  /** Candidate actions to evaluate. */
  candidates: readonly NpcUtilityCandidate[];
  /** Optional per-goal personality bonus in BPS. */
  personalityBonusBps?: Readonly<Partial<Record<NpcUtilityGoalId, number>>>;
  /** The NPC's current goal, for persistence bonus. */
  currentGoal?: NpcUtilityGoalId;
  /** BPS bonus added to the candidate matching `currentGoal`. */
  goalPersistenceBonusBps?: number;
}>;

// ---------------------------------------------------------------------------
// Decision — the output of the planner
// ---------------------------------------------------------------------------

export type NpcUtilityDecision = Readonly<{
  version: typeof NPC_UTILITY_PLANNER_VERSION;
  sourceReceiptId: string;
  resolutionIndex: number;
  /** Winning candidate id, or null if all candidates are blocked. */
  winnerId: string | null;
  /** Winning action, or null. */
  winnerAction: NpcUtilityActionId | null;
  /** Winning goal, or null. */
  winnerGoal: NpcUtilityGoalId | null;
  /** Winning utility score in BPS, 0–40000. */
  winnerScoreBps: number;
  /** SHA-256 over the full candidate set (all candidates, including blocked). */
  candidateSetHash: string;
  /** SHA-256 over the full decision. */
  decisionHash: string;
  /** Total number of candidates evaluated. */
  candidateCount: number;
  /** Number of candidates that passed all constraints. */
  eligibleCount: number;
  /** Number of candidates blocked by any constraint. */
  blockedCount: number;
}>;

// ---------------------------------------------------------------------------
// Hash functions
// ---------------------------------------------------------------------------

/**
 * Stable hash over the full candidate set. Candidates are sorted by
 * (sourceReceiptId, id) before hashing so that input order does not affect
 * the hash.
 */
export function candidateSetHash(
  candidates: readonly NpcUtilityCandidate[],
): string {
  const sorted = [...candidates].sort(
    (a, b) =>
      a.sourceReceiptId < b.sourceReceiptId
        ? -1
        : a.sourceReceiptId > b.sourceReceiptId
          ? 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
  );
  return canonicalSha256({
    domain: "aurion.npc-utility-planner.candidate-set.v1",
    candidates: sorted.map((c) => ({
      id: c.id,
      action: c.action,
      goal: c.goal,
      needPressureBps: c.needPressureBps,
      benefitBps: c.benefitBps,
      riskBps: c.riskBps,
      costBps: c.costBps,
      sourceReceiptId: c.sourceReceiptId,
      constraintStatus: c.constraintStatus,
      constraintCode: c.constraintCode,
    })),
  });
}

/** Stable hash over the full decision record. */
export function utilityDecisionHash(
  decision: Omit<NpcUtilityDecision, "decisionHash">,
): string {
  return canonicalSha256({
    domain: "aurion.npc-utility-planner.decision.v1",
    version: decision.version,
    sourceReceiptId: decision.sourceReceiptId,
    resolutionIndex: decision.resolutionIndex,
    winnerId: decision.winnerId,
    winnerAction: decision.winnerAction,
    winnerGoal: decision.winnerGoal,
    winnerScoreBps: decision.winnerScoreBps,
    candidateSetHash: decision.candidateSetHash,
    candidateCount: decision.candidateCount,
    eligibleCount: decision.eligibleCount,
    blockedCount: decision.blockedCount,
  });
}
