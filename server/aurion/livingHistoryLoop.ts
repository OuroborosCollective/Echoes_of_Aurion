/**
 * Living History Loop (Issue #323) — Aurion-native orchestration.
 *
 * Connects NPC autonomous decisions to dynamic world reactions in a structured
 * feedback cycle:
 *
 *   1. OBSERVE  — Read current NPC states and accumulated world signals
 *   2. DECIDE   — Each NPC evaluates needs → selects goal → forms plan
 *   3. ACT      — Execute the planned action via the merchant action gateway
 *   4. REACT    — Aggregate world signals from all NPC actions → resolve
 *                 a world reaction → derive need events for the next cycle
 *   5. RECORD   — Persist effects, trigger civilization loop, feed back
 *
 * The loop runs for all merchant NPCs across the four hubs on each cadence
 * tick. World signals from one NPC's action (economy shifts, political
 * instability, caravan ambushes) become environmental pressures that shape
 * the next NPC's needs and decisions.
 */

import { createHash } from "node:crypto";
import { resolveAndRecordAx1LivingWorld } from "../ax1LivingWorldRuntime";
import { readConfirmedMerchantActionSource } from "../npcActionGatewayPersistence";
import { readConfirmedNpcState } from "../wasdAurionRuntime";
import { readConfirmedNpcMultiMemory } from "../npcMultiMemoryPersistence";
import { projectNpcMemoryV4 } from "../wasdNpcCapsule";
import { GLOBAL_WORLD_SEED, GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { orchestrateCivilizationLoop } from "./civilizationService";
import type { WorldSignal, WorldReaction } from "../wasdAurionProtocol";

export const LIVING_HISTORY_LOOP_VERSION = "aurion-living-history-loop.v1" as const;
export const LIVING_HISTORY_LOOP_INTERVAL_TICKS = 600;

export type LivingHistoryHubId =
  | "observatory_threshold"
  | "windhollow"
  | "emberfall"
  | "cinder_vault";

export const LIVING_HISTORY_HUBS: readonly LivingHistoryHubId[] = [
  "observatory_threshold",
  "windhollow",
  "emberfall",
  "cinder_vault",
] as const;

export type LivingHistoryLoopPhase =
  | "observe"
  | "decide"
  | "act"
  | "react"
  | "record";

export type LivingHistoryNpcEntry = Readonly<{
  hubId: LivingHistoryHubId;
  npcId: string;
  status: "idle" | "confirmed" | "degraded" | "skipped";
  action: string | null;
  goal: string | null;
  longTermGoal: string | null;
  resolutionIndex: number | null;
  decisionHash: string | null;
  worldReactionHash: string | null;
  actionReceiptId: string | null;
  failureCode: string | null;
}>;

export type LivingHistoryLoopResult = Readonly<{
  version: typeof LIVING_HISTORY_LOOP_VERSION;
  cycle: number;
  tick: number;
  entries: readonly LivingHistoryNpcEntry[];
  aggregatedSignalsCount: number;
  worldReactionHash: string | null;
  civilizationAction: string | null;
  failureCode: string | null;
}>;

/** Pending world signals accumulated from NPC actions, waiting for the REACT phase. */
type PendingSignal = Readonly<{
  signal: WorldSignal;
  sourceNpcId: string;
  sourceHubId: LivingHistoryHubId;
}>;

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const normalized = message
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 96) || "UNKNOWN";
}

function npcIdForHub(hubId: LivingHistoryHubId): string {
  return `ax1_merchant_${hubId}`;
}

/**
 * Derive need events from a world reaction so NPC needs shift in response to
 * environmental changes. This is the feedback mechanism that makes the world
 * dynamic: a storm signal lowers safety, a hazard lowers resources, an
 * economy signal shifts wealth, etc.
 */
