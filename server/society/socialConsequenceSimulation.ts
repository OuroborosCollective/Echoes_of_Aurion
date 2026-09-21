import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { type SocialRelation, createSocialRelation } from "../../shared/aurionSocialRelationshipContract";
import { SocialRelationshipService, globalSocialRelationshipService } from "./socialRelationshipService";

export interface WorldEvidenceSignal {
  signalId: string;
  worldId: string;
  epoch: number;
  type: "RESOURCE_SHORTAGE" | "WARFRONT_CAPTURE" | "ECONOMIC_SURPLUS" | "CRIME_OCCURRED";
  subjectPoiOrFactionId: string;
  severity: number; // 1 to 10
  sourceReceiptHash: string;
  worldRootHash: string;
}

export interface SocialConsequenceOutcome {
  outcomeId: string;
  epoch: number;
  affectedNpcIds: string[];
  relationMutations: SocialRelation[];
  consequenceReceiptHash: string;
}

export class SocialConsequenceSimulation {
  constructor(
    private readonly socialService: SocialRelationshipService = globalSocialRelationshipService
  ) {}

  /**
   * Deterministically evaluates social consequences from world/economic evidence signals.
   */
  async simulateConsequences(
    signal: WorldEvidenceSignal,
    npcContexts: { npcId: string; faction: string; profession: string; currentTrustInFaction: number }[]
  ): Promise<SocialConsequenceOutcome> {
    const affectedNpcIds: string[] = [];
    const relationMutations: SocialRelation[] = [];

    // Sort deterministically
    const sortedNpcs = [...npcContexts].sort((a, b) => a.npcId.localeCompare(b.npcId));

    for (const npc of sortedNpcs) {
      if (signal.type === "WARFRONT_CAPTURE") {
        const isAligned = npc.faction === signal.subjectPoiOrFactionId;
        const deltaTrust = isAligned ? signal.severity * 5 : -signal.severity * 5;
        const newTrust = Math.max(-100, Math.min(100, npc.currentTrustInFaction + deltaTrust));

        affectedNpcIds.push(npc.npcId);

        const rel = createSocialRelation({
          relationId: `rel_${signal.epoch}_${npc.npcId}_${signal.subjectPoiOrFactionId}`,
          worldId: signal.worldId,
          subjectNpcId: npc.npcId,
          objectEntityId: signal.subjectPoiOrFactionId,
          relationType: newTrust >= 0 ? "loyalty" : "rivalry",
          strength: newTrust,
          validFromEpoch: signal.epoch,
          validFromReceipt: signal.sourceReceiptHash,
          sourceMemoryFactIds: [`fact_signal_${signal.signalId}`],
          sourceWorldRoot: signal.worldRootHash,
        });

        relationMutations.push(rel);
        await this.socialService.registerRelation(rel);
      } else if (signal.type === "RESOURCE_SHORTAGE" && npc.profession === "blacksmith") {
        affectedNpcIds.push(npc.npcId);
        const rel = createSocialRelation({
          relationId: `rel_shortage_${signal.epoch}_${npc.npcId}`,
          worldId: signal.worldId,
          subjectNpcId: npc.npcId,
          objectEntityId: signal.subjectPoiOrFactionId,
          relationType: "fear",
          strength: Math.min(100, signal.severity * 10),
          validFromEpoch: signal.epoch,
          validFromReceipt: signal.sourceReceiptHash,
          sourceMemoryFactIds: [`fact_signal_${signal.signalId}`],
          sourceWorldRoot: signal.worldRootHash,
        });
        relationMutations.push(rel);
        await this.socialService.registerRelation(rel);
      }
    }

    const consequenceReceiptHash = canonicalSha256({
      action: "SOCIAL_CONSEQUENCE_SIMULATION",
      signalId: signal.signalId,
      epoch: signal.epoch,
      affectedNpcIds: [...affectedNpcIds].sort(),
      relationCount: relationMutations.length,
    });

    return {
      outcomeId: `soc_out_${signal.epoch}_${signal.signalId}`,
      epoch: signal.epoch,
      affectedNpcIds,
      relationMutations,
      consequenceReceiptHash,
    };
  }
}

export const globalSocialConsequenceSimulation = new SocialConsequenceSimulation();
