import {
  type SocialRelation,
  type SocialRelationType,
  createSocialRelation,
  verifySocialRelationIntegrity,
} from "../../shared/aurionSocialRelationshipContract";

export class SocialRelationshipService {
  private relationsById: Map<string, SocialRelation> = new Map();
  private relationsByNpc: Map<string, string[]> = new Map();
  private relationsByWorld: Map<string, string[]> = new Map();

  clear(): void {
    this.relationsById.clear();
    this.relationsByNpc.clear();
    this.relationsByWorld.clear();
  }

  async registerRelation(relation: SocialRelation): Promise<{ accepted: boolean; relationHash: string; reason?: string }> {
    const check = verifySocialRelationIntegrity(relation);
    if (!check.valid) {
      return { accepted: false, relationHash: relation.relationHash, reason: check.reason };
    }

    const existing = this.relationsById.get(relation.relationId);
    if (existing) {
      if (existing.relationHash === relation.relationHash) {
        return { accepted: true, relationHash: relation.relationHash };
      }
      return { accepted: false, relationHash: relation.relationHash, reason: "CONTRADICTING_RELATION_ID" };
    }

    this.relationsById.set(relation.relationId, Object.freeze({ ...relation }));

    const npcKey = `${relation.worldId}::${relation.subjectNpcId}`;
    const nList = this.relationsByNpc.get(npcKey) ?? [];
    nList.push(relation.relationId);
    this.relationsByNpc.set(npcKey, nList);

    const wList = this.relationsByWorld.get(relation.worldId) ?? [];
    wList.push(relation.relationId);
    this.relationsByWorld.set(relation.worldId, wList);

    return { accepted: true, relationHash: relation.relationHash };
  }

  async getActiveRelationsForNpcAtEpoch(worldId: string, npcId: string, epoch: number): Promise<SocialRelation[]> {
    const key = `${worldId}::${npcId}`;
    const ids = this.relationsByNpc.get(key) ?? [];
    const active: SocialRelation[] = [];

    for (const id of ids) {
      const rel = this.relationsById.get(id);
      if (rel && rel.validFromEpoch <= epoch && (rel.validToEpoch === null || rel.validToEpoch > epoch)) {
        active.push({ ...rel });
      }
    }

    return active.sort((a, b) => a.relationId.localeCompare(b.relationId));
  }

  async getRelationBetween(worldId: string, subjectNpcId: string, objectEntityId: string, epoch: number): Promise<SocialRelation | null> {
    const relations = await this.getActiveRelationsForNpcAtEpoch(worldId, subjectNpcId, epoch);
    const match = relations.find(r => r.objectEntityId === objectEntityId);
    return match ? { ...match } : null;
  }
}

export const globalSocialRelationshipService = new SocialRelationshipService();
