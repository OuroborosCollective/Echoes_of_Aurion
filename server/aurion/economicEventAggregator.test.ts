import { describe, expect, it } from "vitest";
import type { WorldSignal, WorldSignalKind } from "../wasdAurionProtocol";
import {
  ECONOMIC_EVENT_AGGREGATOR_VERSION,
  aggregateEconomicImpact,
  type HubEconomicSnapshot,
} from "./economicEventAggregator";
import type { LivingHistoryHubId } from "./livingHistoryLoop";
import type { NpcInteractionSignal } from "./npcConcurrentLifecycleRuntime";

type SourcedSignal = Readonly<{ signal: WorldSignal; sourceNpcId: string; sourceHubId: LivingHistoryHubId }>;

let sequence = 0;

function signal(hubId: LivingHistoryHubId, kind: WorldSignalKind, magnitude: number): SourcedSignal {
  sequence += 1;
  return {
    sourceNpcId: `npc_${hubId}`,
    sourceHubId: hubId,
    signal: {
      id: `signal_${sequence}`,
      kind,
      regionId: hubId,
      magnitude,
      sourceReceiptId: `receipt_${sequence}`,
      resolutionIndex: sequence,
    },
  };
}

function interaction(hubId: LivingHistoryHubId, kind: NpcInteractionSignal["kind"], magnitude: number): NpcInteractionSignal {
  sequence += 1;
  return { id: `interaction_${sequence}`, kind, sourceNpcId: "npc_a", targetNpcId: "npc_b", hubId, magnitude, cycle: 1 };
}

function hub(impact: ReturnType<typeof aggregateEconomicImpact>, hubId: LivingHistoryHubId): HubEconomicSnapshot {
  const snapshot = impact.hubs.find(h => h.hubId === hubId);
  if (!snapshot) throw new Error(`missing hub ${hubId}`);
  return snapshot;
}

const zeroHub = {
  economyPressure: 0,
  hazardPressure: 0,
  scarcityPressure: 0,
  politicsPressure: 0,
  tradeVolume: 0,
  caravanActivity: 0,
  signalCount: 0,
};

