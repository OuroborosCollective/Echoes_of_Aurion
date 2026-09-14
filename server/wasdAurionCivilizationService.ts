import { createHash } from "node:crypto";
import {
  advanceCivilizationEpoch,
  resolveCollapseQualification,
  resolveRuinTransformation,
  resolveSettlementRebirth,
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
      epoch: activeCiv.worldEpoch,
      population: activeCiv.population,
      stability: activeCiv.stability,
      hazardIndex: activeCiv.hazardIndex,
      scarcitySeverity: activeCiv.scarcitySeverity,
    });

    if (qualification.shouldCollapse) {
      // Phase C: Ruin Transformation
      const ruinTransformation = resolveRuinTransformation({
        civilizationId: activeCiv.civilizationId,
        epoch: activeCiv.worldEpoch,
        collapseReason: "STABILITY_THRESHOLD",
        stabilityAtCollapse: activeCiv.stability,
      });

      await recordCivilizationCollapse({
        worldId,
        civilizationId: activeCiv.civilizationId,
        collapseEventId: hash(["collapse", activeCiv.civilizationId, String(worldEpoch)]),
        sourceReceiptId,
        sourceRevision: "wasd:civ:v1",
        worldEpoch,
        locationIdentity: "world_heart", // Simplified for Alpha
        historyDigest: hash(["history", activeCiv.civilizationId]),
        rulesetVersion: "wasd:civ:v1",
        generationSeedDigest: hash(["seed", activeCiv.civilizationId]),
        occurredSequence: worldEpoch,
      });

      return { action: "COLLAPSED", ruinId: ruinTransformation.ruinId };
    } else {
      const nextCiv = advanceCivilizationEpoch(activeCiv);
      await upsertActiveCivilization({
        ...nextCiv,
        worldId,
        lastResolutionIndex: worldEpoch,
      });
      
      await recordCivilizationHistoryEvent({
        eventId: hash(["advance", activeCiv.civilizationId, String(worldEpoch)]),
        civilizationId: activeCiv.civilizationId,
        worldId,
        worldEpoch,
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
       // Pick a ruin to rebirth from
       const ruin = ruins[0];
       const rebirth = resolveSettlementRebirth({
         ruinId: ruin.ruinId,
         worldEpoch,
         rebirthSeed: hash(["rebirth-seed", ruin.ruinId, String(worldEpoch)]),
       });

       if (rebirth.isEligible) {
         await recordSettlementRebirthCandidate({
           candidateId: hash(["candidate", rebirth.rebirthCandidateId, String(worldEpoch)]),
           worldId,
           locationIdentity: ruin.locationIdentity,
           ruinId: ruin.ruinId,
           eligibilityReceipt: hash(["eligibility", rebirth.rebirthCandidateId]),
           candidateSeedDigest: hash(["seed", rebirth.rebirthCandidateId]),
           state: "ELIGIBLE",
         });
         return { action: "REBIRTH_CANDIDATE_CREATED", candidateId: rebirth.rebirthCandidateId };
       }
    } else {
       // Seed initial civilization if none exists and no ruins
       const initialCivId = `civ_initial_${worldId}`;
       await upsertActiveCivilization({
         civilizationId: initialCivId,
         worldId,
         worldEpoch: 0,
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
