import { readConfirmedNpcState } from "./wasdAurionRuntime";
import { readConfirmedMerchantActionSource } from "./npcActionGatewayPersistence";
import { readConfirmedNpcMultiMemory } from "./npcMultiMemoryPersistence";
import { projectNpcMemoryV4 } from "./wasdNpcCapsule";
import { isConfiguredDatabaseUrl } from "./db";
import {
  executeLivingHistoryCycle,
  LIVING_HISTORY_LOOP_INTERVAL_TICKS,
  LIVING_HISTORY_HUBS,
  type LivingHistoryHubId,
  type LivingHistoryNpcEntry,
  type LivingHistoryLoopResult,
} from "./aurion/livingHistoryLoop";
import type { NpcInteractionSignal } from "./aurion/npcConcurrentLifecycleRuntime.js";
import { createNpcGuildRuntime, type NpcGuildRuntime, type NpcGuildRuntimeReadback } from "./aurion/npcGuildRuntime.js";

export const AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS = LIVING_HISTORY_LOOP_INTERVAL_TICKS;
export const AUTONOMOUS_NPC_LIFE_HOME_REGION = "observatory_threshold" as const;
export const AUTONOMOUS_NPC_LIFE_NPC_ID = `ax1_merchant_${AUTONOMOUS_NPC_LIFE_HOME_REGION}` as const;

export type AutonomousNpcLifeReadback = Readonly<{
  enabled: boolean;
  status: "disabled" | "idle" | "confirmed" | "degraded";
  npcId: typeof AUTONOMOUS_NPC_LIFE_NPC_ID;
  homeRegionId: typeof AUTONOMOUS_NPC_LIFE_HOME_REGION;
  intervalTicks: typeof AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS;
  lastGatewayTick: number | null;
  lastResolutionIndex: number | null;
  currentHubId: string | null;
  worldRegionId: string | null;
  action: string | null;
  goal: string | null;
  longTermGoal: string | null;
  decisionHash: string | null;
  lifeStateHash: string | null;
  worldReactionHash: string | null;
  actionReceiptId: string | null;
  effectReadbackHash: string | null;
  npcReceiptSource: "created" | "persisted" | null;
  worldReceiptSource: "created" | "persisted" | null;
  multiMemory: ReturnType<typeof projectNpcMemoryV4> | null;
  failureCode: string | null;
  /** Living History Loop cycle counter. */
  livingHistoryCycle: number | null;
  /** Number of NPCs that confirmed actions in the last cycle. */
  confirmedNpcCount: number | null;
  /** Total NPCs in the loop (always 4 for the four hubs). */
  totalNpcCount: number;
  /** Per-NPC lifecycle entries from the last concurrent cycle. */
  npcEntries: readonly LivingHistoryNpcEntry[];
  /** NPC-to-NPC interaction signals from the last concurrent cycle. */
  npcInteractions: readonly NpcInteractionSignal[];
  /** Deterministic hash of NPC interactions from the last cycle. */
  interactionsHash: string | null;
  /** Aggregated economic impact from the last Living History Loop cycle. */
  economicImpact: import("./aurion/economicEventAggregator.js").EconomicCycleImpact | null;
  /** NPC guild runtime readback — guilds founded, members, elections, trade policy. */
  npcGuilds: NpcGuildRuntimeReadback | null;
}>;

export type AutonomousNpcLifeRuntime = Readonly<{
  enabled: boolean;
  intervalTicks: number;
  observe(values: { tick: number }): Promise<void>;
  resolveOnce(values: { tick: number }): Promise<void>;
  readback(): AutonomousNpcLifeReadback;
  /** Read the last Living History Loop cycle result. */
  lastCycleResult(): LivingHistoryLoopResult | null;
  /** The NPC guild runtime. */
  guildRuntime: NpcGuildRuntime;
}>;

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const normalized = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.slice(0, 96) || "UNKNOWN";
}

function frozenReadback(value: AutonomousNpcLifeReadback): AutonomousNpcLifeReadback {
  return Object.freeze({ ...value });
}

