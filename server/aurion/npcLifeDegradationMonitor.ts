/**
 * Runtime check for persistent NPC lifecycle degradation.
 *
 * The merchant NPC stayed degraded with NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT
 * from 2026-09-19 until 2026-11-03 while healthz only carried a status field.
 * This monitor turns per-cycle lifecycle entries into explicit, bounded events:
 * entering degradation (or changing failure code), staying degraded for every
 * REPEAT_EVERY_CYCLES consecutive cycles, and recovering. It holds no gameplay
 * authority and never changes NPC state.
 */

export const NPC_DEGRADATION_REPEAT_EVERY_CYCLES = 10;

export type NpcLifecycleEntryStatus = "confirmed" | "degraded" | "skipped";

export type NpcDegradationEntry = Readonly<{
  npcId: string;
  status: NpcLifecycleEntryStatus | string;
  failureCode: string | null;
}>;

export type NpcDegradationEvent = Readonly<{
  recordType: "aurion.npc-life-degradation";
  schemaVersion: 1;
  event: "degraded" | "still_degraded" | "recovered";
  npcId: string;
  failureCode: string | null;
  consecutiveCycles: number;
  cycle: number;
  tick: number;
}>;

type Tracked = Readonly<{ failureCode: string; consecutiveCycles: number }>;

export type NpcDegradationState = ReadonlyMap<string, Tracked>;

export function observeNpcDegradation(
  previous: NpcDegradationState,
  entries: readonly NpcDegradationEntry[],
  cycle: number,
  tick: number,
): Readonly<{ state: NpcDegradationState; events: readonly NpcDegradationEvent[] }> {
  if (!Number.isSafeInteger(cycle) || cycle < 0 || !Number.isSafeInteger(tick) || tick < 0) throw new Error("NPC_DEGRADATION_MONITOR_CYCLE_INVALID");
  const next = new Map<string, Tracked>();
  const events: NpcDegradationEvent[] = [];
  const event = (kind: NpcDegradationEvent["event"], npcId: string, failureCode: string | null, consecutiveCycles: number) =>
    events.push(Object.freeze({ recordType: "aurion.npc-life-degradation", schemaVersion: 1, event: kind, npcId, failureCode, consecutiveCycles, cycle, tick }));

  for (const entry of [...entries].sort((a, b) => (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0))) {
    const prior = previous.get(entry.npcId);
    if (entry.status === "degraded") {
      const failureCode = entry.failureCode ?? "NPC_LIFE_DEGRADED_WITHOUT_CODE";
      const consecutiveCycles = prior && prior.failureCode === failureCode ? prior.consecutiveCycles + 1 : 1;
      next.set(entry.npcId, Object.freeze({ failureCode, consecutiveCycles }));
      if (consecutiveCycles === 1) event("degraded", entry.npcId, failureCode, consecutiveCycles);
      else if (consecutiveCycles % NPC_DEGRADATION_REPEAT_EVERY_CYCLES === 0) event("still_degraded", entry.npcId, failureCode, consecutiveCycles);
    } else if (prior && entry.status === "confirmed") {
      event("recovered", entry.npcId, prior.failureCode, prior.consecutiveCycles);
    } else if (prior) {
      // Skipped/idle does not prove recovery: keep the open degradation.
      next.set(entry.npcId, prior);
    }
  }
  return Object.freeze({ state: next, events: Object.freeze(events) });
}

export function formatNpcDegradationEvent(event: NpcDegradationEvent): string {
  return `[NpcLife] ${event.event.toUpperCase()} ${JSON.stringify(event)}`;
}
