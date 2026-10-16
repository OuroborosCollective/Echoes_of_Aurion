// Native Aurion civilization service — Living History Loop (Issue #323).
// Migrated from WASD provenance; active implementation is Aurion-owned.
// All ruleset identifiers use "aurion:" prefixes — no legacy "wasd:" dependencies.

import { createHash } from "node:crypto";
import {
  advanceCivilizationEpoch,
  resolveCollapseQualification,
  resolveRuinTransformation,
  AURION_CIVILIZATION_RULESET_VERSION,
  type RuinTransformation,
} from "./civilizationProtocol.js";
import {
  getActiveCivilization,
  findCivilizationHistoryEventsBySourceReceipt,
  listCivilizationHistoryEvents,
  recordCivilizationAdvance,
  recordCivilizationCollapse,
  recordInitialCivilizationSeed,
  recordSettlementRebirthTransition,
  listVisibleRuins,
} from "../aurionCivilizationHistoryPersistence.js";
import type { EconomicCycleImpact } from "./economicEventAggregator.js";

const hash = (parts: readonly string[]) =>
  createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

const clampUnit = (value: number) => Math.max(0, Math.min(1, Math.round(value * 10_000) / 10_000));

/**
 * Derive dynamic civilization metric deltas from aggregated economic impact.
 * Markets develop based on real NPC economic activity:
 *   - Trade volume drives population growth (trade attracts settlers).
 *   - Economy pressure raises stability (prosperity stabilizes).
 *   - Scarcity pressure raises scarcitySeverity (shortages worsen).
 *   - Hazard pressure raises hazardIndex (danger increases).
 *   - Political instability erodes stability.
 *   - Caravan activity reduces scarcity (cross-hub supply routes).
 */
function deriveEconomicDeltas(impact: EconomicCycleImpact | null) {
  if (!impact) {
    return {
      populationDelta: 5,
      stabilityDelta: 0.05,
      hazardDelta: -0.02,
      scarcityDelta: -0.02,
      economicEventRecorded: false,
    };
  }

  // Population grows with trade volume, shrinks with hazard and scarcity.
  const tradeGrowth = Math.round(impact.totalTradeVolume * 20);
  const hazardLoss = Math.round(impact.totalHazardPressure * 15);
  const scarcityLoss = Math.round(impact.totalScarcityPressure * 10);
  const populationDelta = Math.max(-20, Math.min(30, 5 + tradeGrowth - hazardLoss - scarcityLoss));

  // Stability rises with positive economy pressure, falls with politics and volatility.
  const economyBoost = impact.totalEconomyPressure * 0.08;
  const politicsErosion = impact.totalPoliticsPressure * 0.06;
  const scarcityErosion = impact.totalScarcityPressure * 0.04;
  const stabilityDelta = clampUnit(economyBoost - politicsErosion - scarcityErosion) - 0.02;

  // Hazard index rises with hazard pressure, decays naturally.
  const hazardDelta = clampUnit(impact.totalHazardPressure * 0.12) - 0.02;

  // Scarcity rises with scarcity pressure, reduced by caravan activity (supply routes).
  const caravanRelief = clampUnit(impact.totalCaravanActivity * 0.03);
  const scarcityDelta = clampUnit(impact.totalScarcityPressure * 0.1) - 0.02 - caravanRelief;

  return {
    populationDelta,
    stabilityDelta,
    hazardDelta,
    scarcityDelta,
    economicEventRecorded: true,
  };
}

