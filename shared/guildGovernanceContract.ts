export const AURION_GUILD_GOVERNANCE_RULESET_VERSION = "aurion-guild-governance.v1" as const;
export const AURION_GUILD_GOVERNANCE_CONTENT_VERSION = "aurion-guild-governance.d356881.v1" as const;
export const AURION_KINGDOM_MINIMUM_TERRITORIES = 6 as const;

export const guildCapabilities = [
  "member_manage",
  "diplomacy_manage",
  "territory_manage",
  "bank_deposit",
  "bank_withdraw",
  "building_manage",
  "kingdom_consolidate",
] as const;
export type GuildCapability = (typeof guildCapabilities)[number];

export const guildGovernanceOperations = [
  "grant_capability",
  "claim_territory",
  "release_territory",
  "consolidate_kingdom",
  "set_diplomacy",
] as const;
export type GuildGovernanceOperation = (typeof guildGovernanceOperations)[number];
export type GuildMembershipRole = "founder" | "officer" | "member" | "applicant";
export type GuildCapabilityScopeKind = "guild" | "territory" | "kingdom" | "diplomacy" | "bank" | "building";
export type GuildDiplomacyType = "alliance" | "trade" | "non_aggression" | "tribute" | "sanction" | "war";

export type GuildTerritoryCoordinate = Readonly<{
  territoryId: string;
  worldId: string;
  chunkX: number;
  chunkZ: number;
  guildId: string;
  state: "active" | "contested" | "released";
}>;

export type GuildMutationPlan = Readonly<{
  schemaVersion: 1;
  actorUserId: number;
  guildId: string;
  role: GuildMembershipRole;
  operation: GuildGovernanceOperation;
  requiredCapability: GuildCapability;
  expectedRevisionExact: string;
  idempotencyKey: string;
  resources: readonly string[];
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
  confirmationHash: string;
  ruleSetVersion: typeof AURION_GUILD_GOVERNANCE_RULESET_VERSION;
  contentVersion: typeof AURION_GUILD_GOVERNANCE_CONTENT_VERSION;
}>;

export type GuildGovernanceReceipt = Readonly<{
  receiptId: string;
  guildId: string;
  actorUserId: number;
  operation: GuildGovernanceOperation;
  expectedRevisionExact: string;
  resultingRevisionExact: string;
  idempotencyKey: string;
  confirmationHash: string;
  requestHash: string;
  resultHash: string;
  result: Readonly<Record<string, unknown>>;
  ruleSetVersion: typeof AURION_GUILD_GOVERNANCE_RULESET_VERSION;
  contentVersion: typeof AURION_GUILD_GOVERNANCE_CONTENT_VERSION;
}>;
