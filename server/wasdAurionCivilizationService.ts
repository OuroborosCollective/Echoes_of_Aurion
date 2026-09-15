import { createHash } from "node:crypto";
import {
  advanceCivilizationEpoch,
  resolveCollapseQualification,
  resolveRuinTransformation,
  type RuinTransformation,
} from "./wasdAurionCivilizationProtocol";
import {
  getActiveCivilization,
  recordCivilizationCollapse,
  recordCivilizationHistoryEvent,
  recordSettlementRebirthCandidate,
  upsertActiveCivilization,
  listVisibleRuins,
} from "./aurionCivilizationHistoryPersistence";

const hash = (parts: readonly string[]) =>
  createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

export async function orchestrateCivilizationLoop(worldId: string, worldEpoch: number, sourceReceiptId: string) {
  const activeCiv = await getActiveCivilization(worldId);

  if (activeCiv) {
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
        worldEpoch,
        collapseReceiptHash: qualification.receiptHash,
        rulesetVersion: "wasd:civ:v1",
        generationSeed: `seed-${activeCiv.civilizationId}-${worldEpoch}`,
      });

      await recordCivilizationCollapse({
        worldId,
        civilizationId: activeCiv.civilizationId,
        collapseEventId: hash(["collapse", activeCiv.civilizationId, String(worldEpoch)]),
        sourceReceiptId,
        sourceRevision: "wasd:civ:v1",
        worldEpoch,
        locationIdentity: ruinTransformation.locationIdentity,
        historyDigest: ruinTransformation.historyDigest,
        rulesetVersion: ruinTransformation.rulesetVersion,
        generationSeedDigest: ruinTransformation.generationSeedDigest,
        occurredSequence: worldEpoch,
      });

      return { action: "COLLAPSED", ruinId: ruinTransformation.ruinId };
    } else {
      const epochAdvance = advanceCivilizationEpoch({
        worldId,
        currentEpoch: Math.max(1, activeCiv.worldEpoch),
        transitionReason: "epoch_advance",
        ruinTransformations: [],
        receiptId: sourceReceiptId,
      });

      const nextCiv = {
        civilizationId: activeCiv.civilizationId,
        worldId,
        worldEpoch: epochAdvance.toEpoch,
        population: Math.max(10, activeCiv.population + 5),
        stability: Math.min(1.0, activeCiv.stability + 0.05),
        hazardIndex: Math.max(0.0, activeCiv.hazardIndex - 0.02),
        scarcitySeverity: Math.max(0.0, activeCiv.scarcitySeverity - 0.02),
        lastResolutionIndex: worldEpoch,
      };

      await upsertActiveCivilization(nextCiv);
      
      await recordCivilizationHistoryEvent({
        eventId: hash(["advance", activeCiv.civilizationId, String(worldEpoch)]),
        civilizationId: activeCiv.civilizationId,
        worldId,
        worldEpoch: nextCiv.worldEpoch,
        eventType: "EPOCH_ADVANCE",
        sourceReceiptId,
        sourceRevision: "wasd:civ:v1",
        eventPayloadJson: JSON.stringify(nextCiv),
        occurredSequence: worldEpoch,
      });

      return { action: "ADVANCED", civilizationId: activeCiv.civilizationId };
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

      const epochAdvance = advanceCivilizationEpoch({
        worldId,
        currentEpoch: Math.max(1, worldEpoch),
        transitionReason: "settlement_rebirth",
        ruinTransformations,
        receiptId: sourceReceiptId,
      });

      if (epochAdvance.rebirthCandidates.length > 0) {
        const candidate = epochAdvance.rebirthCandidates[0]!;
        await recordSettlementRebirthCandidate({
          candidateId: candidate.candidateId,
          worldId,
          locationIdentity: candidate.locationIdentity,
          ruinId: candidate.ruinId,
          eligibilityReceipt: epochAdvance.receiptHash,
          candidateSeedDigest: candidate.candidateSeedDigest,
          state: "ELIGIBLE",
        });
        return { action: "REBIRTH_CANDIDATE_CREATED", candidateId: candidate.candidateId };
      }
    } else {
      // Seed initial civilization if none exists and no ruins
      const initialCivId = `civ_initial_${worldId}`;
      await upsertActiveCivilization({
        civilizationId: initialCivId,
        worldId,
        worldEpoch: 1,
        population: 100,
        stability: 1.0,
        hazardIndex: 0.0,
        scarcitySeverity: 0.0,
        lastResolutionIndex: worldEpoch,
      });
      return { action: "INITIAL_CIV_SEEDED", civilizationId: initialCivId };
    }
  }

  return { action: "IDLE" };
}