export async function orchestrateCivilizationLoop(
  worldId: string,
  worldEpoch: number,
  sourceReceiptId: string,
  economicImpact?: EconomicCycleImpact | null,
) {
  const priorSourceEvents = await findCivilizationHistoryEventsBySourceReceipt(worldId, sourceReceiptId);
  const transitionReplay = priorSourceEvents.find(event =>
    event.eventType === "CIVILIZATION_COLLAPSE" ||
    event.eventType === "EPOCH_ADVANCE" ||
    event.eventType === "REBIRTH_CANDIDATE_CREATED" ||
    event.eventType === "INITIAL_CIV_SEEDED",
  );
  if (transitionReplay) {
    if (transitionReplay.eventType === "CIVILIZATION_COLLAPSE") {
      return { action: "COLLAPSED" as const, ruinId: `ruin_${transitionReplay.eventId}` };
    }
    if (transitionReplay.eventType === "REBIRTH_CANDIDATE_CREATED") {
      return { action: "REBIRTH_CANDIDATE_CREATED" as const, candidateId: transitionReplay.eventId };
    }
    if (transitionReplay.eventType === "INITIAL_CIV_SEEDED") {
      return { action: "INITIAL_CIV_SEEDED" as const, civilizationId: transitionReplay.civilizationId };
    }
    return { action: "ADVANCED" as const, civilizationId: transitionReplay.civilizationId };
  }
  if (priorSourceEvents.length) throw new Error("CIVILIZATION_HISTORY_SOURCE_RECEIPT_INCOMPLETE");

  const activeCiv = await getActiveCivilization(worldId);

  if (activeCiv) {
    const occurredSequence = activeCiv.lastResolutionIndex + 1;
    // Phase A & B: Historical Contracts & Epoch Progression
    const qualification = resolveCollapseQualification({
      civilizationId: activeCiv.civilizationId,
      worldId,
      worldEpoch: activeCiv.worldEpoch,
      population: activeCiv.population,
      stability: activeCiv.stability,
      hazardIndex: activeCiv.hazardIndex,
      scarcitySeverity: activeCiv.scarcitySeverity,
      receiptId: sourceReceiptId,
    });

    if (qualification.isEligible) {
      // Phase C: Ruin Transformation
      const ruinTransformation = resolveRuinTransformation({
        civilizationId: activeCiv.civilizationId,
        worldId,
        locationIdentity: "world_heart",
        worldEpoch: activeCiv.worldEpoch,
        collapseReceiptHash: qualification.receiptHash,
        rulesetVersion: AURION_CIVILIZATION_RULESET_VERSION,
        generationSeed: `seed-${activeCiv.civilizationId}-${activeCiv.worldEpoch}`,
      });

      await recordCivilizationCollapse({
        worldId,
        civilizationId: activeCiv.civilizationId,
        collapseEventId: hash(["collapse", activeCiv.civilizationId, sourceReceiptId]),
        sourceReceiptId,
        sourceRevision: AURION_CIVILIZATION_RULESET_VERSION,
        worldEpoch: activeCiv.worldEpoch,
        locationIdentity: ruinTransformation.locationIdentity,
        historyDigest: ruinTransformation.historyDigest,
        rulesetVersion: ruinTransformation.rulesetVersion,
        generationSeedDigest: ruinTransformation.generationSeedDigest,
        occurredSequence,
      });

      return { action: "COLLAPSED" as const, ruinId: ruinTransformation.ruinId };
    } else {
      const epochAdvance = advanceCivilizationEpoch({
        worldId,
        currentEpoch: Math.max(1, activeCiv.worldEpoch),
        transitionReason: "epoch_advance",
        ruinTransformations: [],
        receiptId: sourceReceiptId,
      });

      // Derive dynamic deltas from aggregated economic impact — markets
      // develop based on real NPC trade, scarcity, hazard and politics.
      const deltas = deriveEconomicDeltas(economicImpact ?? null);
      const economicEventRequired = deltas.economicEventRecorded && economicImpact !== null && economicImpact !== undefined;
      const transitionSequence = occurredSequence;
      const economicSequence = transitionSequence + 1;
      const finalSequence = economicEventRequired ? economicSequence : transitionSequence;

      const nextCiv = {
        civilizationId: activeCiv.civilizationId,
        worldId,
        worldEpoch: epochAdvance.toEpoch,
        population: Math.max(10, activeCiv.population + deltas.populationDelta),
        stability: clampUnit(activeCiv.stability + deltas.stabilityDelta),
        hazardIndex: clampUnit(activeCiv.hazardIndex + deltas.hazardDelta),
        scarcitySeverity: clampUnit(activeCiv.scarcitySeverity + deltas.scarcityDelta),
        lastResolutionIndex: finalSequence,
      };

      const transitionEvent = {
        eventId: hash(["advance", activeCiv.civilizationId, sourceReceiptId]),
        civilizationId: activeCiv.civilizationId,
        worldId,
        worldEpoch: nextCiv.worldEpoch,
        eventType: "EPOCH_ADVANCE",
        sourceReceiptId,
        sourceRevision: AURION_CIVILIZATION_RULESET_VERSION,
        eventPayloadJson: JSON.stringify(nextCiv),
        occurredSequence: transitionSequence,
      };
      const economicEvent = economicEventRequired && economicImpact ? {
        eventId: hash(["economic", activeCiv.civilizationId, sourceReceiptId, economicImpact.impactHash.slice(0, 16)]),
        civilizationId: activeCiv.civilizationId,
        worldId,
        worldEpoch: nextCiv.worldEpoch,
        eventType: "ECONOMIC_MARKET_DEVELOPMENT",
        sourceReceiptId,
        sourceRevision: AURION_CIVILIZATION_RULESET_VERSION,
        eventPayloadJson: JSON.stringify({
          cycle: economicImpact.cycle,
          impactHash: economicImpact.impactHash,
          totalTradeVolume: economicImpact.totalTradeVolume,
          totalScarcityPressure: economicImpact.totalScarcityPressure,
          totalHazardPressure: economicImpact.totalHazardPressure,
          totalEconomyPressure: economicImpact.totalEconomyPressure,
          totalPoliticsPressure: economicImpact.totalPoliticsPressure,
          totalCaravanActivity: economicImpact.totalCaravanActivity,
          hubSnapshots: economicImpact.hubs,
          appliedDeltas: {
            population: deltas.populationDelta,
            stability: deltas.stabilityDelta,
            hazard: deltas.hazardDelta,
            scarcity: deltas.scarcityDelta,
          },
        }),
        occurredSequence: economicSequence,
      } : null;

      await recordCivilizationAdvance({
        state: nextCiv,
        transitionEvent,
        economicEvent,
      });

      return { action: "ADVANCED" as const, civilizationId: activeCiv.civilizationId };
    }
  } else {
    // Phase D: Settlement Rebirth
    const ruins = await listVisibleRuins(worldId);
    if (ruins.length > 0) {
      const ruinTransformations: RuinTransformation[] = ruins.map(ruin => ({
        ruinId: ruin.ruinId,
        sourceCivilizationId: ruin.originCivilizationId,
        worldId: worldId,
        locationIdentity: ruin.locationIdentity,
        worldEpoch: ruin.worldEpoch,
        historyDigest: ruin.historyDigest,
        rulesetVersion: ruin.rulesetVersion,
        generationSeedDigest: ruin.generationSeedDigest,
        state: ruin.state as RuinTransformation["state"],
        receiptHash: hash(["ruin-record", ruin.ruinId]),
      }));

      const rebirthBaseEpoch = Math.max(1, ...ruinTransformations.map(ruin => ruin.worldEpoch));
      const epochAdvance = advanceCivilizationEpoch({
        worldId,
        currentEpoch: rebirthBaseEpoch,
        transitionReason: "settlement_rebirth",
        ruinTransformations,
        receiptId: sourceReceiptId,
      });

      if (epochAdvance.rebirthCandidates.length > 0) {
        const candidate = epochAdvance.rebirthCandidates[0]!;
        if (!candidate.ruinId) throw new Error("CIVILIZATION_REBIRTH_RUIN_REQUIRED");
        const candidateRuin = ruinTransformations.find(ruin => ruin.ruinId === candidate.ruinId);
        if (!candidateRuin) throw new Error("CIVILIZATION_REBIRTH_SOURCE_REQUIRED");
        const priorHistory = await listCivilizationHistoryEvents(worldId, 200);
        const occurredSequence = priorHistory
          .filter(event => event.civilizationId === candidateRuin.sourceCivilizationId)
          .reduce((maximum, event) => Math.max(maximum, event.occurredSequence), -1) + 1;
        await recordSettlementRebirthTransition({
          candidate: {
            candidateId: candidate.candidateId,
            worldId,
            locationIdentity: candidate.locationIdentity,
            ruinId: candidate.ruinId,
            eligibilityReceipt: epochAdvance.receiptHash,
            candidateSeedDigest: candidate.candidateSeedDigest,
            state: "ELIGIBLE",
          },
          event: {
            eventId: candidate.candidateId,
            civilizationId: candidateRuin.sourceCivilizationId,
            worldId,
            worldEpoch: epochAdvance.toEpoch,
            eventType: "REBIRTH_CANDIDATE_CREATED",
            sourceReceiptId,
            sourceRevision: AURION_CIVILIZATION_RULESET_VERSION,
            eventPayloadJson: JSON.stringify(candidate),
            occurredSequence,
          },
        });
        return { action: "REBIRTH_CANDIDATE_CREATED" as const, candidateId: candidate.candidateId };
      }
    } else {
      // Seed initial civilization if none exists and no ruins
      const initialCivId = `civ_initial_${worldId}`;
      const initialCiv = {
        civilizationId: initialCivId,
        worldId,
        worldEpoch: 1,
        population: 100,
        stability: 1.0,
        hazardIndex: 0.0,
        scarcitySeverity: 0.0,
        lastResolutionIndex: 0,
      };
      await recordInitialCivilizationSeed({
        state: initialCiv,
        event: {
          eventId: hash(["seed", initialCivId, sourceReceiptId]),
          civilizationId: initialCivId,
          worldId,
          worldEpoch: 1,
          eventType: "INITIAL_CIV_SEEDED",
          sourceReceiptId,
          sourceRevision: AURION_CIVILIZATION_RULESET_VERSION,
          eventPayloadJson: JSON.stringify(initialCiv),
          occurredSequence: 0,
        },
      });
      return { action: "INITIAL_CIV_SEEDED" as const, civilizationId: initialCivId };
    }
  }

  return { action: "IDLE" as const };
}
