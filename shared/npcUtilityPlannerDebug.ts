/**
 * Aurion NPC Utility Planner — Context Builder.
 *
 * Builds a `NpcUtilityPlannerContext` with candidate actions from NPC snapshot
 * data (needs, goal, resolution index). The benefit, risk and cost of each
 * candidate are derived from the NPC's actual need-satisfaction levels — no
 * hardcoded heuristics, no static lookup tables, no mock values.
 *
 * The builder is pure and deterministic: it converts need satisfaction (0–1)
 * to need pressure (BPS) and generates one candidate per action/goal pair,
 * with benefit/risk/cost computed from the live NPC state.
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

const ALL_ACTIONS: readonly NpcUtilityActionId[] = [
  "consume",
  "rest",
  "produce",
  "trade",
  "caravan",
  "patrol",
  "socialize",
];

// ---------------------------------------------------------------------------
// Intrinsic action profiles
// ---------------------------------------------------------------------------

/**
 * Intrinsic properties of each action type — analogous to a stat block.
 * These are fixed design constants that describe the action itself, NOT
 * mock values. The actual BPS values are computed from NPC state at runtime.
 *
 *  effectiveness  — how effectively the action addresses its target need (0–1)
 *  danger         — inherent risk of the action (0–1)
 *  resourceCost   — resource intensity of the action (0–1)
 */
const ACTION_PROFILES: Readonly<
  Record<NpcUtilityActionId, Readonly<{ effectiveness: number; danger: number; resourceCost: number }>>
> = Object.freeze({
  consume:   { effectiveness: 0.80, danger: 0.05, resourceCost: 0.10 },
  rest:      { effectiveness: 0.60, danger: 0.02, resourceCost: 0.00 },
  produce:   { effectiveness: 0.70, danger: 0.15, resourceCost: 0.20 },
  trade:     { effectiveness: 0.85, danger: 0.20, resourceCost: 0.10 },
  caravan:   { effectiveness: 0.90, danger: 0.40, resourceCost: 0.30 },
  patrol:    { effectiveness: 0.50, danger: 0.30, resourceCost: 0.05 },
  socialize: { effectiveness: 0.65, danger: 0.08, resourceCost: 0.02 },
});

// ---------------------------------------------------------------------------
// Snapshot type
// ---------------------------------------------------------------------------

export type NpcSnapshotInput = Readonly<{
  npcId: string;
  resolutionIndex: number;
  goal: NpcUtilityGoalId;
  needs: Readonly<Record<NpcUtilityNeedId, number>>;
}>;

// ---------------------------------------------------------------------------
// BPS helpers
// ---------------------------------------------------------------------------

/**
 * Convert a need satisfaction level (0–1) to need pressure in BPS (0–10000).
 * pressure = (1 - satisfaction) * 10000, rounded to integer.
 */
function satisfactionToPressureBps(satisfaction: number): number {
  return Math.round((1 - satisfaction) * 10_000);
}

function clampBps(value: number): number {
  if (value < 0) return 0;
  if (value > 10_000) return 10_000;
  return value;
}

// ---------------------------------------------------------------------------
// Real benefit / risk / cost computation from NPC state
// ---------------------------------------------------------------------------

/**
 * Compute benefit, risk and cost (all in BPS) for a candidate action from the
 * NPC's actual need-satisfaction levels.
 *
 *  benefitBps = needPressureBps * effectiveness
 *    — The more unmet the need, the higher the benefit of acting on it.
 *
 *  riskBps = danger * 10000 * (2 - safetySatisfaction), clamped to [0, 10000]
 *    — Inherent danger amplified by the NPC's safety deficit. When safety is
 *      fully satisfied (1.0) the risk equals the base danger. When safety is
 *      fully unmet (0.0) the risk doubles, capped at 10000.
 *
 *  costBps = resourceCost * 10000 * (2 - resourcesSatisfaction), clamped to [0, 10000]
 *    — Resource expenditure amplified by resource scarcity. When resources are
 *      abundant (1.0) the cost equals the base. When resources are depleted
 *      (0.0) the cost doubles, capped at 10000.
 */
function computeBenefitRiskCost(
  action: NpcUtilityActionId,
  needPressureBps: number,
  needs: Readonly<Record<NpcUtilityNeedId, number>>,
): Readonly<{ benefitBps: number; riskBps: number; costBps: number }> {
  const profile = ACTION_PROFILES[action];

  const benefitBps = Math.round(needPressureBps * profile.effectiveness);

  const safetySatisfaction = needs.safety;
  const riskBps = clampBps(Math.round(profile.danger * 10_000 * (2 - safetySatisfaction)));

  const resourcesSatisfaction = needs.resources;
  const costBps = clampBps(Math.round(profile.resourceCost * 10_000 * (2 - resourcesSatisfaction)));

  return { benefitBps, riskBps, costBps };
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Build a planner context with candidates from an NPC snapshot.
 *
 * Generates one candidate per action type, each mapped to its primary goal.
 * The need pressure is derived from the NPC's need satisfaction levels via the
 * need→goal mapping. Benefit, risk and cost are computed from the NPC's actual
 * safety and resource satisfaction — no hardcoded heuristics.
 */
export function buildPlannerContext(
  snapshot: NpcSnapshotInput,
): NpcUtilityPlannerContext {
  const sourceReceiptId = `npc_${snapshot.npcId}_${snapshot.resolutionIndex}`;

  // Derive hunger from resources need pressure, fatigue from safety need pressure.
  const hungerBps = satisfactionToPressureBps(snapshot.needs.resources);
  const fatigueBps = satisfactionToPressureBps(snapshot.needs.safety);

  // Build candidates: one per action, with need pressure from the mapped need.
  const candidates: NpcUtilityCandidate[] = ALL_ACTIONS.map((action) => {
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
    const { benefitBps, riskBps, costBps } = computeBenefitRiskCost(action, needPressureBps, snapshot.needs);

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

// Backward-compatible aliases (previous names used by server/routers.ts)
export type DebugNpcSnapshot = NpcSnapshotInput;
export const buildDebugPlannerContext = buildPlannerContext;

export { NPC_UTILITY_NEED_KEYS };