export function deriveNeedEventsFromWorldReaction(
  reaction: WorldReaction,
  sourceReceiptId: string,
  resolutionIndex: number,
): ReadonlyArray<Readonly<{
  id: string;
  need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
  delta: number;
  sourceReceiptId: string;
  resolutionIndex: number;
}>> {
  const events: Array<Readonly<{
    id: string;
    need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
    delta: number;
    sourceReceiptId: string;
    resolutionIndex: number;
  }>> = [];

  const prefix = `whl:${reaction.id}`;

  // Weather tone affects safety and resources.
  if (reaction.weatherTone === "storm") {
    events.push({ id: `${prefix}:safety`, need: "safety", delta: -0.08, sourceReceiptId, resolutionIndex });
    events.push({ id: `${prefix}:resources`, need: "resources", delta: -0.05, sourceReceiptId, resolutionIndex });
  } else if (reaction.weatherTone === "ashfall") {
    events.push({ id: `${prefix}:resources`, need: "resources", delta: -0.1, sourceReceiptId, resolutionIndex });
  } else if (reaction.weatherTone === "rain") {
    events.push({ id: `${prefix}:resources`, need: "resources", delta: 0.03, sourceReceiptId, resolutionIndex });
  }

  // Threat delta affects safety.
  if (reaction.threatDelta !== 0) {
    events.push({
      id: `${prefix}:threat`,
      need: "safety",
      delta: Math.max(-0.15, Math.min(0.1, -reaction.threatDelta / 100)),
      sourceReceiptId,
      resolutionIndex,
    });
  }

  // Resource delta affects resources need.
  if (reaction.resourceDelta !== 0) {
    events.push({
      id: `${prefix}:rdelta`,
      need: "resources",
      delta: Math.max(-0.1, Math.min(0.1, reaction.resourceDelta / 100)),
      sourceReceiptId,
      resolutionIndex,
    });
  }

  // NPC need deltas from the reaction (if present).
  if (reaction.npcNeedDeltas) {
    for (const [need, delta] of Object.entries(reaction.npcNeedDeltas)) {
      if (typeof delta === "number" && delta !== 0) {
        events.push({
          id: `${prefix}:${need}`,
          need: need as "safety" | "resources" | "belonging" | "status" | "wealth" | "power",
          delta: Math.max(-0.2, Math.min(0.2, delta)),
          sourceReceiptId,
          resolutionIndex,
        });
      }
    }
  }

  return Object.freeze(events);
}

/**
 * Execute one full Living History Loop cycle for all merchant NPCs.
 *
 * The cycle processes NPCs in canonical hub order. Each NPC acts based on its
 * current state; the action produces world signals. After all NPCs have
 * acted, the aggregated signals are hashed to form the world reaction
 * fingerprint for this cycle. The civilization loop is triggered with the
 * final receipt.
 *
 * Returns a structured result describing what happened for each NPC.
 */