/**
 * Autonomous NPC life is paced by the authoritative zone tick, not Date.now().
 * Persistence continuity is recovered from the last verified NPC receipt after restart.
 *
 * The Living History Loop (Issue #323) now orchestrates all four merchant NPCs
 * across the four hubs. Each NPC autonomously evaluates needs, selects goals,
 * forms plans, and executes actions. World signals from NPC actions feed back
 * into the next cycle, making the world dynamically reactive.
 */
export function createAutonomousNpcLifeRuntime(options: Readonly<{ enabled?: boolean }> = {}): AutonomousNpcLifeRuntime {
  const enabled = options.enabled ?? isConfiguredDatabaseUrl(process.env.DATABASE_URL);
  let lastQueuedGatewayTick = 0;
  let chain: Promise<void> = Promise.resolve();
  let cycleCount = 0;
  let lastCycle: LivingHistoryLoopResult | null = null;
  const guildRuntime = createNpcGuildRuntime({ enabled });
  let state: AutonomousNpcLifeReadback = frozenReadback({
    enabled,
    status: enabled ? "idle" : "disabled",
    npcId: AUTONOMOUS_NPC_LIFE_NPC_ID,
    homeRegionId: AUTONOMOUS_NPC_LIFE_HOME_REGION,
    intervalTicks: AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS,
    lastGatewayTick: null,
    lastResolutionIndex: null,
    currentHubId: null,
    worldRegionId: null,
    action: null,
    goal: null,
    longTermGoal: null,
    decisionHash: null,
    lifeStateHash: null,
    worldReactionHash: null,
    actionReceiptId: null,
    effectReadbackHash: null,
    npcReceiptSource: null,
    worldReceiptSource: null,
    multiMemory: null,
    failureCode: null,
    livingHistoryCycle: null,
    confirmedNpcCount: null,
    totalNpcCount: LIVING_HISTORY_HUBS.length,
    npcEntries: Object.freeze([]),
    npcInteractions: Object.freeze([]),
    interactionsHash: null,
    economicImpact: null,
    npcGuilds: null,
  });

  const resolveOnce = async ({ tick }: { tick: number }): Promise<void> => {
    if (!enabled) return;
    if (!Number.isSafeInteger(tick) || tick < 1) throw new Error("NPC_LIFE_GATEWAY_TICK_INVALID");
    try {
      cycleCount += 1;
      const cycle = cycleCount;

      // Execute the Living History Loop for all merchant NPCs.
      const loopResult = await executeLivingHistoryCycle(tick, cycle);
      lastCycle = loopResult;

      // Read back the primary NPC (observatory_threshold) for the readback state.
      const primaryNpcId = AUTONOMOUS_NPC_LIFE_NPC_ID;
      const primaryEntry = loopResult.entries.find((e) => e.npcId === primaryNpcId);

      let confirmed: Awaited<ReturnType<typeof readConfirmedNpcState>> = null;
      let action: string | null = null;
      let goal: string | null = null;
      let longTermGoal: string | null = null;
      let decisionHash: string | null = null;
      let lifeStateHash: string | null = null;
      let currentHubId: string | null = null;
      let worldRegionId: string | null = null;
      let worldReactionHash: string | null = null;
      let actionReceiptId: string | null = null;
      let effectReadbackHash: string | null = null;
      let npcReceiptSource: "created" | "persisted" | null = null;
      let worldReceiptSource: "created" | "persisted" | null = null;
      let multiMemory: ReturnType<typeof projectNpcMemoryV4> | null = null;
      let lastResolutionIndex: number | null = null;
      let status: "idle" | "confirmed" | "degraded" = "idle";
      let failure: string | null = null;

      if (primaryEntry?.status === "confirmed") {
        try {
          confirmed = await readConfirmedNpcState(primaryNpcId);
          if (confirmed && "lifeState" in confirmed) {
            action = primaryEntry.action;
            goal = confirmed.decision.goal;
            longTermGoal = confirmed.lifeState.longTermGoal;
            decisionHash = confirmed.decision.decisionHash;
            lifeStateHash = confirmed.lifeState.stateHash;
            currentHubId = confirmed.lifeState.economy?.currentHubId ?? null;
            worldRegionId = primaryEntry.hubId;
            worldReactionHash = primaryEntry.worldReactionHash;
            actionReceiptId = primaryEntry.actionReceiptId;
            effectReadbackHash = primaryEntry.effectReadbackHash;
            npcReceiptSource = primaryEntry.receiptSource;
            worldReceiptSource = primaryEntry.receiptSource;
            lastResolutionIndex = primaryEntry.resolutionIndex;

            const memory = await readConfirmedNpcMultiMemory(primaryNpcId);
            if (memory) {
              multiMemory = projectNpcMemoryV4(memory);
            }

            status = "confirmed";
          } else {
            status = "degraded";
            failure = "NPC_LIFE_RECEIPT_READBACK_REQUIRED";
          }
        } catch (readbackError) {
          status = "degraded";
          failure = failureCode(readbackError);
        }
      } else if (primaryEntry?.status === "degraded") {
        status = "degraded";
        failure = primaryEntry.failureCode;
      } else if (primaryEntry?.status === "skipped") {
        status = "idle";
        failure = primaryEntry.failureCode;
      }

      const confirmedCount = loopResult.entries.filter((e) => e.status === "confirmed").length;

      // Execute the NPC guild cycle — NPCs evaluate guild opportunities
      // (found, join, elect leader, set trade policy) based on their needs.
      const npcNeedsMap = new Map<string, Readonly<{
        safety: number; resources: number; belonging: number;
        status: number; wealth: number; power: number;
      }>>();
      const npcSources = new Map<string, Readonly<{ receiptId: string; resolutionIndex: number }>>();
      for (const hubId of LIVING_HISTORY_HUBS) {
        const npcId = `ax1_merchant_${hubId}`;
        try {
          const [npcState, source] = await Promise.all([
            readConfirmedNpcState(npcId),
            readConfirmedMerchantActionSource(npcId),
          ]);
          if (npcState && "decision" in npcState && npcState.decision?.needs) {
            npcNeedsMap.set(npcId, npcState.decision.needs);
          }
          if (source) npcSources.set(npcId, source);
        } catch { /* unavailable NPCs cannot mutate guild truth in this cycle */ }
      }
      await guildRuntime.executeCycle(cycle, npcNeedsMap, npcSources);

      state = frozenReadback({
        enabled,
        status,
        npcId: primaryNpcId,
        homeRegionId: AUTONOMOUS_NPC_LIFE_HOME_REGION,
        intervalTicks: AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS,
        lastGatewayTick: tick,
        lastResolutionIndex,
        currentHubId,
        worldRegionId,
        action,
        goal,
        longTermGoal,
        decisionHash,
        lifeStateHash,
        worldReactionHash,
        actionReceiptId,
        effectReadbackHash,
        npcReceiptSource,
        worldReceiptSource,
        multiMemory,
        failureCode: failure,
        livingHistoryCycle: cycle,
        confirmedNpcCount: confirmedCount,
        totalNpcCount: LIVING_HISTORY_HUBS.length,
        npcEntries: loopResult.entries,
        npcInteractions: loopResult.interactions,
        interactionsHash: loopResult.interactionsHash,
        economicImpact: loopResult.economicImpact,
        npcGuilds: guildRuntime.readback(),
      });
    } catch (error) {
      state = frozenReadback({
        ...state,
        enabled,
        status: "degraded",
        lastGatewayTick: tick,
        failureCode: failureCode(error),
        npcEntries: Object.freeze([]),
        npcInteractions: Object.freeze([]),
        interactionsHash: null,
        economicImpact: null,
        npcGuilds: null,
      });
      throw error;
    }
  };

  const observe = ({ tick }: { tick: number }): Promise<void> => {
    if (!enabled) return Promise.resolve();
    if (!Number.isSafeInteger(tick) || tick < 1 || tick <= lastQueuedGatewayTick) return Promise.reject(new Error("NPC_LIFE_GATEWAY_TICK_OUT_OF_ORDER"));
    if (tick % AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS !== 0) return Promise.reject(new Error("NPC_LIFE_GATEWAY_TICK_NOT_ON_CADENCE"));
    lastQueuedGatewayTick = tick;
    const run = chain.then(() => resolveOnce({ tick }));
    chain = run.catch(() => undefined);
    return run;
  };

  return Object.freeze({
    enabled,
    intervalTicks: AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS,
    observe,
    resolveOnce,
    readback: () => state,
    lastCycleResult: () => lastCycle,
    guildRuntime,
  });
}
