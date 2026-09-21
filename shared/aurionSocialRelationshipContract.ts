import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_SOCIAL_RELATION_SCHEMA = "aurion.social.relation.v1" as const;

export type SocialRelationType =
  | "trust"
  | "friendship"
  | "kinship"
  | "debt"
  | "rivalry"
  | "fear"
  | "loyalty"
  | "employment"
  | "membership"
  | "mentor"
  | "enemy";

export interface SocialRelation {
  schema: typeof AURION_SOCIAL_RELATION_SCHEMA;
  relationId: string;
  worldId: string;
  subjectNpcId: string;
  objectEntityId: string;
  relationType: SocialRelationType;
  strength: number; // Integer scale -100 to +100
  validFromEpoch: number;
  validToEpoch: number | null;
  validFromReceipt: string;
  validToReceipt: string | null;
  sourceMemoryFactIds: string[];
  sourceWorldRoot: string;
  relationHash: string;
}

export function computeSocialRelationHash(
  relation: Omit<SocialRelation, "relationHash" | "schema">
): string {
  const structure = {
    schema: AURION_SOCIAL_RELATION_SCHEMA,
    relationId: relation.relationId,
    worldId: relation.worldId,
    subjectNpcId: relation.subjectNpcId,
    objectEntityId: relation.objectEntityId,
    relationType: relation.relationType,
    strength: relation.strength,
    validFromEpoch: relation.validFromEpoch,
    validToEpoch: relation.validToEpoch,
    validFromReceipt: relation.validFromReceipt,
    validToReceipt: relation.validToReceipt,
    sourceMemoryFactIds: [...relation.sourceMemoryFactIds].sort(),
    sourceWorldRoot: relation.sourceWorldRoot,
  };
  return canonicalSha256(structure);
}

export function createSocialRelation(params: {
  relationId: string;
  worldId: string;
  subjectNpcId: string;
  objectEntityId: string;
  relationType: SocialRelationType;
  strength: number;
  validFromEpoch: number;
  validToEpoch?: number | null;
  validFromReceipt: string;
  validToReceipt?: string | null;
  sourceMemoryFactIds?: string[];
  sourceWorldRoot: string;
}): SocialRelation {
  if (!Number.isInteger(params.strength) || params.strength < -100 || params.strength > 100) {
    throw new Error(`INVALID_STRENGTH: ${params.strength}. Must be integer between -100 and +100.`);
  }

  const validToEpoch = params.validToEpoch !== undefined ? params.validToEpoch : null;
  const validToReceipt = params.validToReceipt !== undefined ? params.validToReceipt : null;
  const sourceMemoryFactIds = params.sourceMemoryFactIds ? [...params.sourceMemoryFactIds].sort() : [];

  const hash = computeSocialRelationHash({
    relationId: params.relationId,
    worldId: params.worldId,
    subjectNpcId: params.subjectNpcId,
    objectEntityId: params.objectEntityId,
    relationType: params.relationType,
    strength: params.strength,
    validFromEpoch: params.validFromEpoch,
    validToEpoch,
    validFromReceipt: params.validFromReceipt,
    validToReceipt,
    sourceMemoryFactIds,
    sourceWorldRoot: params.sourceWorldRoot,
  });

  return {
    schema: AURION_SOCIAL_RELATION_SCHEMA,
    relationId: params.relationId,
    worldId: params.worldId,
    subjectNpcId: params.subjectNpcId,
    objectEntityId: params.objectEntityId,
    relationType: params.relationType,
    strength: params.strength,
    validFromEpoch: params.validFromEpoch,
    validToEpoch,
    validFromReceipt: params.validFromReceipt,
    validToReceipt,
    sourceMemoryFactIds,
    sourceWorldRoot: params.sourceWorldRoot,
    relationHash: hash,
  };
}

export function verifySocialRelationIntegrity(relation: SocialRelation): { valid: boolean; reason?: string } {
  if (relation.schema !== AURION_SOCIAL_RELATION_SCHEMA) return { valid: false, reason: "INVALID_SCHEMA" };
  if (!Number.isInteger(relation.strength) || relation.strength < -100 || relation.strength > 100) {
    return { valid: false, reason: "INVALID_STRENGTH" };
  }
  const expectedHash = computeSocialRelationHash(relation);
  if (expectedHash !== relation.relationHash) return { valid: false, reason: "HASH_MISMATCH" };
  return { valid: true };
}
