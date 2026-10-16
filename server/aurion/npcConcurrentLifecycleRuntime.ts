/**
 * Concurrent NPC Lifecycle Runtime — Aurion-native.
 *
 * Manages multiple NPC lifecycle agents that run **simultaneously**, each with
 * its own independent needs, goals, plans, and action execution. NPCs interact
 * through shared world signals: one NPC's patrol improves safety for others in
 * the same hub, one NPC's trade shifts market prices that another observes,
 * and caravans create cross-hub economic pressures.
 *
 * Architecture:
 *   - Each NPC is an independent lifecycle agent with its own state.
 *   - All agents execute their OBSERVE → DECIDE → ACT phases concurrently
 *     via Promise.allSettled — no NPC waits for another to finish.
 *   - After all agents have acted, the REACT phase aggregates their world
 *     signals and derives interaction effects between NPCs in the same hub.
 *   - The aggregated signals feed back into the next cycle, making the world
 *     dynamically reactive to the collective behaviour of all NPCs.
 */

import { createHash } from "node:crypto";
import type { LivingHistoryHubId } from "./livingHistoryLoop.js";

export const CONCURRENT_NPC_RUNTIME_VERSION = "aurion-concurrent-npc-runtime.v1" as const;

export type NpcLifecyclePhase = "observe" | "decide" | "act" | "interact" | "record";

export type NpcLifecycleStatus = "idle" | "active" | "confirmed" | "degraded" | "skipped";

/** Per-NPC lifecycle state — each NPC tracks its own lifecycle independently. */
export type NpcLifecycleState = Readonly<{
  npcId: string;
  hubId: LivingHistoryHubId;
  phase: NpcLifecyclePhase;
  status: NpcLifecycleStatus;
  cycle: number;
  tick: number;
  goal: string | null;
  action: string | null;
  actionReceiptId: string | null;
  resolutionIndex: number | null;
  /** World signals this NPC emitted during the current cycle. */
  emittedSignalIds: readonly string[];
  /** Interaction signals this NPC received from other NPCs during the current cycle. */
  receivedInteractionIds: readonly string[];
  failureCode: string | null;
}>;

/** An interaction signal between two NPCs in the same hub. */
export type NpcInteractionSignal = Readonly<{
  id: string;
  kind: "trade" | "safety_shared" | "resource_competition" | "social" | "caravan_pressure";
  sourceNpcId: string;
  targetNpcId: string;
  hubId: LivingHistoryHubId;
  magnitude: number;
  cycle: number;
}>;

export type ConcurrentNpcCycleResult = Readonly<{
  version: typeof CONCURRENT_NPC_RUNTIME_VERSION;
  cycle: number;
  tick: number;
  /** Per-NPC lifecycle states — one entry per NPC, in canonical hub order. */
  npcStates: readonly NpcLifecycleState[];
  /** All interaction signals generated during this cycle. */
  interactions: readonly NpcInteractionSignal[];
  /** Count of NPCs that completed all phases successfully. */
  confirmedCount: number;
  /** Total number of NPCs in the runtime. */
  totalCount: number;
  failureCode: string | null;
}>;

/** A single NPC lifecycle agent — runs independently and concurrently. */
export interface NpcLifecycleAgent {
  readonly npcId: string;
  readonly hubId: LivingHistoryHubId;
  /** Execute this NPC's lifecycle for one cycle. Returns the NPC's state and emitted signals. */
  execute(cycle: number, tick: number): Promise<Readonly<{
    state: NpcLifecycleState;
    emittedSignalIds: readonly string[];
  }>>;
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const normalized = message
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 96) || "UNKNOWN";
}

/**
 * Derive interaction signals between NPCs that acted in the same hub during
 * the same cycle. These signals represent NPC-to-NPC effects:
 *
 *   - trade: Two NPCs trading in the same hub create mutual economic pressure.
 *   - safety_shared: A patrolling NPC improves safety for all NPCs in its hub.
 *   - resource_competition: Multiple NPCs producing the same commodity compete.
 *   - social: NPCs socializing in the same hub build social bonds.
 *   - caravan_pressure: A caravan arriving at a hub creates economic pressure
 *     on the NPCs stationed there.
 */
