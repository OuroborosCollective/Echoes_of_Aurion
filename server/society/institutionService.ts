import {
  type Institution,
  type InstitutionMember,
  type InstitutionType,
  createInstitution,
} from "../../shared/aurionInstitutionContract";

export class InstitutionService {
  private institutionsById: Map<string, Institution> = new Map();
  private institutionsByWorld: Map<string, string[]> = new Map();

  clear(): void {
    this.institutionsById.clear();
    this.institutionsByWorld.clear();
  }

  async registerInstitution(institution: Institution): Promise<{ accepted: boolean; hash: string }> {
    this.institutionsById.set(institution.institutionId, Object.freeze({ ...institution }));
    const wList = this.institutionsByWorld.get(institution.worldId) ?? [];
    wList.push(institution.institutionId);
    this.institutionsByWorld.set(institution.worldId, wList);
    return { accepted: true, hash: institution.institutionHash };
  }

  async getInstitution(institutionId: string): Promise<Institution | null> {
    const inst = this.institutionsById.get(institutionId);
    return inst ? { ...inst } : null;
  }

  async getInstitutionsForWorld(worldId: string): Promise<Institution[]> {
    const ids = this.institutionsByWorld.get(worldId) ?? [];
    const res: Institution[] = [];
    for (const id of ids) {
      const inst = this.institutionsById.get(id);
      if (inst) res.push({ ...inst });
    }
    return res.sort((a, b) => a.institutionId.localeCompare(b.institutionId));
  }
}

export const globalInstitutionService = new InstitutionService();
