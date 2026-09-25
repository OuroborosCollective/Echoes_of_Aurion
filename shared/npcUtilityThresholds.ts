/**
 * Aurion NPC Utility — critical thresholds for stability monitoring.
 *
 * These constants define the BPS boundaries at which an NPC's utility state
 * is considered critically unstable. They are used by the spatial heatmap
 * and the debug score cards to visually flag NPCs that cross these
 * thresholds, so simulation operators can spot degraded or overloaded
 * states at a glance.
 *
 * Determinism rules:
 *  - All values are integer basis points.
 *  - No wall-clock, no randomness — pure constants.
 */

/** Score range (mirrors npcUtilityPlannerProtocol). */
export const NPC_UTILITY_SCORE_MAX = 40_000;

/**
 * Below this winner score (BPS), the NPC is in a critical/degraded state.
 * The NPC barely has a viable action — its needs are largely satisfied or
 * all high-utility candidates are blocked, leaving it in an unstable idle.
 */
export const NPC_UTILITY_CRITICAL_LOW_BPS = 5_000;

/**
 * Above this winner score (BPS), the NPC is in a hyper-critical/overloaded
 * state. The urgency is so extreme that a single action dominates all
 * alternatives — this can indicate a cascading need crisis or a stuck loop.
 */
export const NPC_UTILITY_CRITICAL_HIGH_BPS = 30_000;

/**
 * Need pressure (BPS) at or above which an NPC's surrounding area is
 * considered a "hot zone" — highly attractive for utility goals.
 */
export const NPC_UTILITY_HOT_ZONE_PRESSURE_BPS = 7_000;

/**
 * Classify a winner score against the critical thresholds.
 *
 * Returns "critical_low", "critical_high", or "stable".
 */
export function classifyUtilityScore(
  winnerScoreBps: number,
): "critical_low" | "critical_high" | "stable" {
  if (winnerScoreBps <= NPC_UTILITY_CRITICAL_LOW_BPS) return "critical_low";
  if (winnerScoreBps >= NPC_UTILITY_CRITICAL_HIGH_BPS) return "critical_high";
  return "stable";
}