export function deriveNpcInteractions(
  npcResults: ReadonlyArray<Readonly<{
    npcId: string;
    hubId: LivingHistoryHubId;
    action: string | null;
    cycle: number;
  }>>,
): readonly NpcInteractionSignal[] {
  const interactions: NpcInteractionSignal[] = [];

  // Group NPCs by their hub to find co-located NPCs.
  type NpcActionRef = (typeof npcResults)[number];
  const byHub = new Map<LivingHistoryHubId, NpcActionRef[]>();
  for (const npc of npcResults) {
    const group = byHub.get(npc.hubId) ?? [];
    group.push(npc);
    byHub.set(npc.hubId, group);
  }

  for (const [hubId, npcs] of byHub) {
    if (npcs.length < 2) continue;

    // Safety shared: patrolling NPCs improve safety for all others in the hub.
    const patrollers = npcs.filter((n) => n.action === "patrol");
    const nonPatrollers = npcs.filter((n) => n.action !== "patrol");
    for (const patroller of patrollers) {
      for (const target of nonPatrollers) {
        interactions.push(Object.freeze({
          id: `int:${patroller.cycle}:${hubId}:safety:${patroller.npcId}:${target.npcId}`,
          kind: "safety_shared",
          sourceNpcId: patroller.npcId,
          targetNpcId: target.npcId,
          hubId,
          magnitude: 0.05,
          cycle: patroller.cycle,
        }));
      }
    }

    // Trade: two trading NPCs in the same hub create mutual economic pressure.
    const traders = npcs.filter((n) => n.action === "trade");
    for (let i = 0; i < traders.length; i++) {
      for (let j = i + 1; j < traders.length; j++) {
        interactions.push(Object.freeze({
          id: `int:${traders[i].cycle}:${hubId}:trade:${traders[i].npcId}:${traders[j].npcId}`,
          kind: "trade",
          sourceNpcId: traders[i].npcId,
          targetNpcId: traders[j].npcId,
          hubId,
          magnitude: 0.08,
          cycle: traders[i].cycle,
        }));
      }
    }

    // Resource competition: multiple producers in the same hub compete.
    const producers = npcs.filter((n) => n.action === "produce");
    for (let i = 0; i < producers.length; i++) {
      for (let j = i + 1; j < producers.length; j++) {
        interactions.push(Object.freeze({
          id: `int:${producers[i].cycle}:${hubId}:competition:${producers[i].npcId}:${producers[j].npcId}`,
          kind: "resource_competition",
          sourceNpcId: producers[i].npcId,
          targetNpcId: producers[j].npcId,
          hubId,
          magnitude: -0.03,
          cycle: producers[i].cycle,
        }));
      }
    }

    // Social: NPCs socializing in the same hub build bonds.
    const socializers = npcs.filter((n) => n.action === "socialize");
    for (let i = 0; i < socializers.length; i++) {
      for (let j = i + 1; j < socializers.length; j++) {
        interactions.push(Object.freeze({
          id: `int:${socializers[i].cycle}:${hubId}:social:${socializers[i].npcId}:${socializers[j].npcId}`,
          kind: "social",
          sourceNpcId: socializers[i].npcId,
          targetNpcId: socializers[j].npcId,
          hubId,
          magnitude: 0.04,
          cycle: socializers[i].cycle,
        }));
      }
    }
  }

  // Caravan pressure: NPCs that caravaned to another hub create pressure on
  // the NPCs stationed at the destination hub.
  const caravaners = npcResults.filter((n) => n.action === "caravan");
  for (const caravaner of caravaners) {
    for (const [hubId, npcs] of byHub) {
      if (hubId === caravaner.hubId) continue;
      for (const target of npcs) {
        interactions.push(Object.freeze({
          id: `int:${caravaner.cycle}:${hubId}:caravan:${caravaner.npcId}:${target.npcId}`,
          kind: "caravan_pressure",
          sourceNpcId: caravaner.npcId,
          targetNpcId: target.npcId,
          hubId,
          magnitude: 0.06,
          cycle: caravaner.cycle,
        }));
      }
    }
  }

  return Object.freeze(interactions);
}

