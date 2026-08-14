import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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

export type GatewaySession = typeof gatewaySessions.$inferSelect;
export type GatewayCommand = typeof gatewayCommands.$inferSelect;

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
  lootReceiptId: varchar("lootReceiptId", { length: 64 }).notNull().unique(),
  baseItemKey: varchar("baseItemKey", { length: 96 }).notNull(),
  quality: mysqlEnum("quality", ["normal", "magic", "rare", "set", "unique"]).notNull(),
  itemLevel: int("itemLevel").notNull(),
  affixesJson: text("affixesJson").notNull(),
  setKey: varchar("setKey", { length: 96 }),
  status: mysqlEnum("status", ["owned", "listed", "sold"]).default("owned").notNull(),
  soldAt: timestamp("soldAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("itemInstances_owner_status_created_idx").on(table.ownerUserId, table.status, table.createdAt)]);

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
  category: mysqlEnum("category", ["announcements", "patch_notes", "events", "general"]).notNull(),
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

export type PlayerProfile = typeof playerProfiles.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Guild = typeof guilds.$inferSelect;
export type GuildMembership = typeof guildMemberships.$inferSelect;
export type GlbAsset = typeof glbAssets.$inferSelect;
export type GlbAssetSubmission = typeof glbAssetSubmissions.$inferSelect;
export type LootDropReceipt = typeof lootDropReceipts.$inferSelect;
export type MarketListing = typeof marketListings.$inferSelect;
export type ExpeditionChatMessage = typeof expeditionChatMessages.$inferSelect;
export type PartnerRequest = typeof partnerRequests.$inferSelect;
export type ExpeditionTeam = typeof expeditionTeams.$inferSelect;
export type ExpeditionTeamMember = typeof expeditionTeamMembers.$inferSelect;
export type ExpeditionTeamSignal = typeof expeditionTeamSignals.$inferSelect;
export type ForumThread = typeof forumThreads.$inferSelect;
export type ForumReply = typeof forumReplies.$inferSelect;