export async function executeLivingHistoryCycle(
  tick: number,
  cycle: number,
): Promise<LivingHistoryLoopResult> {
  if (!Number.isSafeInteger(tick) || tick < 1) throw new Error("LIVING_HISTORY_TICK_INVALID");
  if (!Number.isSafeInteger(cycle) || cycle < 0) throw new Error("LIVING_HISTORY_CYCLE_INVALID");

  const entries: LivingHistoryNpcEntry[] = [];
  const pendingSignals: PendingSignal[] = [];
  let civilizationAction: string | null = null;
  let lastReceiptId: string | null = null;

  for (const hubId of LIVING_HISTORY_HUBS) {
    const npcId = npcIdForHub(hubId);
    try {
      const source = await readConfirmedMerchantActionSource(npcId);
      if (!source) {
        entries.push(Object.freeze({
          hubId,
          npcId,
          status: "skipped",
          action: null,
          goal: null,
          longTermGoal: null,
          resolutionIndex: null,
          decisionHash: null,
          worldReactionHash: null,
          actionReceiptId: null,
          failureCode: "NPC_ACTION_SOURCE_DECISION_REQUIRED",
        }));
        continue;
      }

      const result = await resolveAndRecordAx1LivingWorld({
        worldSeed: GLOBAL_WORLD_SEED,
        sourceDecisionReceiptId: source.receiptId,
        regionId: hubId,
      });

      const resolutionIndex = source.resolutionIndex + 1;
      const confirmed = await readConfirmedNpcState(npcId);

      let action: string | null = null;
      let goal: string | null = null;
      let longTermGoal: string | null = null;
      let decisionHash: string | null = null;
      let worldReactionHash: string | null = null;

      if (confirmed && "lifeState" in confirmed) {
        action = result.resolution.action;
        goal = confirmed.decision.goal;
        longTermGoal = confirmed.lifeState.longTermGoal;
        decisionHash = confirmed.decision.decisionHash;
        worldReactionHash = result.world.deterministicHash;
      }

      // Collect world signals from this NPC's action.
      const economySignal: WorldSignal = {
        id: `whl:${cycle}:${hubId}:economy`,
        kind: "economy",
        regionId: hubId,
        magnitude: result.resolution.stabilityDelta / 100,
        sourceReceiptId: result.actionReceiptId,
        resolutionIndex,
      };
      pendingSignals.push({ signal: economySignal, sourceNpcId: npcId, sourceHubId: hubId });

      // Caravan ambush generates a hazard signal.
      if (result.resolution.caravan.ambushed) {
        const hazardSignal: WorldSignal = {
          id: `whl:${cycle}:${hubId}:hazard`,
          kind: "hazard",
          regionId: hubId,
          magnitude: 0.5,
          sourceReceiptId: result.actionReceiptId,
          resolutionIndex,
        };
        pendingSignals.push({ signal: hazardSignal, sourceNpcId: npcId, sourceHubId: hubId });
      }

      // Political instability from negative stability delta.
      if (result.resolution.stabilityDelta < 0) {
        const politicsSignal: WorldSignal = {
          id: `whl:${cycle}:${hubId}:politics`,
          kind: "politics",
          regionId: hubId,
          magnitude: result.resolution.stabilityDelta / 50,
          sourceReceiptId: result.actionReceiptId,
          resolutionIndex,
        };
        pendingSignals.push({ signal: politicsSignal, sourceNpcId: npcId, sourceHubId: hubId });
      }

      lastReceiptId = result.actionReceiptId;

      entries.push(Object.freeze({
        hubId,
        npcId,
        status: "confirmed",
        action,
        goal,
        longTermGoal,
        resolutionIndex,
        decisionHash,
        worldReactionHash,
        actionReceiptId: result.actionReceiptId,
        failureCode: null,
      }));
    } catch (error) {
      entries.push(Object.freeze({
        hubId,
        npcId,
        status: "degraded",
        action: null,
        goal: null,
        longTermGoal: null,
        resolutionIndex: null,
        decisionHash: null,
        worldReactionHash: null,
        actionReceiptId: null,
        failureCode: failureCode(error),
      }));
    }
  }

  // REACT phase: hash the aggregated world signals for this cycle.
  const signalsHash = createHash("sha256")
    .update(pendingSignals.map((s) => s.signal.id).sort().join("\u001f"))
    .digest("hex");

  // RECORD phase: trigger civilization loop with the last action receipt.
  if (lastReceiptId) {
    try {
      const civResult = await orchestrateCivilizationLoop(
        GLOBAL_WORLD_ID,
        cycle,
        lastReceiptId,
      );
      civilizationAction = civResult?.action ?? null;
    } catch (error) {
      console.warn("[LivingHistoryLoop] Civilization orchestration failed:", error);
    }
  }

  return Object.freeze({
    version: LIVING_HISTORY_LOOP_VERSION,
    cycle,
    tick,
    entries: Object.freeze(entries),
    aggregatedSignalsCount: pendingSignals.length,
    worldReactionHash: signalsHash,
    civilizationAction,
    failureCode: null,
  });
}
