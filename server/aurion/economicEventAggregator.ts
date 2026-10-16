/**
 * Economic Event Aggregator — Aurion-native.
 *
 * Derives structured economic impact from the world signals and NPC
 * interaction signals produced during a Living History Loop cycle. The
 * aggregated impact is consumed by the civilization loop to drive dynamic
 * market development: trade volume shifts population growth, scarcity
 * signals raise market prices, hazard signals increase the hazard index,
 * and political instability erodes stability.
 *
 * This module is pure/deterministic — it never touches the database. The
 * civilization service applies the derived impact to persistent state.
 */

import { createHash } from "node:crypto";
import type { WorldSignal } from "../wasdAurionProtocol";
import type { NpcInteractionSignal } from "./npcConcurrentLifecycleRuntime.js";
import type { LivingHistoryHubId } from "./livingHistoryLoop.js";

export const ECONOMIC_EVENT_AGGREGATOR_VERSION = "aurion-economic-event-aggregator.v1" as const;

/**
 * Per-hub economic snapshot derived from one Living History Loop cycle.
 * Each hub's market develops independently based on the signals its NPC
 * actions produced and the interactions it received.
 */
export type HubEconomicSnapshot = Readonly<{
  hubId: LivingHistoryHubId;
  /** Net economic pressure from economy signals (positive = growth). */
  economyPressure: number;
  /** Hazard pressure from hazard/caravan-ambush signals (positive = danger). */
  hazardPressure: number;
  /** Scarcity pressure from negative resource deltas (positive = shortage). */
  scarcityPressure: number;
  /** Political instability from politics signals (positive = unstable). */
  politicsPressure: number;
  /** Trade volume from NPC trade interactions (higher = more market activity). */
  tradeVolume: number;
  /** Caravan activity count — cross-hub economic connections. */
  caravanActivity: number;
  /** Number of distinct economic signals aggregated for this hub. */
  signalCount: number;
}>;

/**
 * Aggregated economic impact for an entire Living History Loop cycle,
 * covering all four hubs. This is what the civilization loop consumes.
 */
export type EconomicCycleImpact = Readonly<{
  version: typeof ECONOMIC_EVENT_AGGREGATOR_VERSION;
  cycle: number;
  hubs: readonly HubEconomicSnapshot[];
  /** Global trade volume across all hubs — drives population growth. */
  totalTradeVolume: number;
  /** Global scarcity — drives market price increases. */
  totalScarcityPressure: number;
  /** Global hazard — drives hazard index. */
  totalHazardPressure: number;
  /** Global economy pressure — drives prosperity. */
  totalEconomyPressure: number;
  /** Global political instability — erodes stability. */
  totalPoliticsPressure: number;
  /** Total caravan routes active across hubs — cross-hub connectivity. */
  totalCaravanActivity: number;
  /** Deterministic hash of the aggregated impact for evidence/readback. */
  impactHash: string;
}>;

const clampUnit = (value: number) => Math.max(0, Math.min(1, Math.round(value * 10_000) / 10_000));
const clampSigned = (value: number) => Math.max(-1, Math.min(1, Math.round(value * 10_000) / 10_000));

/**
 * Aggregate world signals and NPC interaction signals into a structured
 * economic impact for the civilization loop.
 *
 * Signal mapping:
 *   - economy signals → economyPressure (magnitude, clamped)
 *   - hazard signals → hazardPressure (|magnitude|)
 *   - politics signals → politicsPressure (|magnitude|)
 *   - trade interactions → tradeVolume (sum of magnitudes)
 *   - caravan_pressure interactions → caravanActivity (count)
 *   - resource_competition interactions → scarcityPressure (sum of |magnitude|)
 */
