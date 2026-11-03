import { describe, expect, it } from "vitest";
import {
  NPC_DEGRADATION_REPEAT_EVERY_CYCLES,
  formatNpcDegradationEvent,
  observeNpcDegradation,
  type NpcDegradationEntry,
  type NpcDegradationState,
} from "./npcLifeDegradationMonitor";

const merchant = "ax1_merchant_observatory_threshold";
const degraded = (failureCode: string | null): NpcDegradationEntry => ({ npcId: merchant, status: "degraded", failureCode });

function run(cycles: readonly (readonly NpcDegradationEntry[])[]) {
  let state: NpcDegradationState = new Map();
  return cycles.map((entries, index) => {
    const result = observeNpcDegradation(state, entries, index + 1, (index + 1) * 600);
    state = result.state;
    return result.events;
  });
}

describe("NPC lifecycle degradation monitor", () => {
  it("reports a persistent production-like degradation once, then every bounded interval, never every cycle", () => {
    const events = run(Array.from({ length: 25 }, () => [degraded("NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT")]));
    const flat = events.flat();
    expect(flat.map(event => [event.event, event.consecutiveCycles])).toEqual([
      ["degraded", 1],
      ["still_degraded", NPC_DEGRADATION_REPEAT_EVERY_CYCLES],
      ["still_degraded", NPC_DEGRADATION_REPEAT_EVERY_CYCLES * 2],
    ]);
    expect(flat.every(event => event.npcId === merchant && event.failureCode === "NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT")).toBe(true);
  });

  it("restarts the count when the failure code changes and reports recovery with the open duration", () => {
    const events = run([
      [degraded("NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT")],
      [degraded("NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT")],
      [degraded("NPC_SEMANTIC_GRAPH_V2_SOURCE_DRIFT")],
      [{ npcId: merchant, status: "skipped", failureCode: "NPC_ACTION_SOURCE_DECISION_REQUIRED" }],
      [{ npcId: merchant, status: "confirmed", failureCode: null }],
      [{ npcId: merchant, status: "confirmed", failureCode: null }],
    ]);
    expect(events.map(cycle => cycle.map(event => `${event.event}:${event.failureCode}:${event.consecutiveCycles}`))).toEqual([
      ["degraded:NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT:1"],
      [],
      ["degraded:NPC_SEMANTIC_GRAPH_V2_SOURCE_DRIFT:1"],
      [],
      ["recovered:NPC_SEMANTIC_GRAPH_V2_SOURCE_DRIFT:1"],
      [],
    ]);
  });

  it("never stays silent for a degraded entry without a failure code and rejects invalid cycles", () => {
    const [[event]] = run([[degraded(null)]]);
    expect(event).toMatchObject({ event: "degraded", failureCode: "NPC_LIFE_DEGRADED_WITHOUT_CODE" });
    expect(formatNpcDegradationEvent(event)).toMatch(/^\[NpcLife\] DEGRADED \{"recordType":"aurion\.npc-life-degradation"/);
    expect(() => observeNpcDegradation(new Map(), [], -1, 1)).toThrow("NPC_DEGRADATION_MONITOR_CYCLE_INVALID");
  });
});