describe("Aurion economic event aggregator", () => {
  it("emits all four hubs in canonical order with zero pressure when a cycle produced no activity", () => {
    const impact = aggregateEconomicImpact(7, [], []);

    expect(impact.version).toBe(ECONOMIC_EVENT_AGGREGATOR_VERSION);
    expect(impact.cycle).toBe(7);
    expect(impact.hubs.map(h => h.hubId)).toEqual(["observatory_threshold", "windhollow", "emberfall", "cinder_vault"]);
    for (const snapshot of impact.hubs) expect(snapshot).toMatchObject(zeroHub);
    expect(impact).toMatchObject({
      totalTradeVolume: 0,
      totalScarcityPressure: 0,
      totalHazardPressure: 0,
      totalEconomyPressure: 0,
      totalPoliticsPressure: 0,
      totalCaravanActivity: 0,
    });
    expect(impact.impactHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps each world signal kind onto the documented pressure channel", () => {
    const impact = aggregateEconomicImpact(1, [
      signal("windhollow", "economy", -0.25),
      signal("windhollow", "hazard", -0.3),
      signal("windhollow", "politics", -0.2),
      signal("windhollow", "war", 0.4),
      signal("windhollow", "ecology", -0.15),
      signal("windhollow", "ecology", 0.9),
      signal("windhollow", "weather", 0.8),
      signal("windhollow", "resonance", 0.8),
      signal("windhollow", "player_event", 0.8),
    ], []);

    expect(hub(impact, "windhollow")).toEqual({
      hubId: "windhollow",
      economyPressure: -0.25,
      hazardPressure: 0.5, // |hazard| 0.3 + war 0.4 * 0.5
      scarcityPressure: 0.15, // only negative ecology
      politicsPressure: 0.32, // |politics| 0.2 + war 0.4 * 0.3
      tradeVolume: 0,
      caravanActivity: 0,
      signalCount: 9, // ignored kinds still count as aggregated signals
    });
  });

  it("maps NPC interactions onto trade volume, caravan activity and scarcity", () => {
    const impact = aggregateEconomicImpact(1, [], [
      interaction("emberfall", "trade", -0.2),
      interaction("emberfall", "caravan_pressure", 0.3),
      interaction("emberfall", "caravan_pressure", -0.1),
      interaction("emberfall", "resource_competition", -0.25),
      interaction("emberfall", "social", 0.9),
      interaction("emberfall", "safety_shared", 0.9),
    ]);

    expect(hub(impact, "emberfall")).toEqual({
      hubId: "emberfall",
      economyPressure: 0,
      hazardPressure: 0,
      scarcityPressure: 0.25,
      politicsPressure: 0,
      tradeVolume: 0.4, // 0.2 + (0.3 + 0.1) * 0.5
      caravanActivity: 2,
      signalCount: 0, // interactions are not world signals
    });
    expect(impact.totalCaravanActivity).toBe(2);
  });

  it("keeps each hub's market independent of activity in other hubs", () => {
    const impact = aggregateEconomicImpact(
      3,
      [signal("cinder_vault", "hazard", 0.6), signal("observatory_threshold", "economy", 0.4)],
      [interaction("cinder_vault", "trade", 0.5)],
    );

    expect(hub(impact, "cinder_vault")).toMatchObject({ hazardPressure: 0.6, tradeVolume: 0.5, economyPressure: 0, signalCount: 1 });
    expect(hub(impact, "observatory_threshold")).toMatchObject({ economyPressure: 0.4, hazardPressure: 0, tradeVolume: 0, signalCount: 1 });
    expect(hub(impact, "windhollow")).toMatchObject(zeroHub);
    expect(hub(impact, "emberfall")).toMatchObject(zeroHub);
  });

  it("clamps per-signal magnitudes, per-hub pressures and global totals to their bounded ranges", () => {
    const hubs: LivingHistoryHubId[] = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];
    const impact = aggregateEconomicImpact(
      9,
      [
        signal("windhollow", "economy", 50), // clamped to 1 before summing
        signal("windhollow", "economy", -0.5),
        ...hubs.flatMap(h => [signal(h, "hazard", -4), signal(h, "hazard", 4), signal(h, "economy", -3)]),
        ...hubs.flatMap(h => [signal(h, "politics", 4), signal(h, "politics", 4)]),
      ],
      hubs.flatMap(h => [interaction(h, "trade", 0.8), interaction(h, "resource_competition", 0.7)]),
    );

    for (const h of hubs) {
      const snapshot = hub(impact, h);
      expect(snapshot.hazardPressure).toBe(1);
      expect(snapshot.tradeVolume).toBe(0.8);
      expect(snapshot.scarcityPressure).toBe(0.7);
      expect(snapshot.politicsPressure).toBe(1);
      expect(snapshot.economyPressure).toBeGreaterThanOrEqual(-1);
      expect(snapshot.economyPressure).toBeLessThanOrEqual(1);
    }
    // windhollow: 1 - 0.5 - 1 = -0.5; others: -1
    expect(hub(impact, "windhollow").economyPressure).toBe(-0.5);
    expect(hub(impact, "emberfall").economyPressure).toBe(-1);

    expect(impact.totalHazardPressure).toBe(1);
    expect(impact.totalTradeVolume).toBe(1);
    expect(impact.totalScarcityPressure).toBe(1);
    expect(impact.totalEconomyPressure).toBe(-1);
    expect(impact.totalPoliticsPressure).toBe(1);
  });

  it("produces a deterministic impact hash that is order-independent across hubs and sensitive to cycle and content", () => {
    const signals = [signal("windhollow", "economy", 0.3), signal("emberfall", "hazard", 0.2)];
    const interactions = [interaction("windhollow", "trade", 0.4), interaction("cinder_vault", "caravan_pressure", 0.1)];

    const baseline = aggregateEconomicImpact(5, signals, interactions);
    const reordered = aggregateEconomicImpact(5, [...signals].reverse(), [...interactions].reverse());
    const otherCycle = aggregateEconomicImpact(6, signals, interactions);
    const otherContent = aggregateEconomicImpact(5, [...signals, signal("emberfall", "politics", 0.1)], interactions);

    expect(reordered).toEqual(baseline);
    expect(reordered.impactHash).toBe(baseline.impactHash);
    expect(otherCycle.impactHash).not.toBe(baseline.impactHash);
    expect(otherContent.impactHash).not.toBe(baseline.impactHash);
  });

  it("returns a frozen impact so downstream civilization logic cannot mutate aggregated evidence", () => {
    const impact = aggregateEconomicImpact(2, [signal("windhollow", "economy", 0.1)], []);

    expect(Object.isFrozen(impact)).toBe(true);
    expect(Object.isFrozen(impact.hubs)).toBe(true);
    for (const snapshot of impact.hubs) expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