/**
 * Execute all NPC lifecycle agents concurrently for one cycle.
 *
 * Each agent runs independently — no NPC waits for another. After all agents
 * have completed, interaction signals are derived from their collective actions.
 */
export async function executeConcurrentNpcCycle(
  agents: readonly NpcLifecycleAgent[],
  cycle: number,
  tick: number,
): Promise<ConcurrentNpcCycleResult> {
  if (!Number.isSafeInteger(cycle) || cycle < 0) throw new Error("CONCURRENT_NPC_CYCLE_INVALID");
  if (!Number.isSafeInteger(tick) || tick < 1) throw new Error("CONCURRENT_NPC_TICK_INVALID");
  if (agents.length === 0) throw new Error("CONCURRENT_NPC_NO_AGENTS");

  // Execute all NPC lifecycle agents concurrently.
  const settled = await Promise.allSettled(agents.map((agent) => agent.execute(cycle, tick)));

  const npcStates: NpcLifecycleState[] = [];
  const npcActionResults: Array<Readonly<{
    npcId: string;
    hubId: LivingHistoryHubId;
    action: string | null;
    cycle: number;
  }>> = [];
  let confirmedCount = 0;
  let cycleFailure: string | null = null;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const agent = agents[i];

    if (result.status === "fulfilled") {
      npcStates.push(result.value.state);
      npcActionResults.push({
        npcId: result.value.state.npcId,
        hubId: result.value.state.hubId,
        action: result.value.state.action,
        cycle,
      });
      if (result.value.state.status === "confirmed") confirmedCount++;
    } else {
      const code = failureCode(result.reason);
      cycleFailure = cycleFailure ?? code;
      npcStates.push(Object.freeze({
        npcId: agent.npcId,
        hubId: agent.hubId,
        phase: "act",
        status: "degraded",
        cycle,
        tick,
        goal: null,
        action: null,
        actionReceiptId: null,
        resolutionIndex: null,
        emittedSignalIds: Object.freeze([]),
        receivedInteractionIds: Object.freeze([]),
        failureCode: code,
      }));
      npcActionResults.push({
        npcId: agent.npcId,
        hubId: agent.hubId,
        action: null,
        cycle,
      });
    }
  }

  // Derive NPC-to-NPC interaction signals from the collective actions.
  const interactions = deriveNpcInteractions(npcActionResults);

  // Assign received interaction IDs to each NPC state.
  const interactionMap = new Map<string, string[]>();
  for (const interaction of interactions) {
    const received = interactionMap.get(interaction.targetNpcId) ?? [];
    received.push(interaction.id);
    interactionMap.set(interaction.targetNpcId, received);
  }

  const finalStates = npcStates.map((state) =>
    Object.freeze({
      ...state,
      receivedInteractionIds: Object.freeze(interactionMap.get(state.npcId) ?? []),
    }) as NpcLifecycleState,
  );

  return Object.freeze({
    version: CONCURRENT_NPC_RUNTIME_VERSION,
    cycle,
    tick,
    npcStates: Object.freeze(finalStates),
    interactions,
    confirmedCount,
    totalCount: agents.length,
    failureCode: cycleFailure,
  });
}

/**
 * Hash the interaction signals for a cycle — used as a deterministic fingerprint
 * of NPC-to-NPC interactions for evidence/readback.
 */
export function hashNpcInteractions(interactions: readonly NpcInteractionSignal[]): string {
  return createHash("sha256")
    .update(interactions.map((i) => i.id).sort().join("\u001f"))
    .digest("hex");
}
