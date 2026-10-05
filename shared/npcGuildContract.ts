/**
 * NPC Guild Contract — Aurion-owned.
 *
 * Defines the canonical contract types for NPC-driven guilds. Unlike the
 * player-facing guild governance contract (which requires an authenticated
 * human `actorUserId`), this contract is driven entirely by Aurion NPC
 * lifecycle agents. NPCs found guilds, elect leaders, set trade policy, and
 * conduct diplomacy — all through deterministic, receipt-bound operations.
 *
 * This is NOT a second authority. It is an Aurion-native contract that extends
 * guild and economy systems to autonomous NPCs, following the same plan →
 * validate → receipt pattern as the player guild contracts.
 */

export const AURION_NPC_GUILD_RULESET_VERSION = "aurion-npc-guild.v1" as const;
export const AURION_NPC_GUILD_CONTENT_VERSION = "aurion-npc-guild.v1" as const;

/** Maximum members per NPC guild. */
export const NPC_GUILD_MAX_MEMBERS = 16;

/** Minimum votes required for a leadership election to be valid. */
export const NPC_GUILD_MIN_ELECTION_VOTES = 2;

/** Operations that NPC guild agents can perform. */
export const npcGuildOperations = [
  "found_guild",
  "elect_leader",
  "join_guild",
  "leave_guild",
  "set_trade_policy",
  "set_diplomacy",
] as const;
export type NpcGuildOperation = (typeof npcGuildOperations)[number];

/** Roles within an NPC guild. */
export const npcGuildRoles = ["leader", "merchant", "trader", "prospector"] as const;
export type NpcGuildRole = (typeof npcGuildRoles)[number];

/** Trade policies an NPC guild can adopt. */
export const npcGuildTradePolicies = [
  "free_trade",
  "protectionist",
  "caravan_focused",
  "self_sufficient",
] as const;
export type NpcGuildTradePolicy = (typeof npcGuildTradePolicies)[number];

/** Diplomacy stances between NPC guilds. */
export const npcGuildDiplomacyTypes = ["alliance", "trade_pact", "neutral", "rivalry"] as const;
export type NpcGuildDiplomacyType = (typeof npcGuildDiplomacyTypes)[number];

/** A single NPC's vote in a leadership election. */
export type NpcGuildVote = Readonly<{
  voterNpcId: string;
  candidateNpcId: string;
  weightBps: number;
  reason: string;
}>;

/** An NPC guild member. */
export type NpcGuildMember = Readonly<{
  npcId: string;
  hubId: string;
  role: NpcGuildRole;
  joinedCycle: number;
}>;

/** The state of an NPC guild. */
export type NpcGuildState = Readonly<{
  guildId: string;
  name: string;
  hubId: string;
  leaderNpcId: string;
  members: readonly NpcGuildMember[];
  tradePolicy: NpcGuildTradePolicy;
  treasuryCopper: number;
  foundedCycle: number;
  lastElectionCycle: number;
  diplomacy: readonly Readonly<{
    targetGuildId: string;
    stance: NpcGuildDiplomacyType;
    sinceCycle: number;
  }>[];
  revision: number;
  stateHash: string;
}>;

/** A mutation plan for an NPC guild operation. */
export type NpcGuildMutationPlan = Readonly<{
  schemaVersion: 1;
  guildId: string;
  actorNpcId: string;
  hubId: string;
  operation: NpcGuildOperation;
  expectedRevision: number;
  idempotencyKey: string;
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
  confirmationHash: string;
  ruleSetVersion: typeof AURION_NPC_GUILD_RULESET_VERSION;
  contentVersion: typeof AURION_NPC_GUILD_CONTENT_VERSION;
}>;

/** A receipt for a confirmed NPC guild operation. */
export type NpcGuildReceipt = Readonly<{
  receiptId: string;
  guildId: string;
  actorNpcId: string;
  operation: NpcGuildOperation;
  expectedRevision: number;
  resultingRevision: number;
  idempotencyKey: string;
  confirmationHash: string;
  requestHash: string;
  resultHash: string;
  result: Readonly<Record<string, unknown>>;
  ruleSetVersion: typeof AURION_NPC_GUILD_RULESET_VERSION;
  contentVersion: typeof AURION_NPC_GUILD_CONTENT_VERSION;
}>;

/** Result of a leadership election. */
export type NpcGuildElectionResult = Readonly<{
  winnerNpcId: string;
  totalVotes: number;
  votes: readonly NpcGuildVote[];
  electionHash: string;
}>;
