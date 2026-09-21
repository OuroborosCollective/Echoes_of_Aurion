import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_INSTITUTION_SCHEMA = "aurion.institution.v1" as const;

export type InstitutionType =
  | "household"
  | "merchant_association"
  | "guard_unit"
  | "temple"
  | "craft_guild"
  | "village_council"
  | "faction_cell";

export interface InstitutionMember {
  npcId: string;
  role: "leader" | "officer" | "member" | "apprentice";
  joinedEpoch: number;
  standing: number; // 0 to 100
}

export interface Institution {
  schema: typeof AURION_INSTITUTION_SCHEMA;
  institutionId: string;
  worldId: string;
  name: string;
  institutionType: InstitutionType;
  regionId: string;
  settlementId?: string;
  members: InstitutionMember[];
  treasury: Record<string, string>; // currencyId -> quantity
  policies: Record<string, unknown>;
  foundedEpoch: number;
  sourceReceiptHash: string;
  sourceWorldRoot: string;
  institutionHash: string;
}

export interface CollectiveProposal {
  proposalId: string;
  institutionId: string;
  proposerNpcId: string;
  proposedAction: string;
  parameters: Record<string, unknown>;
  targetEpoch: number;
  votesFor: string[];
  votesAgainst: string[];
  status: "PROPOSED" | "RATIFIED" | "REJECTED" | "EXECUTED";
  resultingReceiptHash?: string;
}

export function computeInstitutionHash(
  inst: Omit<Institution, "institutionHash" | "schema">
): string {
  const structure = {
    schema: AURION_INSTITUTION_SCHEMA,
    institutionId: inst.institutionId,
    worldId: inst.worldId,
    name: inst.name,
    institutionType: inst.institutionType,
    regionId: inst.regionId,
    settlementId: inst.settlementId ?? null,
    members: inst.members.map(m => ({ ...m })).sort((a, b) => a.npcId.localeCompare(b.npcId)),
    treasury: { ...inst.treasury },
    policies: { ...inst.policies },
    foundedEpoch: inst.foundedEpoch,
    sourceReceiptHash: inst.sourceReceiptHash,
    sourceWorldRoot: inst.sourceWorldRoot,
  };
  return canonicalSha256(structure);
}

export function createInstitution(params: {
  institutionId: string;
  worldId: string;
  name: string;
  institutionType: InstitutionType;
  regionId: string;
  settlementId?: string;
  members: InstitutionMember[];
  treasury?: Record<string, string>;
  policies?: Record<string, unknown>;
  foundedEpoch: number;
  sourceReceiptHash: string;
  sourceWorldRoot: string;
}): Institution {
  const members = [...params.members].sort((a, b) => a.npcId.localeCompare(b.npcId));
  const treasury = params.treasury ?? {};
  const policies = params.policies ?? {};

  const hash = computeInstitutionHash({
    institutionId: params.institutionId,
    worldId: params.worldId,
    name: params.name,
    institutionType: params.institutionType,
    regionId: params.regionId,
    settlementId: params.settlementId,
    members,
    treasury,
    policies,
    foundedEpoch: params.foundedEpoch,
    sourceReceiptHash: params.sourceReceiptHash,
    sourceWorldRoot: params.sourceWorldRoot,
  });

  return {
    schema: AURION_INSTITUTION_SCHEMA,
    ...params,
    members,
    treasury,
    policies,
    institutionHash: hash,
  };
}

export function createProposal(params: {
  proposalId: string;
  institutionId: string;
  proposerNpcId: string;
  targetEpoch?: number;
  epoch?: number;
  title?: string;
  actionType?: string;
  proposedAction?: string;
  parameters?: Record<string, unknown>;
  actionPayload?: Record<string, unknown>;
  votesFor: string[];
  votesAgainst: string[];
  status?: "PROPOSED" | "RATIFIED" | "REJECTED" | "EXECUTED";
}): CollectiveProposal {
  return {
    proposalId: params.proposalId,
    institutionId: params.institutionId,
    proposerNpcId: params.proposerNpcId,
    targetEpoch: params.targetEpoch ?? params.epoch ?? 0,
    proposedAction: params.proposedAction ?? params.actionType ?? "POLICY_CHANGE",
    parameters: params.parameters ?? params.actionPayload ?? {},
    votesFor: [...params.votesFor].sort(),
    votesAgainst: [...params.votesAgainst].sort(),
    status: params.status ?? "PROPOSED",
  };
}