export function aggregateEconomicImpact(
  cycle: number,
  signals: ReadonlyArray<Readonly<{ signal: WorldSignal; sourceNpcId: string; sourceHubId: LivingHistoryHubId }>>,
  interactions: readonly NpcInteractionSignal[],
): EconomicCycleImpact {
  const hubIds: readonly LivingHistoryHubId[] = [
    "observatory_threshold",
    "windhollow",
    "emberfall",
    "cinder_vault",
  ];

  const hubSnapshots = hubIds.map((hubId) => {
    const hubSignals = signals.filter((s) => s.sourceHubId === hubId);

    let economyPressure = 0;
    let hazardPressure = 0;
    let scarcityPressure = 0;
    let politicsPressure = 0;

    for (const { signal } of hubSignals) {
      switch (signal.kind) {
        case "economy":
          economyPressure += clampSigned(signal.magnitude);
          break;
        case "hazard":
          hazardPressure += Math.abs(clampSigned(signal.magnitude));
          break;
        case "politics":
          politicsPressure += Math.abs(clampSigned(signal.magnitude));
          break;
        case "war":
          hazardPressure += Math.abs(clampSigned(signal.magnitude)) * 0.5;
          politicsPressure += Math.abs(clampSigned(signal.magnitude)) * 0.3;
          break;
        case "ecology":
          // Negative ecology signals → scarcity pressure
          if (signal.magnitude < 0) scarcityPressure += Math.abs(clampSigned(signal.magnitude));
          break;
        default:
          break;
      }
    }

    // NPC interactions for this hub
    const hubInteractions = interactions.filter((i) => i.hubId === hubId);
    let tradeVolume = 0;
    let caravanActivity = 0;

    for (const interaction of hubInteractions) {
      switch (interaction.kind) {
        case "trade":
          tradeVolume += Math.abs(interaction.magnitude);
          break;
        case "caravan_pressure":
          caravanActivity += 1;
          tradeVolume += Math.abs(interaction.magnitude) * 0.5;
          break;
        case "resource_competition":
          scarcityPressure += Math.abs(interaction.magnitude);
          break;
        default:
          break;
      }
    }

    return Object.freeze({
      hubId,
      economyPressure: clampSigned(economyPressure),
      hazardPressure: clampUnit(hazardPressure),
      scarcityPressure: clampUnit(scarcityPressure),
      politicsPressure: clampUnit(politicsPressure),
      tradeVolume: clampUnit(tradeVolume),
      caravanActivity,
      signalCount: hubSignals.length,
    }) as HubEconomicSnapshot;
  });

  const totalTradeVolume = clampUnit(hubSnapshots.reduce((sum, h) => sum + h.tradeVolume, 0));
  const totalScarcityPressure = clampUnit(hubSnapshots.reduce((sum, h) => sum + h.scarcityPressure, 0));
  const totalHazardPressure = clampUnit(hubSnapshots.reduce((sum, h) => sum + h.hazardPressure, 0));
  const totalEconomyPressure = clampSigned(hubSnapshots.reduce((sum, h) => sum + h.economyPressure, 0));
  const totalPoliticsPressure = clampUnit(hubSnapshots.reduce((sum, h) => sum + h.politicsPressure, 0));
  const totalCaravanActivity = hubSnapshots.reduce((sum, h) => sum + h.caravanActivity, 0);

  const impactHash = createHash("sha256")
    .update([
      ECONOMIC_EVENT_AGGREGATOR_VERSION,
      String(cycle),
      ...hubSnapshots.map((h) =>
        `${h.hubId}:${h.economyPressure}:${h.hazardPressure}:${h.scarcityPressure}:${h.politicsPressure}:${h.tradeVolume}:${h.caravanActivity}:${h.signalCount}`,
      ),
      String(totalTradeVolume),
      String(totalScarcityPressure),
      String(totalHazardPressure),
      String(totalEconomyPressure),
      String(totalPoliticsPressure),
      String(totalCaravanActivity),
    ].join("\u001f"))
    .digest("hex");

  return Object.freeze({
    version: ECONOMIC_EVENT_AGGREGATOR_VERSION,
    cycle,
    hubs: Object.freeze(hubSnapshots),
    totalTradeVolume,
    totalScarcityPressure,
    totalHazardPressure,
    totalEconomyPressure,
    totalPoliticsPressure,
    totalCaravanActivity,
    impactHash,
  });
}
