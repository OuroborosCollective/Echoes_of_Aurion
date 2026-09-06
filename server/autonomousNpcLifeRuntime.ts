import { GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import { resolveAndRecordAx1LivingWorld } from "./ax1LivingWorldRuntime";
import { readConfirmedNpcState } from "./wasdAurionRuntime";

export const AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS = 600;
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
  action: string | null;
  goal: string | null;
  longTermGoal: string | null;
  decisionHash: string | null;
  lifeStateHash: string | null;
  worldReactionHash: string | null;
  npcReceiptSource: "created" | "persisted" | null;
  worldReceiptSource: "created" | "persisted" | null;
  failureCode: string | null;
}>;

export type AutonomousNpcLifeRuntime = Readonly<{
  enabled: boolean;
  intervalTicks: number;
  observe(values: { tick: number }): Promise<void>;
  resolveOnce(values: { tick: number }): Promise<void>;
  readback(): AutonomousNpcLifeReadback;
}>;

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const normalized = message.toUpperCase().replace(/[^A-Z0-9_]+/g,"_").replace(/^_+|_+$/g,"");
  return normalized.slice(0,96) || "UNKNOWN";
}

function frozenReadback(value: AutonomousNpcLifeReadback): AutonomousNpcLifeReadback {
  return Object.freeze({ ...value });
}

/**
 * Autonomous NPC life is paced by the authoritative zone tick, not Date.now().
 * Persistence continuity is recovered from the last verified NPC receipt after restart.
 * Only one confirmed merchant is activated in this first production slice because the
 * authoritative websocket currently exposes one live zone (`observatory_threshold`).
 */
export function createAutonomousNpcLifeRuntime(options: Readonly<{ enabled?: boolean }> = {}): AutonomousNpcLifeRuntime {
  const enabled = options.enabled ?? Boolean(process.env.DATABASE_URL);
  let lastQueuedGatewayTick = 0;
  let chain: Promise<void> = Promise.resolve();
  let state: AutonomousNpcLifeReadback = frozenReadback({
    enabled,
    status: enabled ? "idle" : "disabled",
    npcId: AUTONOMOUS_NPC_LIFE_NPC_ID,
    homeRegionId: AUTONOMOUS_NPC_LIFE_HOME_REGION,
    intervalTicks: AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS,
    lastGatewayTick: null,
    lastResolutionIndex: null,
    currentHubId: null,
    action: null,
    goal: null,
    longTermGoal: null,
    decisionHash: null,
    lifeStateHash: null,
    worldReactionHash: null,
    npcReceiptSource: null,
    worldReceiptSource: null,
    failureCode: null,
  });

  const resolveOnce = async ({ tick }: { tick: number }): Promise<void> => {
    if (!enabled) return;
    if (!Number.isSafeInteger(tick) || tick < 1) throw new Error("NPC_LIFE_GATEWAY_TICK_INVALID");
    try {
      const prior = await readConfirmedNpcState(AUTONOMOUS_NPC_LIFE_NPC_ID);
      const resolutionIndex = (prior?.decision.resolutionIndex ?? -1) + 1;
      const result = await resolveAndRecordAx1LivingWorld({
        worldSeed: GLOBAL_WORLD_SEED,
        resolutionIndex,
        regionId: AUTONOMOUS_NPC_LIFE_HOME_REGION,
      });
      if (!("lifeState" in result.npc)) throw new Error("NPC_LIFE_V3_RECEIPT_REQUIRED");
      const confirmed = await readConfirmedNpcState(AUTONOMOUS_NPC_LIFE_NPC_ID);
      if (!confirmed || !("lifeState" in confirmed)) throw new Error("NPC_LIFE_RECEIPT_READBACK_REQUIRED");
      if (confirmed.decision.resolutionIndex !== resolutionIndex || confirmed.decision.decisionHash !== result.npc.decision.decisionHash) throw new Error("NPC_LIFE_RECEIPT_READBACK_MISMATCH");
      if (confirmed.lifeState.stateHash !== result.npc.lifeState.stateHash || confirmed.lifeState.currentGoal !== confirmed.decision.goal) throw new Error("NPC_LIFE_STATE_READBACK_MISMATCH");
      const currentHubId = confirmed.lifeState.economy?.currentHubId;
      if (!currentHubId || currentHubId !== result.resolution.npc.currentHubId) throw new Error("NPC_LIFE_ECONOMY_READBACK_MISMATCH");
      state = frozenReadback({
        enabled,
        status: "confirmed",
        npcId: AUTONOMOUS_NPC_LIFE_NPC_ID,
        homeRegionId: AUTONOMOUS_NPC_LIFE_HOME_REGION,
        intervalTicks: AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS,
        lastGatewayTick: tick,
        lastResolutionIndex: resolutionIndex,
        currentHubId,
        action: result.resolution.action,
        goal: confirmed.decision.goal,
        longTermGoal: confirmed.lifeState.longTermGoal,
        decisionHash: confirmed.decision.decisionHash,
        lifeStateHash: confirmed.lifeState.stateHash,
        worldReactionHash: result.world.reaction.deterministicHash,
        npcReceiptSource: result.npc.source,
        worldReceiptSource: result.world.source,
        failureCode: null,
      });
    } catch (error) {
      state = frozenReadback({ ...state, enabled, status: "degraded", lastGatewayTick: tick, failureCode: failureCode(error) });
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
  });
}
