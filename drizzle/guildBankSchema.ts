import { bigint, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const bankOperations = ["deposit_points", "withdraw_points", "deposit_item", "withdraw_item", "donate_resource_item", "upgrade_building"] as const;
const guildCapabilities = ["member_manage", "diplomacy_manage", "territory_manage", "bank_deposit", "bank_withdraw", "building_manage", "kingdom_consolidate"] as const;

export const aurionGuildTreasuryAccounts = mysqlTable("aurionGuildTreasuryAccounts", {
  guildId: varchar("guildId", { length: 64 }).primaryKey(),
  balance: bigint("balance", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aurionGuildBankPlans = mysqlTable("aurionGuildBankPlans", {
  confirmationHash: varchar("confirmationHash", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  operation: mysqlEnum("operation", bankOperations).notNull(),
  requiredCapability: mysqlEnum("requiredCapability", guildCapabilities).notNull(),
  expectedRevision: bigint("expectedRevision", { mode: "bigint", unsigned: true }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  resourcesJson: text("resourcesJson").notNull(),
  planJson: text("planJson").notNull(),
  status: mysqlEnum("status", ["planned", "consumed", "expired"]).default("planned").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),
}, table => [
  uniqueIndex("aurionGuildBankPlans_idempotency_uq").on(table.idempotencyKey),
  index("aurionGuildBankPlans_actor_status_idx").on(table.actorUserId, table.status, table.expiresAt),
]);

export const aurionGuildBankReceipts = mysqlTable("aurionGuildBankReceipts", {
  receiptId: varchar("receiptId", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  operation: mysqlEnum("operation", bankOperations).notNull(),
  expectedRevision: bigint("expectedRevision", { mode: "bigint", unsigned: true }).notNull(),
  resultingRevision: bigint("resultingRevision", { mode: "bigint", unsigned: true }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull(),
  confirmationHash: varchar("confirmationHash", { length: 64 }).notNull(),
  requestHash: varchar("requestHash", { length: 64 }).notNull(),
  resultHash: varchar("resultHash", { length: 64 }).notNull(),
  resultJson: text("resultJson").notNull(),
  ruleSetVersion: varchar("ruleSetVersion", { length: 96 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildBankReceipts_idempotency_uq").on(table.idempotencyKey),
  uniqueIndex("aurionGuildBankReceipts_confirmation_uq").on(table.confirmationHash),
  uniqueIndex("aurionGuildBankReceipts_guild_revision_uq").on(table.guildId, table.resultingRevision),
  index("aurionGuildBankReceipts_guild_created_idx").on(table.guildId, table.createdAt),
]);

export const aurionGuildTreasuryLedger = mysqlTable("aurionGuildTreasuryLedger", {
  entryId: varchar("entryId", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  receiptId: varchar("receiptId", { length: 64 }).notNull(),
  direction: mysqlEnum("direction", ["credit", "debit"]).notNull(),
  reason: mysqlEnum("reason", ["player_deposit", "player_withdrawal", "building_upgrade"]).notNull(),
  amount: bigint("amount", { mode: "bigint", unsigned: true }).notNull(),
  balanceBefore: bigint("balanceBefore", { mode: "bigint", unsigned: true }).notNull(),
  balanceAfter: bigint("balanceAfter", { mode: "bigint", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildTreasuryLedger_receipt_uq").on(table.receiptId),
  index("aurionGuildTreasuryLedger_guild_created_idx").on(table.guildId, table.createdAt),
]);

export const aurionGuildItemCustody = mysqlTable("aurionGuildItemCustody", {
  custodyId: varchar("custodyId", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  itemRecordVersion: mysqlEnum("itemRecordVersion", ["legacy", "aurion_v2"]).notNull(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  depositorUserId: int("depositorUserId").notNull(),
  currentRecipientUserId: int("currentRecipientUserId"),
  status: mysqlEnum("status", ["held", "withdrawn"]).default("held").notNull(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).notNull(),
  depositReceiptId: varchar("depositReceiptId", { length: 64 }).notNull(),
  withdrawalReceiptId: varchar("withdrawalReceiptId", { length: 64 }),
  depositedAt: timestamp("depositedAt").defaultNow().notNull(),
  withdrawnAt: timestamp("withdrawnAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildItemCustody_item_uq").on(table.itemRecordVersion, table.itemId),
  index("aurionGuildItemCustody_guild_status_idx").on(table.guildId, table.status, table.updatedAt),
]);

export const aurionGuildItemCustodyLedger = mysqlTable("aurionGuildItemCustodyLedger", {
  eventId: varchar("eventId", { length: 64 }).primaryKey(),
  custodyId: varchar("custodyId", { length: 64 }).notNull(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  itemRecordVersion: mysqlEnum("itemRecordVersion", ["legacy", "aurion_v2"]).notNull(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  actorUserId: int("actorUserId").notNull(),
  eventType: mysqlEnum("eventType", ["deposit", "withdrawal"]).notNull(),
  receiptId: varchar("receiptId", { length: 64 }).notNull(),
  previousOwnerUserId: int("previousOwnerUserId").notNull(),
  resultingOwnerUserId: int("resultingOwnerUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildItemCustodyLedger_receipt_uq").on(table.receiptId),
  index("aurionGuildItemCustodyLedger_custody_created_idx").on(table.custodyId, table.createdAt),
]);

export const aurionGuildResourceAccounts = mysqlTable("aurionGuildResourceAccounts", {
  id: varchar("id", { length: 160 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  resourceKey: mysqlEnum("resourceKey", ["wood", "stone", "aether"]).notNull(),
  balance: bigint("balance", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("aurionGuildResourceAccounts_guild_resource_uq").on(table.guildId, table.resourceKey)]);

export const aurionGuildResourceLedger = mysqlTable("aurionGuildResourceLedger", {
  entryId: varchar("entryId", { length: 64 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  resourceKey: mysqlEnum("resourceKey", ["wood", "stone", "aether"]).notNull(),
  direction: mysqlEnum("direction", ["credit", "debit"]).notNull(),
  amount: bigint("amount", { mode: "bigint", unsigned: true }).notNull(),
  balanceBefore: bigint("balanceBefore", { mode: "bigint", unsigned: true }).notNull(),
  balanceAfter: bigint("balanceAfter", { mode: "bigint", unsigned: true }).notNull(),
  sourceItemRecordVersion: mysqlEnum("sourceItemRecordVersion", ["legacy", "aurion_v2"]),
  sourceItemId: varchar("sourceItemId", { length: 64 }),
  sourceReceiptId: varchar("sourceReceiptId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildResourceLedger_receipt_resource_uq").on(table.sourceReceiptId, table.resourceKey),
  index("aurionGuildResourceLedger_guild_created_idx").on(table.guildId, table.createdAt),
]);

export const aurionGuildBuildings = mysqlTable("aurionGuildBuildings", {
  id: varchar("id", { length: 160 }).primaryKey(),
  guildId: varchar("guildId", { length: 64 }).notNull(),
  buildingId: varchar("buildingId", { length: 96 }).notNull(),
  level: bigint("level", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  revision: bigint("revision", { mode: "bigint", unsigned: true }).default(0n).notNull(),
  upgradeReceiptId: varchar("upgradeReceiptId", { length: 64 }),
  projectionJson: text("projectionJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionGuildBuildings_guild_building_uq").on(table.guildId, table.buildingId),
  index("aurionGuildBuildings_guild_level_idx").on(table.guildId, table.level),
]);
