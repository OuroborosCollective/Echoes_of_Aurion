import type { GuildCapability, GuildMembershipRole } from "./guildGovernanceContract";

export const AURION_GUILD_BANK_RULESET_VERSION = "aurion-guild-bank.v1" as const;
export const AURION_GUILD_BANK_CONTENT_VERSION = "aurion-guild-bank.d356881.v1" as const;

export const guildBankOperations = [
  "deposit_points",
  "withdraw_points",
  "deposit_item",
  "withdraw_item",
  "donate_resource_item",
  "upgrade_building",
] as const;
export type GuildBankOperation = (typeof guildBankOperations)[number];
export type GuildItemRecordVersion = "legacy" | "aurion_v2";
export type GuildResourceKey = "wood" | "stone" | "aether";

export type GuildBankPlan = Readonly<{
  schemaVersion: 1;
  actorUserId: number;
  guildId: string;
  role: GuildMembershipRole;
  operation: GuildBankOperation;
  requiredCapability: GuildCapability;
  expectedRevisionExact: string;
  idempotencyKey: string;
  resources: readonly string[];
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
  confirmationHash: string;
  ruleSetVersion: typeof AURION_GUILD_BANK_RULESET_VERSION;
  contentVersion: typeof AURION_GUILD_BANK_CONTENT_VERSION;
}>;

export type GuildBankReceipt = Readonly<{
  receiptId: string;
  guildId: string;
  actorUserId: number;
  operation: GuildBankOperation;
  expectedRevisionExact: string;
  resultingRevisionExact: string;
  idempotencyKey: string;
  confirmationHash: string;
  requestHash: string;
  resultHash: string;
  result: Readonly<Record<string, unknown>>;
  ruleSetVersion: typeof AURION_GUILD_BANK_RULESET_VERSION;
  contentVersion: typeof AURION_GUILD_BANK_CONTENT_VERSION;
}>;

export type GuildBankBuildingProjection = Readonly<{
  buildingId: string;
  levelExact: string;
  maximumLevelExact: string;
  bonusesBps: Readonly<Record<string, number>>;
}>;

export type GuildBankGoal = Readonly<{
  id: "treasury_foundation" | "territory_union" | "bank_stewardship" | "construction_foundation";
  currentExact: string;
  targetExact: string;
  complete: boolean;
}>;
