/**
 * Aurion NPC Utility Planner — Debug Context Builder.
 *
 * Builds a `NpcUtilityPlannerContext` with candidate actions from NPC snapshot
 * data (needs, goal, resolution index). This is used by the debug view to
 * show how the planner scores each decision option in real time.
 *
 * The builder is pure and deterministic: it converts need satisfaction (0–1)
 * to need pressure (BPS) and generates one candidate per action/goal pair.
 *
 * Determinism rules:
 *  - No Date.now, Math.random, crypto.randomUUID, process.hrtime, performance.now.
 *  - All values are integer basis points.
 */
import {
  NPC_UTILITY_NEED_GOAL,
  NPC_UTILITY_NEED_KEYS,
  type NpcUtilityActionId,
  type NpcUtilityCandidate,
  type NpcUtilityGoalId,
  type NpcUtilityNeedId,
  type NpcUtilityPlannerContext,
} from "./npcUtilityPlannerProtocol";
import { makeCandidate } from "../server/npcUtilityPlanner";

// ---------------------------------------------------------------------------
// Action → Goal mapping for candidate generation
// ---------------------------------------------------------------------------

/** Each action maps to the goal it primarily serves. */
const ACTION_GOAL_MAP: Readonly<Record<NpcUtilityActionId, NpcUtilityGoalId>> = Object.freeze({
  consume: "gather_resources",
  rest: "seek_safety",
  produce: "gather_resources",
  trade: "trade",
  caravan: "expand_influence",
  patrol: "seek_safety",
  socialize: "socialize",
});

const DEBUG_ACTIONS: readonly NpcUtilityActionId[] = [
  "consume",
  "rest",
  "produce",
  "trade",
  "caravan",
  "patrol",
  "socialize",
];

// ---------------------------------------------------------------------------
// Debug context builder
// ---------------------------------------------------------------------------

export type DebugNpcSnapshot = Readonly<{
  npcId: string;
  resolutionIndex: number;
  goal: NpcUtilityGoalId;
  needs: Readonly<Record<NpcUtilityNeedId, number>>;
}>;

/**
 * Convert a need satisfaction level (0–1) to need pressure in BPS (0–10000).
 * pressure = (1 - satisfaction) * 10000, rounded to integer.
 */
function satisfactionToPressureBps(satisfaction: number): number {
  return Math.round((1 - satisfaction) * 10_000);
}

/**
 * Derive a plausible benefit/risk/cost profile for a debug candidate based on
 * the action type. These are static heuristics for the debug view only — they
 * do NOT replace the real candidate generation that the runtime will produce.
 */
function debugBenefitRiskCost(
  action: NpcUtilityActionId,
): Readonly<{ benefitBps: number; riskBps: number; costBps: number }> {
  switch (action) {
    case "consume":
      return { benefitBps: 6000, riskBps: 500, costBps: 1000 };
    case "rest":
      return { benefitBps: 4000, riskBps: 200, costBps: 0 };
    case "produce":
      return { benefitBps: 5000, riskBps: 1500, costBps: 2000 };
    case "trade":
      return { benefitBps: 7000, riskBps: 2000, costBps: 1000 };
    case "caravan":
      return { benefitBps: 8000, riskBps: 4000, costBps: 3000 };
    case "patrol":
      return { benefitBps: 3000, riskBps: 3000, costBps: 500 };
    case "socialize":
      return { benefitBps: 4500, riskBps: 800, costBps: 200 };
  }
}

/**
 * Build a planner context with debug candidates from an NPC snapshot.
 *
 * Generates one candidate per action type, each mapped to its primary goal.
 * The need pressure is derived from the NPC's need satisfaction levels via the
 * need→goal mapping. Hunger and fatigue are derived from the resources and
 * safety need pressures respectively (higher pressure = more urgent).
 */
export function buildDebugPlannerContext(
  snapshot: DebugNpcSnapshot,
): NpcUtilityPlannerContext {
  const sourceReceiptId = `debug_${snapshot.npcId}_${snapshot.resolutionIndex}`;

  // Derive hunger from resources need pressure, fatigue from safety need pressure.
  const hungerBps = satisfactionToPressureBps(snapshot.needs.resources);
  const fatigueBps = satisfactionToPressureBps(snapshot.needs.safety);

  // Build candidates: one per action, with need pressure from the mapped need.
  const candidates: NpcUtilityCandidate[] = DEBUG_ACTIONS.map((action) => {
    const goal = ACTION_GOAL_MAP[action];

    // Find the need that maps to this goal.
    let needKey: NpcUtilityNeedId = "resources";
    for (const [nk, gk] of Object.entries(NPC_UTILITY_NEED_GOAL)) {
      if (gk === goal) {
        needKey = nk as NpcUtilityNeedId;
        break;
      }
    }

    const needPressureBps = satisfactionToPressureBps(snapshot.needs[needKey]);
    const { benefitBps, riskBps, costBps } = debugBenefitRiskCost(action);

    return makeCandidate({
      id: `${action}`,
      action,
      goal,
      needPressureBps,
      benefitBps,
      riskBps,
      costBps,
      sourceReceiptId,
    });
  });

  return Object.freeze({
    sourceReceiptId,
    resolutionIndex: snapshot.resolutionIndex,
    needs: snapshot.needs,
    hungerBps,
    fatigueBps,
    candidates: Object.freeze(candidates),
    currentGoal: snapshot.goal,
    goalPersistenceBonusBps: 1500,
  });
}

export { NPC_UTILITY_NEED_KEYS };
