import { sql } from "drizzle-orm";
import { boolean, check, float, index, int, mediumtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Local Aurion credentials are kept separate from the player profile and OAuth identity metadata. */
export const localCredentials = mysqlTable("localCredentials", {
  userId: int("userId").primaryKey(),
  handle: varchar("handle", { length: 32 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  failedAttempts: int("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** A one-time issued pairing authority for an external MCP-capable LLM client. */
export const gatewaySessions = mysqlTable("gatewaySessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  providerLabel: varchar("providerLabel", { length: 120 }).notNull(),
  tokenDigest: varchar("tokenDigest", { length: 128 }).notNull().unique(),
  allowedCommands: text("allowedCommands").notNull(),
  status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("gatewaySessions_userId_idx").on(table.userId)]);

/** Immutable normalized game commands; model prose and provider tokens are never stored here. */
export const gatewayCommands = mysqlTable("gatewayCommands", {
  id: varchar("id", { length: 64 }).primaryKey(),
  gatewaySessionId: varchar("gatewaySessionId", { length: 64 }).notNull(),
  sequence: int("sequence").notNull(),
  command: varchar("command", { length: 1 }).notNull(),
  source: varchar("source", { length: 32 }).default("authorized-mcp").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("gatewayCommands_session_sequence_uq").on(table.gatewaySessionId, table.sequence),
  index("gatewayCommands_session_created_idx").on(table.gatewaySessionId, table.createdAt),
]);

/** One-time, short-lived authority for a browser to enter one read-only realtime zone. */
export const zoneConnectionTickets = mysqlTable("zoneConnectionTickets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  zoneId: mysqlEnum("zoneId", ["observatory_threshold"]).notNull(),
  ticketDigest: varchar("ticketDigest", { length: 128 }).notNull().unique(),
  clientBuild: varchar("clientBuild", { length: 120 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("zoneConnectionTickets_user_created_idx").on(table.userId, table.createdAt),
  index("zoneConnectionTickets_zone_expiry_idx").on(table.zoneId, table.expiresAt),
]);

export type GatewaySession = typeof gatewaySessions.$inferSelect;
export type GatewayCommand = typeof gatewayCommands.$inferSelect;
export type ZoneConnectionTicket = typeof zoneConnectionTickets.$inferSelect;

/** Server-authoritative player state. Browser clients render this state but never mutate it directly. */
export const playerProfiles = mysqlTable("playerProfiles", {
  userId: int("userId").primaryKey(),
  level: int("level").default(1).notNull(),
  totalXp: int("totalXp").default(0).notNull(),
  aurionPoints: int("aurionPoints").default(0).notNull(),
  victories: int("victories").default(0).notNull(),
  seasonPoints: int("seasonPoints").default(0).notNull(),
  selectedClass: mysqlEnum("selectedClass", ["unbound", "vanguard", "seer", "warden"]).default("unbound").notNull(),
  classChosenAt: timestamp("classChosenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** An active season owns the current `seasonPoints` window; closed seasons retain immutable result snapshots. */
export const seasons = mysqlTable("seasons", {
  id: varchar("id", { length: 64 }).primaryKey(),
  seasonKey: varchar("seasonKey", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["active", "closed"]).default("active").notNull(),
  startsAt: timestamp("startsAt").defaultNow().notNull(),
  endsAt: timestamp("endsAt"),
  createdByUserId: int("createdByUserId").notNull(),
  closedByUserId: int("closedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("seasons_status_starts_idx").on(table.status, table.startsAt)]);

/** Immutable player standings captured immediately before a confirmed season reset. */
export const seasonLeaderboardSnapshots = mysqlTable("seasonLeaderboardSnapshots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  seasonId: varchar("seasonId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  level: int("level").notNull(),
  seasonPoints: int("seasonPoints").notNull(),
  victories: int("victories").notNull(),
  selectedClass: mysqlEnum("selectedClass", ["unbound", "vanguard", "seer", "warden"]).notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("seasonLeaderboardSnapshots_season_user_uq").on(table.seasonId, table.userId),
  index("seasonLeaderboardSnapshots_season_rank_idx").on(table.seasonId, table.seasonPoints, table.victories, table.level),
]);

/** Idempotent administrative evidence for starting or rotating a season. */
export const seasonTransitionReceipts = mysqlTable("seasonTransitionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  action: mysqlEnum("action", ["start", "rotate"]).notNull(),
  fromSeasonId: varchar("fromSeasonId", { length: 64 }),
  toSeasonId: varchar("toSeasonId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("seasonTransitionReceipts_idempotency_uq").on(table.idempotencyKey)]);

/** Append-only progression evidence. Every grant carries a unique source key to prevent retries from duplicating rewards. */
export const progressionLedger = mysqlTable("progressionLedger", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["xp", "points", "victory", "weapon_xp", "guild_contribution"]).notNull(),
  delta: int("delta").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 240 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("progressionLedger_idempotency_uq").on(table.idempotencyKey),
  index("progressionLedger_user_created_idx").on(table.userId, table.createdAt),
]);

/** One player-owned row per authored quest. Completion may only be written by the encounter resolver. */
export const gameplayQuestProgress = mysqlTable("gameplayQuestProgress", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  questKey: varchar("questKey", { length: 64 }).notNull(),
  state: mysqlEnum("state", ["active", "ready_to_turn_in", "completed"]).notNull(),
  acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
  readyAt: timestamp("readyAt"),
  completedAt: timestamp("completedAt"),
  completionSessionId: varchar("completionSessionId", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("gameplayQuestProgress_user_quest_uq").on(table.userId, table.questKey),
  index("gameplayQuestProgress_user_state_idx").on(table.userId, table.state),
]);

/** Dungeon keys are non-transferable progression entitlements, not client-held strings. */
export const gameplayDungeonKeys = mysqlTable("gameplayDungeonKeys", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  keyName: varchar("keyName", { length: 64 }).notNull(),
  grantedByQuest: varchar("grantedByQuest", { length: 64 }).notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("gameplayDungeonKeys_user_key_uq").on(table.userId, table.keyName),
  index("gameplayDungeonKeys_user_granted_idx").on(table.userId, table.grantedAt),
]);

/** A server-owned boss-state container. Browser rendering must synchronize from this record. */
export const gameplaySessions = mysqlTable("gameplaySessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  encounterKey: varchar("encounterKey", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["active", "completed", "abandoned"]).default("active").notNull(),
  bossHp: int("bossHp").notNull(),
  maxBossHp: int("maxBossHp").notNull(),
  nextSequence: int("nextSequence").default(1).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("gameplaySessions_user_status_idx").on(table.userId, table.status, table.updatedAt),
]);

/** Append-only accepted action evidence. Damage is calculated on the server from the normalized command. */
export const gameplayActionReceipts = mysqlTable("gameplayActionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  sequence: int("sequence").notNull(),
  command: varchar("command", { length: 1 }).notNull(),
  action: varchar("action", { length: 24 }).notNull(),
  source: mysqlEnum("source", ["human", "gateway"]).notNull(),
  damage: int("damage").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("gameplayActionReceipts_session_sequence_uq").on(table.sessionId, table.sequence),
  index("gameplayActionReceipts_user_created_idx").on(table.userId, table.createdAt),
]);

/** Guild identity is deliberately separate from membership and contribution history. */
export const guilds = mysqlTable("guilds", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 48 }).notNull().unique(),
  tag: varchar("tag", { length: 8 }).notNull().unique(),
  founderUserId: int("founderUserId").notNull(),
  level: int("level").default(1).notNull(),
  seasonPoints: int("seasonPoints").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const guildMemberships = mysqlTable("guildMemberships", {
  id: varchar("id", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["founder", "officer", "member", "applicant"]).default("member").notNull(),
  status: mysqlEnum("status", ["active", "left", "removed", "pending"]).default("active").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("guildMemberships_guild_user_uq").on(table.guildId, table.userId),
  index("guildMemberships_user_status_idx").on(table.userId, table.status),
]);

export const guildContributionLedger = mysqlTable("guildContributionLedger", {
  id: varchar("id", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  activityKey: varchar("activityKey", { length: 96 }).notNull(),
  points: int("points").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("guildContributionLedger_idempotency_uq").on(table.idempotencyKey),
  index("guildContributionLedger_guild_created_idx").on(table.guildId, table.createdAt),
]);

/** Weapon XP comes only from validated game results; it is never a client-side counter. */
export const weaponMasteries = mysqlTable("weaponMasteries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  weaponTrack: mysqlEnum("weaponTrack", ["blade", "staff", "spear", "focus"]).notNull(),
  xp: int("xp").default(0).notNull(),
  level: int("level").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("weaponMasteries_user_track_uq").on(table.userId, table.weaponTrack)]);

/** Exactly one server-owned active weapon track per player; browser action labels never choose it. */
export const weaponLoadouts = mysqlTable("weaponLoadouts", {
  userId: int("userId").primaryKey(),
  weaponTrack: mysqlEnum("weaponTrack", ["blade", "staff", "spear", "focus"]).notNull(),
  configuredAt: timestamp("configuredAt").defaultNow().onUpdateNow().notNull(),
});

/** Append-only exact skill progression derived only from a confirmed Aurion action receipt. */
export const skillProgressionEvents = mysqlTable("skillProgressionEvents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  skillId: mysqlEnum("skillId", ["woodcutting", "mining", "fishing", "combat", "crafting"]).notNull(),
  amountExact: varchar("amountExact", { length: 128 }).notNull(),
  source: mysqlEnum("source", ["npc_kill", "resource_gather", "crafting", "quest_reward"]).notNull(),
  resultReceiptId: varchar("resultReceiptId", { length: 64 }).notNull(),
  receiptKind: mysqlEnum("receiptKind", ["expedition_result", "crafting"]).default("expedition_result").notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("skillProgressionEvents_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("skillProgressionEvents_user_receipt_skill_uq").on(table.userId, table.resultReceiptId, table.skillId),
  index("skillProgressionEvents_user_skill_created_idx").on(table.userId, table.skillId, table.createdAt),
]);

/** Canonical server-confirmed link between result, loot, mastery, XP, and level projection. */
export const aurionProgressionReceipts = mysqlTable("aurionProgressionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  characterId: varchar("characterId", { length: 128 }).notNull(),
  actionKind: mysqlEnum("actionKind", ["encounter", "weapon_use", "skill_use", "loot_claim"]).notNull(),
  weaponTrack: varchar("weaponTrack", { length: 64 }).notNull(),
  skillId: varchar("skillId", { length: 96 }).notNull(),
  resultReceiptId: varchar("resultReceiptId", { length: 128 }).notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 128 }).notNull(),
  lootReceiptId: varchar("lootReceiptId", { length: 128 }),
  masteryEventId: varchar("masteryEventId", { length: 128 }),
  xpGrantedExact: varchar("xpGrantedExact", { length: 128 }).notNull(),
  levelExact: varchar("levelExact", { length: 128 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionProgressionReceipts_user_character_result_uq").on(table.userId, table.characterId, table.resultReceiptId),
  uniqueIndex("aurionProgressionReceipts_hash_uq").on(table.receiptHash),
  uniqueIndex("aurionProgressionReceipts_idempotency_uq").on(table.idempotencyKey),
  index("aurionProgressionReceipts_user_created_idx").on(table.userId, table.createdAt),
]);

/** Append-only identity ledger for migration source files and manifests. */
export const aurionContentHashLedger = mysqlTable("aurionContentHashLedger", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceRevision: varchar("sourceRevision", { length: 256 }).notNull(),
  sourcePath: varchar("sourcePath", { length: 512 }).notNull(),
  fileHash: varchar("fileHash", { length: 64 }).notNull(),
  manifestHash: varchar("manifestHash", { length: 64 }).notNull(),
  migrationTag: varchar("migrationTag", { length: 128 }).notNull(),
  contentKind: mysqlEnum("contentKind", ["sql", "schema", "protocol", "manifest", "asset"]).notNull(),
  sourceSizeBytes: int("sourceSizeBytes").notNull(),
  identityHash: varchar("identityHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionContentHashLedger_identity_uq").on(table.identityHash),
  uniqueIndex("aurionContentHashLedger_source_revision_path_uq").on(table.sourceRevision, table.sourcePath),
  index("aurionContentHashLedger_migration_created_idx").on(table.migrationTag, table.createdAt),
]);

/** Redacted root-only audit evidence; status is fail-closed for unreadable or drifting sources. */
export const aurionContentHashAuditReceipts = mysqlTable("aurionContentHashAuditReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ledgerId: varchar("ledgerId", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["VERIFIED", "DRIFT", "UNREADABLE"]).notNull(),
  checkedCount: int("checkedCount").notNull(),
  driftCount: int("driftCount").notNull(),
  evidenceDigest: varchar("evidenceDigest", { length: 64 }).notNull(),
  redactedJson: text("redactedJson").notNull(),
  createdByRole: varchar("createdByRole", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionContentHashAuditReceipts_evidence_uq").on(table.evidenceDigest),
  index("aurionContentHashAuditReceipts_status_created_idx").on(table.status, table.createdAt),
]);

/** Versioned loot bases cover weapons, armor, accessories, foci and crafting components without client-defined item types. */
export const aurionLootBaseDefinitions = mysqlTable("aurionLootBaseDefinitions", {
  id: varchar("id", { length: 96 }).primaryKey(),
  category: mysqlEnum("category", ["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"]).notNull(),
  equipmentSlot: mysqlEnum("equipmentSlot", ["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet", "belt", "ring", "amulet", "focus", "relic"]),
  familyId: varchar("familyId", { length: 64 }).notNull(),
  minItemLevelExact: varchar("minItemLevelExact", { length: 128 }).notNull(),
  maxItemLevelExact: varchar("maxItemLevelExact", { length: 128 }),
  baseStatsJson: text("baseStatsJson").notNull(),
  affixSlotsJson: text("affixSlotsJson").notNull(),
  tagsJson: text("tagsJson").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("aurionLootBaseDefinitions_active_category_idx").on(table.active, table.category)]);

/** Data-driven affixes are explicit about level bands, exclusions and integer value ranges. */
export const aurionLootAffixDefinitions = mysqlTable("aurionLootAffixDefinitions", {
  id: varchar("id", { length: 96 }).primaryKey(),
  slot: mysqlEnum("slot", ["prefix", "suffix", "implicit", "corruption", "craft"]).notNull(),
  groupId: varchar("groupId", { length: 64 }).notNull(),
  minItemLevelExact: varchar("minItemLevelExact", { length: 128 }).notNull(),
  maxItemLevelExact: varchar("maxItemLevelExact", { length: 128 }),
  allowedCategoriesJson: text("allowedCategoriesJson").notNull(),
  requiredTagsJson: text("requiredTagsJson").notNull(),
  excludesGroupIdsJson: text("excludesGroupIdsJson").notNull(),
  statRangesJson: text("statRangesJson").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("aurionLootAffixDefinitions_active_slot_idx").on(table.active, table.slot)]);

/** A set is catalog data; each active threshold derives only from currently equipped confirmed item instances. */
export const aurionLootSetDefinitions = mysqlTable("aurionLootSetDefinitions", {
  id: varchar("id", { length: 96 }).primaryKey(),
  pieceBaseItemIdsJson: text("pieceBaseItemIdsJson").notNull(),
  bonusesByPiecesJson: text("bonusesByPiecesJson").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("aurionLootSetDefinitions_active_idx").on(table.active)]);

/** One confirmed, currently equipped item per player slot. Ownership and slot category are rechecked by the service. */
export const aurionEquipmentSlots = mysqlTable("aurionEquipmentSlots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  slot: mysqlEnum("slot", ["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet", "belt", "ring", "amulet", "focus", "relic"]).notNull(),
  itemRecordVersion: mysqlEnum("itemRecordVersion", ["legacy", "aurion_v2"]).default("aurion_v2").notNull(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  equippedAt: timestamp("equippedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionEquipmentSlots_user_slot_uq").on(table.userId, table.slot),
  uniqueIndex("aurionEquipmentSlots_item_uq").on(table.itemId),
  index("aurionEquipmentSlots_user_equipped_idx").on(table.userId, table.equippedAt),
]);

/** Cap-free BigInt mastery events; authorization remains outside this readmodel ledger. */
export const aurionMasteryEvents = mysqlTable("aurionMasteryEvents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  disciplineId: varchar("disciplineId", { length: 64 }).notNull(),
  source: mysqlEnum("source", ["encounter", "quest", "crafting", "shaping", "civic", "diplomacy", "world_stewardship"]).notNull(),
  amountExact: varchar("amountExact", { length: 128 }).notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 64 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionMasteryEvents_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionMasteryEvents_user_receipt_discipline_uq").on(table.userId, table.sourceReceiptId, table.disciplineId),
  index("aurionMasteryEvents_user_discipline_created_idx").on(table.userId, table.disciplineId, table.createdAt),
]);

/** Moral alignment uses bounded, receipt-bound integer deltas. Auras are derived readmodel data, not permissions. */
export const aurionEthosEvents = mysqlTable("aurionEthosEvents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 64 }).notNull(),
  deltasBpsJson: text("deltasBpsJson").notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionEthosEvents_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionEthosEvents_user_receipt_uq").on(table.userId, table.sourceReceiptId),
  index("aurionEthosEvents_user_created_idx").on(table.userId, table.createdAt),
]);

/** V2 receipts preserve the complete deterministic loot context and permit exact item levels beyond legacy integer bounds. */
export const aurionLootDropReceiptsV2 = mysqlTable("aurionLootDropReceiptsV2", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  encounterReceiptId: varchar("encounterReceiptId", { length: 64 }).notNull(),
  itemDefinitionId: varchar("itemDefinitionId", { length: 96 }).notNull(),
  category: mysqlEnum("category", ["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"]).notNull(),
  quality: mysqlEnum("quality", ["normal", "magic", "rare", "set", "unique", "mythic"]).notNull(),
  itemLevelExact: varchar("itemLevelExact", { length: 128 }).notNull(),
  setId: varchar("setId", { length: 96 }),
  resolvedJson: text("resolvedJson").notNull(),
  contextHash: varchar("contextHash", { length: 64 }).notNull(),
  deterministicHash: varchar("deterministicHash", { length: 64 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionLootDropReceiptsV2_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionLootDropReceiptsV2_user_encounter_uq").on(table.userId, table.encounterReceiptId),
  index("aurionLootDropReceiptsV2_user_created_idx").on(table.userId, table.createdAt),
]);

/** V2 items are immutable snapshots of their resolved receipt and never accept browser-defined affixes or values. */
export const aurionItemInstancesV2 = mysqlTable("aurionItemInstancesV2", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  lootReceiptId: varchar("lootReceiptId", { length: 64 }).notNull().unique(),
  baseItemDefinitionId: varchar("baseItemDefinitionId", { length: 96 }).notNull(),
  category: mysqlEnum("category", ["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"]).notNull(),
  equipmentSlot: mysqlEnum("equipmentSlot", ["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet", "belt", "ring", "amulet", "focus", "relic"]),
  quality: mysqlEnum("quality", ["normal", "magic", "rare", "set", "unique", "mythic"]).notNull(),
  itemLevelExact: varchar("itemLevelExact", { length: 128 }).notNull(),
  affixesJson: text("affixesJson").notNull(),
  setId: varchar("setId", { length: 96 }),
  itemPower: int("itemPower").notNull(),
  deterministicHash: varchar("deterministicHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["owned", "listed", "sold", "consumed", "guild_custody", "pending_pickup", "equipped"]).default("owned").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionItemInstancesV2_loot_receipt_uq").on(table.lootReceiptId),
  index("aurionItemInstancesV2_owner_status_created_idx").on(table.ownerUserId, table.status, table.createdAt),
]);

/** Immutable, versioned world resolution evidence. Effects are rendered only after this row is confirmed. */
export const aurionWorldResolutions = mysqlTable("aurionWorldResolutions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  regionId: varchar("regionId", { length: 96 }).notNull(),
  worldSeedDigest: varchar("worldSeedDigest", { length: 64 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  signalsJson: text("signalsJson").notNull(),
  reactionJson: text("reactionJson").notNull(),
  reactionHash: varchar("reactionHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionWorldResolutions_region_index_uq").on(table.regionId, table.resolutionIndex),
  uniqueIndex("aurionWorldResolutions_reaction_hash_uq").on(table.reactionHash),
  index("aurionWorldResolutions_region_created_idx").on(table.regionId, table.createdAt),
]);

/** Global, server-owned world state. It records the scale high-water mark and the latest confirmed deterministic world snapshot. */
export const aurionGlobalWorldStates = mysqlTable("aurionGlobalWorldStates", {
  worldId: varchar("worldId", { length: 64 }).primaryKey(),
  worldSeed: varchar("worldSeed", { length: 128 }).notNull(),
  epoch: int("epoch").notNull(),
  activePlayerCount: int("activePlayerCount").notNull(),
  highWaterPlayerCount: int("highWaterPlayerCount").notNull(),
  snapshotJson: text("snapshotJson").notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull().unique(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Immutable replay receipt for each confirmed global world epoch. */
export const aurionGlobalWorldEpochReceipts = mysqlTable("aurionGlobalWorldEpochReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  activePlayerCount: int("activePlayerCount").notNull(),
  highWaterPlayerCount: int("highWaterPlayerCount").notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),
  snapshotJson: text("snapshotJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGlobalWorldEpochReceipts_world_epoch_uq").on(table.worldId, table.epoch),
  uniqueIndex("aurionGlobalWorldEpochReceipts_hash_uq").on(table.snapshotHash),
  index("aurionGlobalWorldEpochReceipts_world_created_idx").on(table.worldId, table.createdAt),
]);

/** Authoritative deviations from the seed-generated chunk base. Untouched terrain and resource nodes are never stored here. */
export const aurionWorldChunkDeltas = mysqlTable("aurionWorldChunkDeltas", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  chunkX: int("chunkX").notNull(),
  chunkZ: int("chunkZ").notNull(),
  baseRevision: int("baseRevision").notNull(),
  sequence: int("sequence").notNull(),
  kind: mysqlEnum("kind", ["resource_depleted", "structure_placed", "structure_removed", "road_built"]).notNull(),
  targetId: varchar("targetId", { length: 128 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  deterministicHash: varchar("deterministicHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionWorldChunkDeltas_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionWorldChunkDeltas_hash_uq").on(table.deterministicHash),
  uniqueIndex("aurionWorldChunkDeltas_chunk_sequence_uq").on(table.worldId, table.chunkX, table.chunkZ, table.sequence),
  index("aurionWorldChunkDeltas_chunk_created_idx").on(table.worldId, table.chunkX, table.chunkZ, table.createdAt),
]);

/** Deterministic conflict outcomes are evidence only; the seed-generated base world is never persisted. */
export const aurionWorldChunkDeltaConflicts = mysqlTable("aurionWorldChunkDeltaConflicts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  chunkX: int("chunkX").notNull(),
  chunkZ: int("chunkZ").notNull(),
  baseRevision: int("baseRevision").notNull(),
  sequence: int("sequence").notNull(),
  leftHash: varchar("leftHash", { length: 64 }).notNull(),
  rightHash: varchar("rightHash", { length: 64 }).notNull(),
  winnerId: varchar("winnerId", { length: 64 }).notNull(),
  resolutionHash: varchar("resolutionHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionWorldChunkDeltaConflicts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionWorldChunkDeltaConflicts_resolution_hash_uq").on(table.resolutionHash),
  uniqueIndex("aurionWorldChunkDeltaConflicts_scope_uq").on(table.worldId, table.chunkX, table.chunkZ, table.baseRevision, table.sequence),
  index("aurionWorldChunkDeltaConflicts_world_created_idx").on(table.worldId, table.createdAt),
]);

/** Server-observed zone connection leases. A browser cannot author a presence record without consuming a one-time zone ticket. */
export const aurionWorldPresenceLeases = mysqlTable("aurionWorldPresenceLeases", {
  connectionId: varchar("connectionId", { length: 96 }).primaryKey(),
  userId: int("userId").notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  chunkX: int("chunkX").notNull(),
  chunkZ: int("chunkZ").notNull(),
  positionX: int("positionX").notNull(),
  positionZ: int("positionZ").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  disconnectedAt: timestamp("disconnectedAt"),
}, table => [
  index("aurionWorldPresenceLeases_active_idx").on(table.expiresAt, table.disconnectedAt),
  index("aurionWorldPresenceLeases_user_active_idx").on(table.userId, table.expiresAt),
]);

/** Immutable idempotency evidence for a requested global world epoch. */
export const aurionWorldEpochRequests = mysqlTable("aurionWorldEpochRequests", {
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  requestedByUserId: int("requestedByUserId").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  epoch: int("epoch").notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),
  snapshotJson: text("snapshotJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionWorldEpochRequests_world_epoch_idx").on(table.worldId, table.epoch),
  index("aurionWorldEpochRequests_hash_idx").on(table.snapshotHash),
]);

/** Immutable, bounded ecology/economy/society reaction derived during the explicit global epoch transaction. */
export const aurionWorldEpochReactions = mysqlTable("aurionWorldEpochReactions", {
  receiptId: varchar("receiptId", { length: 96 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),
  reactionHash: varchar("reactionHash", { length: 64 }).notNull(),
  reactionJson: text("reactionJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionWorldEpochReactions_world_epoch_uq").on(table.worldId, table.epoch),
  uniqueIndex("aurionWorldEpochReactions_hash_uq").on(table.reactionHash),
  index("aurionWorldEpochReactions_world_created_idx").on(table.worldId, table.createdAt),
]);

/** Idempotent materialization of confirmed epoch reactions and presence evidence. */
export const aurionWorldEpochMaterializations = mysqlTable("aurionWorldEpochMaterializations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  reactionReceiptId: varchar("reactionReceiptId", { length: 96 }).notNull(),
  reactionHash: varchar("reactionHash", { length: 64 }).notNull(),
  presenceDigest: varchar("presenceDigest", { length: 64 }).notNull(),
  presenceJson: text("presenceJson").notNull(),
  materializationJson: text("materializationJson").notNull(),
  materializationHash: varchar("materializationHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionWorldEpochMaterializations_world_epoch_uq").on(table.worldId, table.epoch),
  uniqueIndex("aurionWorldEpochMaterializations_resolution_uq").on(table.worldId, table.resolutionIndex),
  uniqueIndex("aurionWorldEpochMaterializations_hash_uq").on(table.materializationHash),
  uniqueIndex("aurionWorldEpochMaterializations_idempotency_uq").on(table.idempotencyKey),
  index("aurionWorldEpochMaterializations_world_created_idx").on(table.worldId, table.createdAt),
]);

/** Latest bounded NPC needs/memory state. Full causal decisions remain in the receipt table. */
export const aurionNpcStates = mysqlTable("aurionNpcStates", {
  npcId: varchar("npcId", { length: 96 }).primaryKey(),
  regionId: varchar("regionId", { length: 96 }).notNull(),
  needsJson: text("needsJson").notNull(),
  memoryJson: text("memoryJson").notNull(),
  languageProfileId: varchar("languageProfileId", { length: 96 }).notNull(),
  lastResolutionIndex: int("lastResolutionIndex").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("aurionNpcStates_region_updated_idx").on(table.regionId, table.updatedAt)]);

/** One NPC decision per stable resolution prevents retries from producing new behaviour. */
export const aurionNpcDecisionReceipts = mysqlTable("aurionNpcDecisionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  regionId: varchar("regionId", { length: 96 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  observationIdsJson: text("observationIdsJson").notNull(),
  goal: varchar("goal", { length: 64 }).notNull(),
  decisionHash: varchar("decisionHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcDecisionReceipts_npc_index_uq").on(table.npcId, table.resolutionIndex),
  uniqueIndex("aurionNpcDecisionReceipts_hash_uq").on(table.decisionHash),
  index("aurionNpcDecisionReceipts_region_created_idx").on(table.regionId, table.createdAt),
]);

/** Append-only WASD-derived multi-memory; old decision and account-memory receipts retain their formats. */
export const aurionNpcMemoryReceiptsV4 = mysqlTable("aurionNpcMemoryReceiptsV4", {
  id: varchar("id", { length: 64 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  sourceDecisionReceiptId: varchar("sourceDecisionReceiptId", { length: 64 }).notNull(),
  sourceDecisionSha256: varchar("sourceDecisionSha256", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 64 }).notNull(),
  previousReceiptId: varchar("previousReceiptId", { length: 64 }),
  previousMemoryHash: varchar("previousMemoryHash", { length: 64 }).notNull(),
  memoryHash: varchar("memoryHash", { length: 64 }).notNull(),
  memoryJson: mediumtext("memoryJson").notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  check("aurionNpcMemoryReceiptsV4_index_ck", sql`${table.resolutionIndex} >= 0`),
  check("aurionNpcMemoryReceiptsV4_bytes_ck", sql`octet_length(${table.memoryJson}) <= 262144`),
  uniqueIndex("aurionNpcMemoryReceiptsV4_npc_index_uq").on(table.npcId, table.resolutionIndex),
  uniqueIndex("aurionNpcMemoryReceiptsV4_source_uq").on(table.sourceDecisionReceiptId),
  uniqueIndex("aurionNpcMemoryReceiptsV4_hash_uq").on(table.receiptHash),
]);

/** AIM-293 host evidence state for one merchant hub. WASD owns action rules; Aurion owns the locked persisted epoch. */
export const aurionNpcActionEpochStates = mysqlTable("aurionNpcActionEpochStates", {
  hubId: varchar("hubId", { length: 96 }).primaryKey(),
  active: boolean("active").default(true).notNull(),
  marketVersion: int("marketVersion").notNull(),
  marketJson: text("marketJson").notNull(),
  marketHash: varchar("marketHash", { length: 64 }).notNull(),
  inventoryJson: text("inventoryJson").notNull(),
  inventoryHash: varchar("inventoryHash", { length: 64 }).notNull(),
  polityVersion: int("polityVersion").notNull(),
  polityId: varchar("polityId", { length: 96 }).notNull(),
  polityStability: int("polityStability").notNull(),
  polityStateHash: varchar("polityStateHash", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  check("aurionNpcActionEpochStates_market_version_ck", sql`${table.marketVersion} >= 0`),
  check("aurionNpcActionEpochStates_polity_version_ck", sql`${table.polityVersion} >= 0`),
  check("aurionNpcActionEpochStates_polity_stability_ck", sql`${table.polityStability} >= 0 and ${table.polityStability} <= 100`),
  index("aurionNpcActionEpochStates_active_idx").on(table.active),
]);

/** Immutable proof that an existing epoch state was revalidated before binding it to a newer WASD capsule. */
export const aurionNpcActionEpochSourceReceipts = mysqlTable("aurionNpcActionEpochSourceReceipts", {
  id: varchar("id", { length: 96 }).primaryKey(),
  hubId: varchar("hubId", { length: 96 }).notNull(),
  previousSourceRevision: varchar("previousSourceRevision", { length: 40 }).notNull(),
  previousSourceSha256: varchar("previousSourceSha256", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  capsuleManifestSha256: varchar("capsuleManifestSha256", { length: 64 }).notNull(),
  marketVersion: int("marketVersion").notNull(),
  marketHash: varchar("marketHash", { length: 64 }).notNull(),
  inventoryHash: varchar("inventoryHash", { length: 64 }).notNull(),
  polityVersion: int("polityVersion").notNull(),
  polityStateHash: varchar("polityStateHash", { length: 64 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcActionEpochSourceReceipts_hash_uq").on(table.receiptHash),
  uniqueIndex("aurionNpcActionEpochSourceReceipts_transition_uq").on(
    table.hubId, table.previousSourceRevision, table.sourceRevision, table.marketVersion, table.polityVersion,
  ),
  index("aurionNpcActionEpochSourceReceipts_hub_idx").on(table.hubId, table.createdAt),
]);

/** Logical lease custody is Aurion-owned and mutable only through the action transaction. */
export const aurionNpcActionLeases = mysqlTable("aurionNpcActionLeases", {
  id: varchar("id", { length: 96 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  intentId: varchar("intentId", { length: 96 }).notNull(),
  targetId: varchar("targetId", { length: 128 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  lockedStateHash: varchar("lockedStateHash", { length: 64 }).notNull(),
  issuedAtLogicalIndex: int("issuedAtLogicalIndex").notNull(),
  expiresAtLogicalIndex: int("expiresAtLogicalIndex").notNull(),
  state: mysqlEnum("state", ["active","consumed","revoked"]).notNull(),
  leaseJson: text("leaseJson").notNull(),
  leaseHash: varchar("leaseHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcActionLeases_intent_uq").on(table.intentId),
  uniqueIndex("aurionNpcActionLeases_hash_uq").on(table.leaseHash),
  index("aurionNpcActionLeases_npc_state_idx").on(table.npcId, table.state),
]);

/** Editorial consent is an Aurion host gate. It can allow/deny but never rewrite WASD effects. */
export const aurionNpcActionConsentReceipts = mysqlTable("aurionNpcActionConsentReceipts", {
  id: varchar("id", { length: 96 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  sourceDecisionReceiptId: varchar("sourceDecisionReceiptId", { length: 64 }).notNull(),
  intentId: varchar("intentId", { length: 96 }).notNull(),
  verdict: mysqlEnum("verdict", ["NOT_REQUIRED","ALLOW","DENY"]).notNull(),
  policyVersion: varchar("policyVersion", { length: 96 }).notNull(),
  policyHash: varchar("policyHash", { length: 64 }).notNull(),
  consentHash: varchar("consentHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcActionConsentReceipts_intent_uq").on(table.intentId),
  uniqueIndex("aurionNpcActionConsentReceipts_hash_uq").on(table.consentHash),
]);

/** Immutable WASD action receipt persisted before any gameplay effect in the same transaction. */
export const aurionNpcActionReceipts = mysqlTable("aurionNpcActionReceipts", {
  id: varchar("id", { length: 96 }).primaryKey(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  sourceDecisionReceiptId: varchar("sourceDecisionReceiptId", { length: 64 }).notNull(),
  sourceDecisionSha256: varchar("sourceDecisionSha256", { length: 64 }).notNull(),
  sourcePlanHash: varchar("sourcePlanHash", { length: 64 }).notNull(),
  sourceGoal: varchar("sourceGoal", { length: 64 }).notNull(),
  sourceGoalHash: varchar("sourceGoalHash", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  capsuleManifestSha256: varchar("capsuleManifestSha256", { length: 64 }).notNull(),
  intentId: varchar("intentId", { length: 96 }).notNull(),
  intentHash: varchar("intentHash", { length: 64 }).notNull(),
  leaseId: varchar("leaseId", { length: 96 }).notNull(),
  effectsHash: varchar("effectsHash", { length: 64 }).notNull(),
  effectSetJson: mediumtext("effectSetJson").notNull(),
  expectedMarketVersion: int("expectedMarketVersion").notNull(),
  expectedMarketHash: varchar("expectedMarketHash", { length: 64 }).notNull(),
  expectedPolityVersion: int("expectedPolityVersion").notNull(),
  expectedPolityHash: varchar("expectedPolityHash", { length: 64 }).notNull(),
  expectedInventoryHash: varchar("expectedInventoryHash", { length: 64 }).notNull(),
  expectedTargetHash: varchar("expectedTargetHash", { length: 64 }).notNull(),
  consentReceiptId: varchar("consentReceiptId", { length: 96 }).notNull(),
  successorNpcReceiptId: varchar("successorNpcReceiptId", { length: 64 }).notNull(),
  successorWorldReceiptId: varchar("successorWorldReceiptId", { length: 64 }).notNull(),
  successorPolityHash: varchar("successorPolityHash", { length: 64 }).notNull(),
  successorMarketHash: varchar("successorMarketHash", { length: 64 }).notNull(),
  successorInventoryHash: varchar("successorInventoryHash", { length: 64 }).notNull(),
  receiptJson: mediumtext("receiptJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcActionReceipts_hash_uq").on(table.receiptHash),
  uniqueIndex("aurionNpcActionReceipts_source_uq").on(table.sourceDecisionReceiptId),
  uniqueIndex("aurionNpcActionReceipts_intent_uq").on(table.intentId),
  uniqueIndex("aurionNpcActionReceipts_lease_uq").on(table.leaseId),
  index("aurionNpcActionReceipts_npc_index_idx").on(table.npcId, table.resolutionIndex),
]);

/** Exact database readback of every committed WASD effect; this is the performed-action gate. */
export const aurionNpcActionEffectReadbacks = mysqlTable("aurionNpcActionEffectReadbacks", {
  id: varchar("id", { length: 96 }).primaryKey(),
  actionReceiptId: varchar("actionReceiptId", { length: 96 }).notNull(),
  effectsHash: varchar("effectsHash", { length: 64 }).notNull(),
  npcReceiptId: varchar("npcReceiptId", { length: 64 }).notNull(),
  npcDecisionHash: varchar("npcDecisionHash", { length: 64 }).notNull(),
  worldReceiptId: varchar("worldReceiptId", { length: 64 }).notNull(),
  worldReactionHash: varchar("worldReactionHash", { length: 64 }).notNull(),
  polityId: varchar("polityId", { length: 96 }).notNull(),
  polityStateHash: varchar("polityStateHash", { length: 64 }).notNull(),
  marketStateHash: varchar("marketStateHash", { length: 64 }).notNull(),
  inventoryStateHash: varchar("inventoryStateHash", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  readbackHash: varchar("readbackHash", { length: 64 }).notNull(),
  readbackJson: text("readbackJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcActionEffectReadbacks_action_uq").on(table.actionReceiptId),
  uniqueIndex("aurionNpcActionEffectReadbacks_hash_uq").on(table.readbackHash),
]);

/** Memory may claim the successor decision only after the corresponding effect readback exists. */
export const aurionNpcActionMemoryLinks = mysqlTable("aurionNpcActionMemoryLinks", {
  id: varchar("id", { length: 96 }).primaryKey(),
  actionReceiptId: varchar("actionReceiptId", { length: 96 }).notNull(),
  effectReadbackId: varchar("effectReadbackId", { length: 96 }).notNull(),
  memoryReceiptId: varchar("memoryReceiptId", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  linkHash: varchar("linkHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcActionMemoryLinks_action_uq").on(table.actionReceiptId),
  uniqueIndex("aurionNpcActionMemoryLinks_memory_uq").on(table.memoryReceiptId),
  uniqueIndex("aurionNpcActionMemoryLinks_hash_uq").on(table.linkHash),
]);

/** Account/character-bound NPC memory evidence. Gameplay truth is supplied by a confirmed result receipt. */
export const aurionNpcMemoryReceipts = mysqlTable("aurionNpcMemoryReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  characterId: varchar("characterId", { length: 128 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  worldRevision: varchar("worldRevision", { length: 128 }).notNull(),
  resultReceiptId: varchar("resultReceiptId", { length: 128 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  memoryJson: text("memoryJson").notNull(),
  memoryHash: varchar("memoryHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcMemoryReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionNpcMemoryReceipts_character_receipt_uq").on(table.userId, table.characterId, table.npcId, table.resultReceiptId),
  index("aurionNpcMemoryReceipts_user_npc_created_idx").on(table.userId, table.npcId, table.createdAt),
]);

/** Review-only quest offer projection derived from one immutable NPC memory receipt. */
export const aurionNpcQuestOffers = mysqlTable("aurionNpcQuestOffers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  memoryReceiptId: varchar("memoryReceiptId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  characterId: varchar("characterId", { length: 128 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  worldRevision: varchar("worldRevision", { length: 128 }).notNull(),
  resultReceiptId: varchar("resultReceiptId", { length: 128 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  offerKey: varchar("offerKey", { length: 128 }).notNull(),
  offerJson: text("offerJson").notNull(),
  offerHash: varchar("offerHash", { length: 64 }).notNull(),
  reviewOnly: int("reviewOnly").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionNpcQuestOffers_receipt_offer_uq").on(table.memoryReceiptId, table.offerKey),
  uniqueIndex("aurionNpcQuestOffers_hash_uq").on(table.offerHash),
  index("aurionNpcQuestOffers_user_npc_created_idx").on(table.userId, table.npcId, table.createdAt),
]);

/** Versioned faction standing and fictional warfront state, bound to a confirmed world receipt. */
export const aurionFactionWarfrontReceipts = mysqlTable("aurionFactionWarfrontReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  characterId: varchar("characterId", { length: 128 }).notNull(),
  faction: varchar("faction", { length: 96 }).notNull(),
  worldRevision: varchar("worldRevision", { length: 128 }).notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 128 }).notNull(),
  sequence: int("sequence").notNull(),
  standingDeltaBps: int("standingDeltaBps").notNull(),
  loyaltyDeltaBps: int("loyaltyDeltaBps").notNull(),
  warfrontJson: text("warfrontJson").notNull(),
  stateHash: varchar("stateHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionFactionWarfrontReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionFactionWarfrontReceipts_actor_faction_sequence_uq").on(table.userId, table.characterId, table.faction, table.sequence),
  uniqueIndex("aurionFactionWarfrontReceipts_state_hash_uq").on(table.stateHash),
  uniqueIndex("aurionFactionWarfrontReceipts_source_receipt_uq").on(table.userId, table.characterId, table.sourceReceiptId),
  index("aurionFactionWarfrontReceipts_faction_created_idx").on(table.faction, table.createdAt),
]);

/** Canonical atomic trade/crafting evidence; resources and results are bound to server receipts. */
export const aurionTradeCraftingReceipts = mysqlTable("aurionTradeCraftingReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  characterId: varchar("characterId", { length: 128 }).notNull(),
  operationKind: mysqlEnum("operationKind", ["trade", "crafting"]).notNull(),
  operationId: varchar("operationId", { length: 128 }).notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 128 }).notNull(),
  worldRevision: varchar("worldRevision", { length: 128 }).notNull(),
  marketContext: varchar("marketContext", { length: 128 }).notNull(),
  professionContext: varchar("professionContext", { length: 128 }),
  resourceDeltasJson: text("resourceDeltasJson").notNull(),
  resultJson: text("resultJson").notNull(),
  resultHash: varchar("resultHash", { length: 64 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionTradeCraftingReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionTradeCraftingReceipts_operation_uq").on(table.userId, table.characterId, table.operationId),
  uniqueIndex("aurionTradeCraftingReceipts_source_uq").on(table.userId, table.characterId, table.sourceReceiptId),
  uniqueIndex("aurionTradeCraftingReceipts_receipt_hash_uq").on(table.receiptHash),
  index("aurionTradeCraftingReceipts_user_kind_created_idx").on(table.userId, table.operationKind, table.createdAt),
]);

/** Versioned polity snapshot; conflicts are fictional game state and never trigger destructive real-world actions. */
export const aurionPolityStates = mysqlTable("aurionPolityStates", {
  polityId: varchar("polityId", { length: 96 }).primaryKey(),
  stateJson: text("stateJson").notNull(),
  reactionHash: varchar("reactionHash", { length: 64 }).notNull().unique(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Auditable dialogue parsing keeps player text separate from game commands and rewards. */
export const aurionDialogueReceipts = mysqlTable("aurionDialogueReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  utteranceDigest: varchar("utteranceDigest", { length: 64 }).notNull(),
  interpretationJson: text("interpretationJson").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionDialogueReceipts_idempotency_uq").on(table.idempotencyKey),
  index("aurionDialogueReceipts_user_created_idx").on(table.userId, table.createdAt),
]);

/** One explicit Aurion gameplay command bound to one owned, moderated dialogue receipt. */
export const aurionDialogueCommandReceipts = mysqlTable("aurionDialogueCommandReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  dialogueReceiptId: varchar("dialogueReceiptId", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  actionKind: mysqlEnum("actionKind", ["offer_quest", "request_turn_in"]).notNull(),
  questKey: varchar("questKey", { length: 64 }).notNull(),
  outcomeJson: text("outcomeJson").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionDialogueCommandReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionDialogueCommandReceipts_user_dialogue_action_quest_uq").on(table.userId, table.dialogueReceiptId, table.actionKind, table.questKey),
  index("aurionDialogueCommandReceipts_user_created_idx").on(table.userId, table.createdAt),
  index("aurionDialogueCommandReceipts_dialogue_idx").on(table.dialogueReceiptId),
]);

/** One player-owned faction questline projection. Its resolution index is advanced only by receipt-producing commands. */
export const aurionFactionQuestlineStates = mysqlTable("aurionFactionQuestlineStates", {
  userId: int("userId").primaryKey(),
  pledgedFaction: mysqlEnum("pledgedFaction", ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"]).default("free_haven").notNull(),
  permanentOathReceiptId: varchar("permanentOathReceiptId", { length: 64 }),
  lastResolutionIndex: int("lastResolutionIndex").default(0).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Immutable receipt for the one-way transition from the neutral route to a permanent faction. */
export const aurionFactionQuestlineOathReceipts = mysqlTable("aurionFactionQuestlineOathReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  fromFaction: mysqlEnum("fromFaction", ["free_haven"]).notNull(),
  toFaction: mysqlEnum("toFaction", ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact"]).notNull(),
  sourceQuestId: varchar("sourceQuestId", { length: 96 }).notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 64 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  receiptDigest: varchar("receiptDigest", { length: 64 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionFactionQuestlineOathReceipts_user_uq").on(table.userId),
  uniqueIndex("aurionFactionQuestlineOathReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionFactionQuestlineOathReceipts_user_source_uq").on(table.userId, table.sourceReceiptId),
  uniqueIndex("aurionFactionQuestlineOathReceipts_user_resolution_uq").on(table.userId, table.resolutionIndex),
]);

/** Immutable player-owned authored quest decision; no reward or world mutation is stored here. */
export const aurionFactionQuestlineDecisionReceipts = mysqlTable("aurionFactionQuestlineDecisionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  faction: mysqlEnum("faction", ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"]).notNull(),
  questId: varchar("questId", { length: 96 }).notNull(),
  decisionKey: varchar("decisionKey", { length: 96 }).notNull(),
  approach: mysqlEnum("approach", ["trade", "craft", "combat", "espionage", "exploration"]).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  receiptDigest: varchar("receiptDigest", { length: 64 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionFactionQuestlineDecisionReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionFactionQuestlineDecisionReceipts_user_quest_uq").on(table.userId, table.questId),
  uniqueIndex("aurionFactionQuestlineDecisionReceipts_user_resolution_uq").on(table.userId, table.resolutionIndex),
  index("aurionFactionQuestlineDecisionReceipts_user_resolution_idx").on(table.userId, table.resolutionIndex),
]);

/** Immutable, server-confirmed completion and reward evidence for one authored faction quest node. */
export const aurionFactionQuestlineRewardReceipts = mysqlTable("aurionFactionQuestlineRewardReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  faction: mysqlEnum("faction", ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"]).notNull(),
  questId: varchar("questId", { length: 96 }).notNull(),
  approach: mysqlEnum("approach", ["trade", "craft", "combat", "espionage", "exploration"]).notNull(),
  sourceDecisionReceiptId: varchar("sourceDecisionReceiptId", { length: 64 }).notNull(),
  completionResolutionIndex: int("completionResolutionIndex").notNull(),
  rewardKey: varchar("rewardKey", { length: 160 }).notNull(),
  xp: int("xp").notNull(),
  points: int("points").notNull(),
  victory: int("victory").notNull(),
  rewardDigest: varchar("rewardDigest", { length: 64 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionFactionQuestlineRewardReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionFactionQuestlineRewardReceipts_user_quest_uq").on(table.userId, table.questId),
  uniqueIndex("aurionFactionQuestlineRewardReceipts_user_resolution_uq").on(table.userId, table.completionResolutionIndex),
  uniqueIndex("aurionFactionQuestlineRewardReceipts_digest_uq").on(table.rewardDigest),
  index("aurionFactionQuestlineRewardReceipts_user_created_idx").on(table.userId, table.createdAt),
]);

/** Approved GLB metadata references S3 objects; bytes never enter the relational database. */
export const glbAssets = mysqlTable("glbAssets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  assetType: mysqlEnum("assetType", ["character", "enemy", "weapon", "armor", "arena"]).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull().unique(),
  bytes: int("bytes").notNull(),
  status: mysqlEnum("status", ["draft", "approved", "rejected", "archived"]).default("draft").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Immutable source receipt for externally vendored GLBs. This table is
 * presentation provenance only and grants no gameplay or assignment authority. */
export const glbExternalProvenance = mysqlTable("glbExternalProvenance", {
  id: varchar("id", { length: 64 }).primaryKey(),
  assetId: varchar("assetId", { length: 64 }).notNull().unique(),
  sourceKind: mysqlEnum("sourceKind", ["os3a-cc0"]).notNull(),
  registryRepository: varchar("registryRepository", { length: 160 }).notNull(),
  registryRevision: varchar("registryRevision", { length: 40 }).notNull(),
  modelRepository: varchar("modelRepository", { length: 160 }).notNull(),
  modelRevision: varchar("modelRevision", { length: 40 }).notNull(),
  licensePath: varchar("licensePath", { length: 120 }).notNull(),
  projectId: varchar("projectId", { length: 96 }).notNull(),
  sourceAssetId: varchar("sourceAssetId", { length: 96 }).notNull(),
  sourcePath: varchar("sourcePath", { length: 512 }).notNull(),
  license: varchar("license", { length: 64 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  sourceBytes: int("sourceBytes").notNull(),
  sourceMetadataSha256: varchar("sourceMetadataSha256", { length: 64 }).notNull(),
  fallbackPlanSha256: varchar("fallbackPlanSha256", { length: 64 }).notNull(),
  receiptSha256: varchar("receiptSha256", { length: 64 }).notNull().unique(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("glbExternalProvenance_source_identity_uq").on(table.projectId, table.sourceAssetId, table.modelRevision),
  index("glbExternalProvenance_asset_created_idx").on(table.assetId, table.createdAt),
]);

export const glbAssignments = mysqlTable("glbAssignments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  assetId: varchar("assetId", { length: 64 }).notNull(),
  targetType: mysqlEnum("targetType", ["character", "enemy", "weapon", "armor", "arena"]).notNull(),
  targetKey: varchar("targetKey", { length: 120 }).notNull(),
  active: int("active").default(0).notNull(),
  assignedByUserId: int("assignedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("glbAssignments_target_active_idx").on(table.targetType, table.targetKey, table.active)]);

/** Player-created GLB assets wait for an explicit administrator review before entering the game catalog. */
export const glbAssetSubmissions = mysqlTable("glbAssetSubmissions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  submittedByUserId: int("submittedByUserId").notNull(),
  assetType: mysqlEnum("assetType", ["character", "enemy", "weapon", "armor", "arena"]).notNull(),
  subcategory: varchar("subcategory", { length: 80 }).notNull(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull(),
  visibility: mysqlEnum("visibility", ["private", "public"]).default("private").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  bytes: int("bytes").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewNote: varchar("reviewNote", { length: 500 }),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  approvedAssetId: varchar("approvedAssetId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("glbAssetSubmissions_status_created_idx").on(table.status, table.createdAt),
  index("glbAssetSubmissions_submitter_created_idx").on(table.submittedByUserId, table.createdAt),
]);

/** Approved private character models may be equipped only by their submitting player. */
export const playerCharacterAppearances = mysqlTable("playerCharacterAppearances", {
  userId: int("userId").primaryKey(),
  assetId: varchar("assetId", { length: 64 }).notNull(),
  visibility: mysqlEnum("visibility", ["private", "public"]).notNull(),
  equippedAt: timestamp("equippedAt").defaultNow().onUpdateNow().notNull(),
});

/** Each drop is a server-created item instance plus an idempotent receipt. */
export const lootDropReceipts = mysqlTable("lootDropReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  expeditionKey: varchar("expeditionKey", { length: 96 }).notNull(),
  treasureClass: varchar("treasureClass", { length: 96 }).notNull(),
  quality: mysqlEnum("quality", ["normal", "magic", "rare", "set", "unique"]).notNull(),
  seedDigest: varchar("seedDigest", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("lootDropReceipts_idempotency_uq").on(table.idempotencyKey),
  index("lootDropReceipts_user_created_idx").on(table.userId, table.createdAt),
]);

/** A server-confirmed expedition completion. Loot and weapon XP must name this receipt. */
export const expeditionResultReceipts = mysqlTable("expeditionResultReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  expeditionKey: varchar("expeditionKey", { length: 96 }).notNull(),
  seedDigest: varchar("seedDigest", { length: 128 }).notNull(),
  resultDigest: varchar("resultDigest", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["accepted", "rejected"]).default("accepted").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  confirmedByUserId: int("confirmedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("expeditionResultReceipts_idempotency_uq").on(table.idempotencyKey),
  index("expeditionResultReceipts_user_expedition_idx").on(table.userId, table.expeditionKey, table.createdAt),
]);

export const itemInstances = mysqlTable("itemInstances", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  sourceKind: mysqlEnum("sourceKind", ["loot", "crafting"]).default("loot").notNull(),
  lootReceiptId: varchar("lootReceiptId", { length: 64 }).unique(),
  craftingReceiptId: varchar("craftingReceiptId", { length: 64 }),
  craftingOutputKey: varchar("craftingOutputKey", { length: 64 }).default("base").notNull(),
  baseItemKey: varchar("baseItemKey", { length: 96 }).notNull(),
  quality: mysqlEnum("quality", ["normal", "magic", "rare", "set", "unique"]).notNull(),
  itemLevel: int("itemLevel").notNull(),
  affixesJson: text("affixesJson").notNull(),
  setKey: varchar("setKey", { length: 96 }),
  status: mysqlEnum("status", ["owned", "listed", "sold", "consumed", "guild_custody", "pending_pickup", "equipped"]).default("owned").notNull(),
  soldAt: timestamp("soldAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("itemInstances_owner_status_created_idx").on(table.ownerUserId, table.status, table.createdAt),
  uniqueIndex("itemInstances_crafting_output_uq").on(table.craftingReceiptId, table.craftingOutputKey),
  check("itemInstances_exactly_one_provenance_ck", sql`(${table.sourceKind} = 'loot' AND ${table.lootReceiptId} IS NOT NULL AND ${table.craftingReceiptId} IS NULL) OR (${table.sourceKind} = 'crafting' AND ${table.lootReceiptId} IS NULL AND ${table.craftingReceiptId} IS NOT NULL)`),
]);

/** Immutable evidence for a server-authoritative recipe resolution. */
export const craftingReceipts = mysqlTable("craftingReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  recipeKey: varchar("recipeKey", { length: 96 }).notNull(),
  recipeDigest: varchar("recipeDigest", { length: 64 }).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  inputItemId: varchar("inputItemId", { length: 64 }).notNull().unique(),
  professionReceiptId: varchar("professionReceiptId", { length: 64 }).unique(),
  receiptDigest: varchar("receiptDigest", { length: 64 }).notNull().unique(),
  resolutionIndex: int("resolutionIndex").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("craftingReceipts_user_created_idx").on(table.userId, table.createdAt),
  uniqueIndex("craftingReceipts_user_resolution_uq").on(table.userId, table.resolutionIndex),
]);

/** System sales remove an item from an inventory and grant a deterministic Aurion value exactly once. */
export const systemSaleReceipts = mysqlTable("systemSaleReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  itemId: varchar("itemId", { length: 64 }).notNull().unique(),
  sellerUserId: int("sellerUserId").notNull(),
  aurionGranted: int("aurionGranted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("systemSaleReceipts_seller_created_idx").on(table.sellerUserId, table.createdAt)]);

/** Active listings reserve an item until a player buys it or the seller cancels the offer. */
export const marketListings = mysqlTable("marketListings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  sellerUserId: int("sellerUserId").notNull(),
  askingPrice: int("askingPrice").notNull(),
  status: mysqlEnum("status", ["active", "sold", "cancelled"]).default("active").notNull(),
  buyerUserId: int("buyerUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  settledAt: timestamp("settledAt"),
}, table => [index("marketListings_status_created_idx").on(table.status, table.createdAt)]);

/** Immutable purchase receipts make monetary transfers and inventory ownership changes traceable. */
export const marketTransactionReceipts = mysqlTable("marketTransactionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  listingId: varchar("listingId", { length: 64 }).notNull().unique(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  sellerUserId: int("sellerUserId").notNull(),
  buyerUserId: int("buyerUserId").notNull(),
  aurionTransferred: int("aurionTransferred").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("marketTransactionReceipts_buyer_created_idx").on(table.buyerUserId, table.createdAt)]);

/** Server-owned loot catalog. Clients never supply a base item or affix payload. */
export const treasureClasses = mysqlTable("treasureClasses", {
  id: varchar("id", { length: 64 }).primaryKey(),
  classKey: varchar("classKey", { length: 96 }).notNull().unique(),
  minLevel: int("minLevel").notNull(),
  maxLevel: int("maxLevel").notNull(),
  entriesJson: text("entriesJson").notNull(),
  active: int("active").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const lootAffixes = mysqlTable("lootAffixes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  affixKey: varchar("affixKey", { length: 96 }).notNull().unique(),
  slot: mysqlEnum("slot", ["prefix", "suffix"]).notNull(),
  minItemLevel: int("minItemLevel").notNull(),
  maxItemLevel: int("maxItemLevel").notNull(),
  modifiersJson: text("modifiersJson").notNull(),
  active: int("active").default(1).notNull(),
});

export const lootSetDefinitions = mysqlTable("lootSetDefinitions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  setKey: varchar("setKey", { length: 96 }).notNull().unique(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  piecesJson: text("piecesJson").notNull(),
  bonusesJson: text("bonusesJson").notNull(),
  active: int("active").default(1).notNull(),
});

/** Immutable accepted weapon-use evidence binds mastery to validated expedition results. */
export const weaponMasteryReceipts = mysqlTable("weaponMasteryReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  expeditionKey: varchar("expeditionKey", { length: 96 }).notNull(),
  weaponTrack: mysqlEnum("weaponTrack", ["blade", "staff", "spear", "focus"]).notNull(),
  actionKey: varchar("actionKey", { length: 120 }).notNull(),
  xpGranted: int("xpGranted").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("weaponMasteryReceipts_idempotency_uq").on(table.idempotencyKey),
  index("weaponMasteryReceipts_user_created_idx").on(table.userId, table.createdAt),
]);

/** Provider keys are intentionally absent. The database stores only safe placement configuration. */
export const monetizationPlacements = mysqlTable("monetizationPlacements", {
  id: varchar("id", { length: 64 }).primaryKey(),
  placementKey: varchar("placementKey", { length: 96 }).notNull().unique(),
  kind: mysqlEnum("kind", ["banner", "offerwall", "vote_list"]).notNull(),
  providerLabel: varchar("providerLabel", { length: 96 }).notNull(),
  active: int("active").default(0).notNull(),
  consentRequired: int("consentRequired").default(1).notNull(),
  configurationJson: text("configurationJson").notNull(),
  updatedByUserId: int("updatedByUserId").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const rewardReceipts = mysqlTable("rewardReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  placementId: varchar("placementId", { length: 64 }).notNull(),
  providerEventId: varchar("providerEventId", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["accepted", "rejected", "credited"]).notNull(),
  rewardJson: text("rewardJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("rewardReceipts_placement_event_uq").on(table.placementId, table.providerEventId)]);

/** Short, authenticated messages visible to explorers in the current game community. */
export const expeditionChatMessages = mysqlTable("expeditionChatMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("expeditionChatMessages_created_idx").on(table.createdAt)]);

/** A lightweight human teammate request made when a player does not connect an LLM partner. */
export const partnerRequests = mysqlTable("partnerRequests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  requesterUserId: int("requesterUserId").notNull(),
  note: varchar("note", { length: 280 }).notNull(),
  status: mysqlEnum("status", ["open", "accepted", "cancelled"]).default("open").notNull(),
  responderUserId: int("responderUserId"),
  teamId: varchar("teamId", { length: 64 }),
  respondedAt: timestamp("respondedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("partnerRequests_open_created_idx").on(table.status, table.createdAt),
  index("partnerRequests_requester_status_idx").on(table.requesterUserId, table.status),
]);

/** A server-owned two-player expedition team; member rows hold the participant identities. */
export const expeditionTeams = mysqlTable("expeditionTeams", {
  id: varchar("id", { length: 64 }).primaryKey(),
  createdByUserId: int("createdByUserId").notNull(),
  status: mysqlEnum("status", ["active", "disbanded"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  disbandedAt: timestamp("disbandedAt"),
});

/** The activeUserKey unique index lets a player occupy at most one active two-player team. */
export const expeditionTeamMembers = mysqlTable("expeditionTeamMembers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  teamId: varchar("teamId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["leader", "partner"]).notNull(),
  status: mysqlEnum("status", ["active", "left"]).default("active").notNull(),
  activeUserKey: varchar("activeUserKey", { length: 64 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  leftAt: timestamp("leftAt"),
}, table => [
  uniqueIndex("expeditionTeamMembers_team_user_uq").on(table.teamId, table.userId),
  uniqueIndex("expeditionTeamMembers_active_user_uq").on(table.activeUserKey),
  index("expeditionTeamMembers_team_status_idx").on(table.teamId, table.status),
]);

/** Normalized teammate inputs are relayed through the shared team record; prose is never accepted here. */
export const expeditionTeamSignals = mysqlTable("expeditionTeamSignals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  teamId: varchar("teamId", { length: 64 }).notNull(),
  senderUserId: int("senderUserId").notNull(),
  command: varchar("command", { length: 1 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("expeditionTeamSignals_team_created_idx").on(table.teamId, table.createdAt)]);

/** Community forum threads include staff notices and player-created general questions. */
export const forumThreads = mysqlTable("forumThreads", {
  id: varchar("id", { length: 64 }).primaryKey(),
  category: mysqlEnum("category", ["announcements", "patch_notes", "events", "general", "issues"]).notNull(),
  authorUserId: int("authorUserId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  pinned: int("pinned").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("forumThreads_category_created_idx").on(table.category, table.createdAt)]);

/** Replies keep questions and staff posts conversational without mixing them into in-game chat. */
export const forumReplies = mysqlTable("forumReplies", {
  id: varchar("id", { length: 64 }).primaryKey(),
  threadId: varchar("threadId", { length: 64 }).notNull(),
  authorUserId: int("authorUserId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("forumReplies_thread_created_idx").on(table.threadId, table.createdAt)]);

export const aurionCivilizationHistoryEvents = mysqlTable("aurionCivilizationHistoryEvents", {
  eventId: varchar("eventId", { length: 64 }).primaryKey(),
  civilizationId: varchar("civilizationId", { length: 64 }).notNull(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  worldEpoch: int("worldEpoch").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  sourceReceiptId: varchar("sourceReceiptId", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  eventPayloadHash: varchar("eventPayloadHash", { length: 64 }).notNull(),
  occurredSequence: int("occurredSequence").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("historySequenceIdx").on(table.worldId, table.civilizationId, table.occurredSequence)]);

export const aurionActiveCivilizations = mysqlTable("aurionActiveCivilizations", {
  civilizationId: varchar("civilizationId", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  worldEpoch: int("worldEpoch").notNull(),
  population: int("population").notNull(),
  stability: float("stability").notNull(),
  hazardIndex: float("hazardIndex").notNull(),
  scarcitySeverity: float("scarcitySeverity").notNull(),
  lastResolutionIndex: int("lastResolutionIndex").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aurionRuinOrigins = mysqlTable("aurionRuinOrigins", {
  ruinId: varchar("ruinId", { length: 64 }).primaryKey(),
  originCivilizationId: varchar("originCivilizationId", { length: 64 }).notNull(),
  collapseEventId: varchar("collapseEventId", { length: 64 }).notNull(),
  locationIdentity: varchar("locationIdentity", { length: 255 }).notNull(),
  worldEpoch: int("worldEpoch").notNull(),
  historyDigest: varchar("historyDigest", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 32 }).notNull(),
  generationSeedDigest: varchar("generationSeedDigest", { length: 64 }).notNull(),
  state: mysqlEnum("state", ["ELIGIBLE", "MATERIALIZED", "DISCOVERED", "ACTIVE", "CLEARED", "HISTORICAL"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aurionDungeonInstanceReceipts = mysqlTable("aurionDungeonInstanceReceipts", {
  instanceId: varchar("instanceId", { length: 64 }).primaryKey(),
  ruinId: varchar("ruinId", { length: 64 }).notNull(),
  entryReceipt: varchar("entryReceipt", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 32 }).notNull(),
  contextIdentity: varchar("contextIdentity", { length: 64 }).notNull(),
  completionReceipt: varchar("completionReceipt", { length: 64 }),
  lootReceiptSetDigest: varchar("lootReceiptSetDigest", { length: 64 }),
  resultHash: varchar("resultHash", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aurionSettlementRebirthCandidates = mysqlTable("aurionSettlementRebirthCandidates", {
  candidateId: varchar("candidateId", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  locationIdentity: varchar("locationIdentity", { length: 255 }).notNull(),
  ruinId: varchar("ruinId", { length: 64 }),
  eligibilityReceipt: varchar("eligibilityReceipt", { length: 64 }).notNull(),
  candidateSeedDigest: varchar("candidateSeedDigest", { length: 64 }).notNull(),
  state: mysqlEnum("state", ["INELIGIBLE", "ELIGIBLE", "MATERIALIZED", "REJECTED"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PlayerProfile = typeof playerProfiles.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Guild = typeof guilds.$inferSelect;
export type GuildMembership = typeof guildMemberships.$inferSelect;
export type GlbAsset = typeof glbAssets.$inferSelect;
export type GlbAssetSubmission = typeof glbAssetSubmissions.$inferSelect;
export type LootDropReceipt = typeof lootDropReceipts.$inferSelect;
export type CraftingReceipt = typeof craftingReceipts.$inferSelect;
export type MarketListing = typeof marketListings.$inferSelect;
export type ExpeditionChatMessage = typeof expeditionChatMessages.$inferSelect;
export type PartnerRequest = typeof partnerRequests.$inferSelect;
export type ExpeditionTeam = typeof expeditionTeams.$inferSelect;
export type ExpeditionTeamMember = typeof expeditionTeamMembers.$inferSelect;
export type ExpeditionTeamSignal = typeof expeditionTeamSignals.$inferSelect;
export type ForumThread = typeof forumThreads.$inferSelect;
export type ForumReply = typeof forumReplies.$inferSelect;
export type ActiveCivilization = typeof aurionActiveCivilizations.$inferSelect;

export const aurionSemanticMemoryReceipts = mysqlTable("aurionSemanticMemoryReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  resolutionIndex: int("resolutionIndex").notNull(),
  graphVersion: varchar("graphVersion", { length: 64 }).notNull(),
  sourceDecisionReceiptId: varchar("sourceDecisionReceiptId", { length: 64 }).notNull(),
  sourceDecisionSha256: varchar("sourceDecisionSha256", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  previousReceiptId: varchar("previousReceiptId", { length: 64 }),
  previousGraphHash: varchar("previousGraphHash", { length: 64 }).notNull(),
  graphHash: varchar("graphHash", { length: 64 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  check("aurionSemanticMemoryReceipts_index_ck", sql`${table.resolutionIndex} >= 0`),
  uniqueIndex("aurionSemanticMemoryReceipts_npc_index_uq").on(table.npcId, table.resolutionIndex),
  uniqueIndex("aurionSemanticMemoryReceipts_source_uq").on(table.sourceDecisionReceiptId),
  uniqueIndex("aurionSemanticMemoryReceipts_hash_uq").on(table.receiptHash),
]);

export const aurionSemanticNodes = mysqlTable("aurionSemanticNodes", {
  id: varchar("id", { length: 64 }).notNull(),
  graphReceiptId: varchar("graphReceiptId", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  subjectId: varchar("subjectId", { length: 96 }).notNull(),
  predicate: varchar("predicate", { length: 64 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  factVersion: varchar("factVersion", { length: 64 }).notNull(),
  validFromIndex: int("validFromIndex").notNull(),
  validUntilIndex: int("validUntilIndex").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  conflictsWithJson: text("conflictsWithJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  primaryKey({ name: "aurionSemanticNodes_id_graphReceiptId_pk", columns: [table.id, table.graphReceiptId] }),
  index("aurionSemanticNodes_graph_idx").on(table.graphReceiptId),
  index("aurionSemanticNodes_npc_idx").on(table.npcId),
  index("aurionSemanticNodes_subject_predicate_idx").on(table.subjectId, table.predicate),
]);

export const aurionSemanticProvenance = mysqlTable("aurionSemanticProvenance", {
  id: varchar("id", { length: 128 }).primaryKey(),
  factId: varchar("factId", { length: 64 }).notNull(),
  receiptId: varchar("receiptId", { length: 64 }).notNull(),
  receiptSha256: varchar("receiptSha256", { length: 64 }).notNull(),
  decisionHash: varchar("decisionHash", { length: 64 }).notNull(),
  logicalIndex: int("logicalIndex").notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionSemanticProvenance_fact_idx").on(table.factId),
]);

export const aurionSemanticRetrievalIndex = mysqlTable("aurionSemanticRetrievalIndex", {
  id: varchar("id", { length: 128 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  subjectId: varchar("subjectId", { length: 96 }).notNull(),
  predicate: varchar("predicate", { length: 64 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  validFromIndex: int("validFromIndex").notNull(),
  validUntilIndex: int("validUntilIndex").notNull(),
  score: int("score").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionSemanticRetrievalIndex_npc_idx").on(table.npcId),
  index("aurionSemanticRetrievalIndex_subject_idx").on(table.subjectId),
  index("aurionSemanticRetrievalIndex_query_idx").on(table.npcId, table.subjectId, table.predicate),
]);

/** AIM-294 / Wave 2 Step 27: immutable WASD-derived graph receipt. V1 rows stay historical only. */
export const aurionSemanticGraphReceiptsV2 = mysqlTable("aurionSemanticGraphReceiptsV2", {
  id: varchar("id", { length: 64 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  generation: int("generation").notNull(),
  graphVersion: varchar("graphVersion", { length: 64 }).notNull(),
  retrievalVersion: varchar("retrievalVersion", { length: 64 }).notNull(),
  memoryReceiptId: varchar("memoryReceiptId", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  capsuleManifestSha256: varchar("capsuleManifestSha256", { length: 64 }).notNull(),
  previousGraphHash: varchar("previousGraphHash", { length: 64 }),
  graphHash: varchar("graphHash", { length: 64 }).notNull(),
  graphJson: mediumtext("graphJson").notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  check("aurionSemanticGraphReceiptsV2_generation_ck", sql`${table.generation} >= 0`),
  uniqueIndex("aurionSemanticGraphReceiptsV2_npc_generation_uq").on(table.npcId, table.generation),
  uniqueIndex("aurionSemanticGraphReceiptsV2_memory_uq").on(table.memoryReceiptId),
  uniqueIndex("aurionSemanticGraphReceiptsV2_graph_hash_uq").on(table.graphHash),
  uniqueIndex("aurionSemanticGraphReceiptsV2_receipt_hash_uq").on(table.receiptHash),
  index("aurionSemanticGraphReceiptsV2_npc_idx").on(table.npcId, table.generation),
]);

export const aurionSemanticGraphNodesV2 = mysqlTable("aurionSemanticGraphNodesV2", {
  id: varchar("id", { length: 64 }).notNull(),
  graphReceiptId: varchar("graphReceiptId", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  semanticKey: varchar("semanticKey", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  validFromIndex: int("validFromIndex").notNull(),
  validUntilIndex: int("validUntilIndex"),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  primaryKey({ name: "aurionSemanticGraphNodesV2_pk", columns: [table.id, table.graphReceiptId] }),
  index("aurionSemanticGraphNodesV2_graph_idx").on(table.graphReceiptId),
  index("aurionSemanticGraphNodesV2_npc_kind_idx").on(table.npcId, table.kind, table.status),
  index("aurionSemanticGraphNodesV2_key_idx").on(table.npcId, table.semanticKey),
]);

export const aurionSemanticGraphEdgesV2 = mysqlTable("aurionSemanticGraphEdgesV2", {
  id: varchar("id", { length: 64 }).notNull(),
  graphReceiptId: varchar("graphReceiptId", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  relationKey: varchar("relationKey", { length: 256 }).notNull(),
  fromNodeId: varchar("fromNodeId", { length: 64 }).notNull(),
  toNodeId: varchar("toNodeId", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  validFromIndex: int("validFromIndex").notNull(),
  validUntilIndex: int("validUntilIndex"),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  primaryKey({ name: "aurionSemanticGraphEdgesV2_pk", columns: [table.id, table.graphReceiptId] }),
  index("aurionSemanticGraphEdgesV2_graph_idx").on(table.graphReceiptId),
  index("aurionSemanticGraphEdgesV2_npc_kind_idx").on(table.npcId, table.kind, table.status),
  index("aurionSemanticGraphEdgesV2_from_idx").on(table.graphReceiptId, table.fromNodeId),
  index("aurionSemanticGraphEdgesV2_to_idx").on(table.graphReceiptId, table.toNodeId),
]);

export const aurionSemanticGraphProvenanceV2 = mysqlTable("aurionSemanticGraphProvenanceV2", {
  id: varchar("id", { length: 64 }).primaryKey(),
  graphReceiptId: varchar("graphReceiptId", { length: 64 }).notNull(),
  elementType: mysqlEnum("elementType", ["node", "edge"]).notNull(),
  elementId: varchar("elementId", { length: 64 }).notNull(),
  provenanceKind: varchar("provenanceKind", { length: 32 }).notNull(),
  provenanceId: varchar("provenanceId", { length: 128 }).notNull(),
  provenanceHash: varchar("provenanceHash", { length: 64 }).notNull(),
  logicalIndex: int("logicalIndex").notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionSemanticGraphProvenanceV2_unique").on(
    table.graphReceiptId, table.elementType, table.elementId, table.provenanceKind, table.provenanceId, table.provenanceHash,
  ),
  index("aurionSemanticGraphProvenanceV2_element_idx").on(table.graphReceiptId, table.elementType, table.elementId),
]);

/** Rebuildable deterministic readmodel only. It is checked against the verified graph before use. */
export const aurionSemanticGraphIndexV2 = mysqlTable("aurionSemanticGraphIndexV2", {
  id: varchar("id", { length: 64 }).primaryKey(),
  graphReceiptId: varchar("graphReceiptId", { length: 64 }).notNull(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  nodeId: varchar("nodeId", { length: 64 }).notNull(),
  semanticKey: varchar("semanticKey", { length: 128 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  validFromIndex: int("validFromIndex").notNull(),
  validUntilIndex: int("validUntilIndex"),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionSemanticGraphIndexV2_node_uq").on(table.graphReceiptId, table.nodeId),
  index("aurionSemanticGraphIndexV2_lookup_idx").on(table.npcId, table.kind, table.status, table.semanticKey),
]);

export const aurionNpcPolicyVersions = mysqlTable("aurionNpcPolicyVersions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  version: int("version").notNull(),
  policyHash: varchar("policyHash", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionNpcPolicyVersions_npc_idx").on(table.npcId),
  uniqueIndex("aurionNpcPolicyVersions_npc_ver_uq").on(table.npcId, table.version),
  uniqueIndex("aurionNpcPolicyVersions_npc_hash_uq").on(table.npcId, table.policyHash),
]);

export const aurionNpcPolicyActivePointers = mysqlTable("aurionNpcPolicyActivePointers", {
  npcId: varchar("npcId", { length: 96 }).primaryKey(),
  activeVersionId: varchar("activeVersionId", { length: 128 }).notNull(),
  activePolicyHash: varchar("activePolicyHash", { length: 64 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aurionNpcPolicyMutationReceipts = mysqlTable("aurionNpcPolicyMutationReceipts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  previousVersionId: varchar("previousVersionId", { length: 128 }),
  previousPolicyHash: varchar("previousPolicyHash", { length: 64 }),
  nextVersionId: varchar("nextVersionId", { length: 128 }),
  nextPolicyHash: varchar("nextPolicyHash", { length: 64 }),
  rejectedCandidateHash: varchar("rejectedCandidateHash", { length: 64 }),
  verdict: varchar("verdict", { length: 32 }).notNull(), // "accepted", "rejected"
  reason: varchar("reason", { length: 255 }).notNull(),
  provenanceDigest: varchar("provenanceDigest", { length: 255 }).notNull(),
  evidenceWindowJson: text("evidenceWindowJson").notNull(),
  fitnessContractVersion: varchar("fitnessContractVersion", { length: 64 }).notNull(),
  fitnessResultDigest: varchar("fitnessResultDigest", { length: 64 }).notNull(),
  mutationRuleVersion: varchar("mutationRuleVersion", { length: 64 }).notNull(),
  envelopeHash: varchar("envelopeHash", { length: 64 }).notNull(),
  rollbackTargetVersion: int("rollbackTargetVersion"),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionNpcPolicyMutationReceipts_npc_idx").on(table.npcId),
]);

export const aurionNpcPolicyRollbackReceipts = mysqlTable("aurionNpcPolicyRollbackReceipts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  npcId: varchar("npcId", { length: 96 }).notNull(),
  mutationReceiptId: varchar("mutationReceiptId", { length: 128 }).notNull(),
  requestedVersionId: varchar("requestedVersionId", { length: 128 }).notNull(),
  requestedPolicyHash: varchar("requestedPolicyHash", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  adminUserId: varchar("adminUserId", { length: 128 }).notNull(),
  wasdVerifiedReceiptId: varchar("wasdVerifiedReceiptId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionNpcPolicyRollbackReceipts_npc_idx").on(table.npcId),
]);

export const aurionQuestTemplateVersions = mysqlTable("aurionQuestTemplateVersions", {
  templateId: varchar("templateId", { length: 96 }).notNull(),
  version: int("version").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  templateJson: text("templateJson").notNull(),
  templateHash: varchar("templateHash", { length: 64 }).notNull(),
  active: boolean("active").default(true).notNull(),
  quarantined: boolean("quarantined").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionQuestTemplateVersions_tpl_idx").on(table.templateId, table.version),
]);

export const aurionQuestPlans = mysqlTable("aurionQuestPlans", {
  planHash: varchar("planHash", { length: 64 }).primaryKey(),
  templateId: varchar("templateId", { length: 96 }).notNull(),
  templateVersion: int("templateVersion").notNull(),
  templateSetHash: varchar("templateSetHash", { length: 64 }).notNull(),
  candidateSetHash: varchar("candidateSetHash", { length: 64 }).notNull(),
  seedDigest: varchar("seedDigest", { length: 64 }).notNull(),
  roleBindingHash: varchar("roleBindingHash", { length: 64 }).notNull(),
  graphHash: varchar("graphHash", { length: 64 }).notNull(),
  planJson: text("planJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aurionQuestInstances = mysqlTable("aurionQuestInstances", {
  id: varchar("id", { length: 128 }).primaryKey(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  playerUserId: int("playerUserId").notNull(),
  giverNpcId: varchar("giverNpcId", { length: 96 }).notNull(),
  templateId: varchar("templateId", { length: 96 }).notNull(),
  templateVersion: int("templateVersion").notNull(),
  seedDigest: varchar("seedDigest", { length: 64 }).notNull(),
  planHash: varchar("planHash", { length: 64 }).notNull(),
  graphHash: varchar("graphHash", { length: 64 }).notNull(),
  currentNodeId: varchar("currentNodeId", { length: 96 }).notNull(),
  state: varchar("state", { length: 32 }).notNull(),
  instanceJson: text("instanceJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionQuestInstances_player_idx").on(table.playerUserId),
]);

export const aurionQuestReceipts = mysqlTable("aurionQuestReceipts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  instanceId: varchar("instanceId", { length: 128 }).notNull(),
  eventSequence: int("eventSequence").notNull(),
  planHash: varchar("planHash", { length: 64 }).notNull(),
  graphHash: varchar("graphHash", { length: 64 }).notNull(),
  previousStateHash: varchar("previousStateHash", { length: 64 }).notNull(),
  resultStateHash: varchar("resultStateHash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionQuestReceipts_inst_idx").on(table.instanceId),
]);

export const aurionQuestAdminProposals = mysqlTable("aurionQuestAdminProposals", {
  id: varchar("id", { length: 128 }).primaryKey(),
  proposalType: varchar("proposalType", { length: 64 }).notNull(),
  authorUserId: int("authorUserId").notNull(),
  templateId: varchar("templateId", { length: 96 }).notNull(),
  templateVersion: int("templateVersion").notNull(),
  expectedTemplateSetHash: varchar("expectedTemplateSetHash", { length: 64 }).notNull(),
  proposedDataJson: text("proposedDataJson").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** AIM-299: Aurion World Context Capsules - Structured Episodes */
export const aurionWorldContextEpisodes = mysqlTable("aurionWorldContextEpisodes", {
  id: varchar("id", { length: 160 }).primaryKey(),
  schemaVersion: varchar("schemaVersion", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 96 }).notNull(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  sourceSequenceMin: int("sourceSequenceMin").notNull(),
  sourceSequenceMax: int("sourceSequenceMax").notNull(),
  actorIdsJson: text("actorIdsJson").notNull(),
  outcomesJson: text("outcomesJson").notNull(),
  relationshipEffectsJson: text("relationshipEffectsJson").notNull(),
  tagsJson: text("tagsJson").notNull(),
  canonicalSummary: text("canonicalSummary").notNull(),
  sourceRootHash: varchar("sourceRootHash", { length: 64 }).notNull(),
  episodeHash: varchar("episodeHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionWcEpisodes_world_seq_idx").on(table.worldId, table.sourceSequenceMin, table.sourceSequenceMax),
  index("aurionWcEpisodes_hash_idx").on(table.episodeHash),
]);

/** AIM-299: Episode Source Linkage with hash-bound provenance */
export const aurionWorldContextEpisodeSources = mysqlTable("aurionWorldContextEpisodeSources", {
  id: varchar("id", { length: 192 }).primaryKey(),
  episodeId: varchar("episodeId", { length: 160 }).notNull(),
  sourceId: varchar("sourceId", { length: 160 }).notNull(),
  sourceHash: varchar("sourceHash", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  evidenceClass: varchar("evidenceClass", { length: 32 }).notNull(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  logicalSequence: int("logicalSequence").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionWcEpisodeSources_ep_idx").on(table.episodeId),
  index("aurionWcEpisodeSources_src_idx").on(table.sourceId),
]);

/** AIM-299: Immutable World Context Capsule Receipts */
export const aurionWorldContextCapsuleReceipts = mysqlTable("aurionWorldContextCapsuleReceipts", {
  id: varchar("id", { length: 160 }).primaryKey(),
  schemaVersion: varchar("schemaVersion", { length: 64 }).notNull(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  worldRevision: varchar("worldRevision", { length: 160 }).notNull(),
  logicalTick: int("logicalTick").notNull(),
  actorId: varchar("actorId", { length: 96 }).notNull(),
  purpose: varchar("purpose", { length: 64 }).notNull(),
  queryHash: varchar("queryHash", { length: 64 }).notNull(),
  policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
  tokenizerId: varchar("tokenizerId", { length: 96 }).notNull(),
  maxEstimatedTokens: int("maxEstimatedTokens").notNull(),
  maxUtf8Bytes: int("maxUtf8Bytes").notNull(),
  selectedSourceCount: int("selectedSourceCount").notNull(),
  omittedSourceCount: int("omittedSourceCount").notNull(),
  sourceRootHash: varchar("sourceRootHash", { length: 64 }).notNull(),
  selectedSourceRootHash: varchar("selectedSourceRootHash", { length: 64 }).notNull(),
  omittedSourceRootHash: varchar("omittedSourceRootHash", { length: 64 }).notNull(),
  capsuleHash: varchar("capsuleHash", { length: 64 }).notNull(),
  estimatedInputTokens: int("estimatedInputTokens").notNull(),
  utf8Bytes: int("utf8Bytes").notNull(),
  capsuleJson: text("capsuleJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionWcCapsules_world_actor_idx").on(table.worldId, table.actorId),
  index("aurionWcCapsules_hash_idx").on(table.capsuleHash),
  index("aurionWcCapsules_query_idx").on(table.queryHash),
]);

/** AIM-299: Capsule Source Audit linkage (selected and omitted) */
export const aurionWorldContextCapsuleSources = mysqlTable("aurionWorldContextCapsuleSources", {
  id: varchar("id", { length: 255 }).primaryKey(),
  capsuleId: varchar("capsuleId", { length: 160 }).notNull(),
  sourceId: varchar("sourceId", { length: 160 }).notNull(),
  sourceHash: varchar("sourceHash", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  evidenceClass: varchar("evidenceClass", { length: 32 }).notNull(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  logicalSequence: int("logicalSequence").notNull(),
  selected: boolean("selected").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionWcCapsuleSources_capsule_idx").on(table.capsuleId),
  index("aurionWcCapsuleSources_src_idx").on(table.sourceId),
]);

/** AIM-299: Context Capsule Operational Evaluation Runs */
export const aurionWorldContextEvalRuns = mysqlTable("aurionWorldContextEvalRuns", {
  id: varchar("id", { length: 128 }).primaryKey(),
  evalSuite: varchar("evalSuite", { length: 96 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  criticalFactRecall: int("criticalFactRecall").notNull(),
  scopeViolationCount: int("scopeViolationCount").notNull(),
  replayMatchRate: int("replayMatchRate").notNull(),
  metricsJson: text("metricsJson").notNull(),
  passed: boolean("passed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});





/** Human+AI authoring versions remain Aurion-owned and immutable per version. */
export const aurionWorldDesignVersions = mysqlTable("aurionWorldDesignVersions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  designKey: varchar("designKey", { length: 96 }).notNull(),
  version: int("version").notNull(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  expectedCatalogRevision: varchar("expectedCatalogRevision", { length: 64 }).notNull(),
  designJson: text("designJson").notNull(),
  designHash: varchar("designHash", { length: 64 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionWorldDesignVersions_key_version_idx").on(table.designKey, table.version),
  index("aurionWorldDesignVersions_active_idx").on(table.active),
]);

export const aurionDungeonDesignVersions = mysqlTable("aurionDungeonDesignVersions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  dungeonId: varchar("dungeonId", { length: 96 }).notNull(),
  version: int("version").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 96 }).notNull(),
  expectedCatalogRevision: varchar("expectedCatalogRevision", { length: 64 }).notNull(),
  designJson: text("designJson").notNull(),
  designHash: varchar("designHash", { length: 64 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionDungeonDesignVersions_id_version_idx").on(table.dungeonId, table.version),
  index("aurionDungeonDesignVersions_active_idx").on(table.active),
]);

export const aurionAuthoringReceipts = mysqlTable("aurionAuthoringReceipts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  kind: varchar("kind", { length: 32 }).notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  targetId: varchar("targetId", { length: 128 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  planHash: varchar("planHash", { length: 64 }).notNull(),
  previousHash: varchar("previousHash", { length: 64 }),
  resultHash: varchar("resultHash", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionAuthoringReceipts_target_idx").on(table.kind, table.targetId),
  index("aurionAuthoringReceipts_plan_idx").on(table.planHash),
]);
