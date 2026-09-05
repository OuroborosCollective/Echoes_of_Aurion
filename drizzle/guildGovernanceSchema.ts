import { bigint, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const aurionGuildGovernanceStates = mysqlTable("aurionGuildGovernanceStates", {
  guildId: varchar("guildId", { length: 64 }).primaryKey(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  kingdomId: varchar("kingdomId", { length: 64 }),
  capitalTerritoryId: varchar("capitalTerritoryId", { length: 128 }),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aurionGuildCapabilityGrants = mysqlTable("aurionGuildCapabilityGrants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  capability: mysqlEnum("capability", ["member_manage", "diplomacy_manage", "territory_manage", "bank_deposit", "bank_withdraw", "building_manage", "kingdom_consolidate"]).notNull(),
  scopeKind: mysqlEnum("scopeKind", ["guild", "territory", "kingdom", "diplomacy", "bank", "building"]).notNull(),
  scopeId: varchar("scopeId", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
  grantedByUserId: int("grantedByUserId").notNull(),
  grantReceiptId: varchar("grantReceiptId", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildCapabilityGrants_scope_uq").on(table.guildId, table.userId, table.capability, table.scopeKind, table.scopeId),
  uniqueIndex("aurionGuildCapabilityGrants_idempotency_uq").on(table.idempotencyKey),
  index("aurionGuildCapabilityGrants_user_status_idx").on(table.guildId, table.userId, table.status),
]);

export const aurionGuildTerritories = mysqlTable("aurionGuildTerritories", {
  territoryId: varchar("territoryId", { length: 128 }).primaryKey(),
  worldId: varchar("worldId", { length: 96 }).notNull(),
  chunkX: int("chunkX").notNull(),
  chunkZ: int("chunkZ").notNull(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  state: mysqlEnum("state", ["active", "contested", "released"]).default("active").notNull(),
  acquiredByUserId: int("acquiredByUserId").notNull(),
  claimReceiptId: varchar("claimReceiptId", { length: 64 }).notNull(),
  claimRevision: bigint("claimRevision", { mode: "bigint", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildTerritories_world_chunk_uq").on(table.worldId, table.chunkX, table.chunkZ),
  index("aurionGuildTerritories_guild_state_idx").on(table.guildId, table.state),
]);

export const aurionGuildKingdoms = mysqlTable("aurionGuildKingdoms", {
  id: varchar("id", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  rulerUserId: int("rulerUserId").notNull(),
  capitalTerritoryId: varchar("capitalTerritoryId", { length: 128 }).notNull(),
  territoryDigest: varchar("territoryDigest", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["active", "dissolved"]).default("active").notNull(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("aurionGuildKingdoms_name_uq").on(table.name)]);

export const aurionGuildDiplomacyPacts = mysqlTable("aurionGuildDiplomacyPacts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceGuildId: varchar("sourceGuildId", { length: 64 }).notNull(),
  targetGuildId: varchar("targetGuildId", { length: 64 }).notNull(),
  pactType: mysqlEnum("pactType", ["alliance", "trade", "non_aggression", "tribute", "sanction", "war"]).notNull(),
  status: mysqlEnum("status", ["active", "ended"]).default("active").notNull(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).notNull(),
  receiptId: varchar("receiptId", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildDiplomacyPacts_pair_type_uq").on(table.sourceGuildId, table.targetGuildId, table.pactType),
  uniqueIndex("aurionGuildDiplomacyPacts_idempotency_uq").on(table.idempotencyKey),
]);

export const aurionGuildMutationPlans = mysqlTable("aurionGuildMutationPlans", {
  confirmationHash: varchar("confirmationHash", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  operation: mysqlEnum("operation", ["grant_capability", "claim_territory", "release_territory", "consolidate_kingdom", "set_diplomacy"]).notNull(),
  requiredCapability: mysqlEnum("requiredCapability", ["member_manage", "diplomacy_manage", "territory_manage", "bank_deposit", "bank_withdraw", "building_manage", "kingdom_consolidate"]).notNull(),
  expectedRevision: bigint("expectedRevision", { mode: "bigint", unsigned: true }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  resourcesJson: text("resourcesJson").notNull(),
  planJson: text("planJson").notNull(),
  status: mysqlEnum("status", ["planned", "consumed", "expired"]).default("planned").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),
}, table => [
  uniqueIndex("aurionGuildMutationPlans_idempotency_uq").on(table.idempotencyKey),
  index("aurionGuildMutationPlans_actor_status_idx").on(table.actorUserId, table.status, table.expiresAt),
]);

export const aurionGuildGovernanceReceipts = mysqlTable("aurionGuildGovernanceReceipts", {
  receiptId: varchar("receiptId", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  operation: mysqlEnum("operation", ["grant_capability", "claim_territory", "release_territory", "consolidate_kingdom", "set_diplomacy"]).notNull(),
  expectedRevision: bigint("expectedRevision", { mode: "bigint", unsigned: true }).notNull(),
  resultingRevision: bigint("resultingRevision", { mode: "bigint", unsigned: true }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  confirmationHash: varchar("confirmationHash", { length: 64 }).notNull(),
  requestHash: varchar("requestHash", { length: 64 }).notNull(),
  resultHash: varchar("resultHash", { length: 64 }).notNull(),
  resultJson: text("resultJson").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildGovernanceReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionGuildGovernanceReceipts_confirmation_uq").on(table.confirmationHash),
  uniqueIndex("aurionGuildGovernanceReceipts_guild_revision_uq").on(table.guildId, table.resultingRevision),
  index("aurionGuildGovernanceReceipts_guild_created_idx").on(table.guildId, table.createdAt),
]);
