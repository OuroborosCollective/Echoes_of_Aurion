import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const HASH_LENGTH = 96;

export const aurionCausalTickReceipts = mysqlTable("aurionCausalTickReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  tick: int("tick").notNull(),
  revision: varchar("revision", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  preStateHash: varchar("preStateHash", { length: HASH_LENGTH }).notNull(),
  inputHash: varchar("inputHash", { length: HASH_LENGTH }).notNull(),
  inputJson: text("inputJson"),
  transitionHash: varchar("transitionHash", { length: HASH_LENGTH }).notNull(),
  rngRootHash: varchar("rngRootHash", { length: HASH_LENGTH }).notNull(),
  postStateHash: varchar("postStateHash", { length: HASH_LENGTH }).notNull(),
  previousReceiptHash: varchar("previousReceiptHash", { length: HASH_LENGTH }),
  receiptHash: varchar("receiptHash", { length: HASH_LENGTH }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCausalTickReceipts_world_zone_tick_uq").on(table.worldId, table.zoneId, table.tick),
  uniqueIndex("aurionCausalTickReceipts_receipt_hash_uq").on(table.receiptHash),
  index("aurionCausalTickReceipts_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

export const aurionCausalCheckpoints = mysqlTable("aurionCausalCheckpoints", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  tick: int("tick").notNull(),
  snapshotHash: varchar("snapshotHash", { length: HASH_LENGTH }).notNull(),
  snapshotJson: text("snapshotJson").notNull(),
  reconciled: int("reconciled").default(0).notNull(),
  reconciledAt: timestamp("reconciledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCausalCheckpoints_world_zone_tick_uq").on(table.worldId, table.zoneId, table.tick),
  index("aurionCausalCheckpoints_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

export const aurionReplayRuns = mysqlTable("aurionReplayRuns", {
  id: varchar("id", { length: 96 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  fromTick: int("fromTick").notNull(),
  toTick: int("toTick").notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  runtimeRuleset: varchar("runtimeRuleset", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["MATCH", "FIRST_DIVERGENCE", "UNPROVABLE"]).notNull(),
  firstDivergentStage: varchar("firstDivergentStage", { length: 64 }),
  expectedHash: varchar("expectedHash", { length: HASH_LENGTH }),
  observedHash: varchar("observedHash", { length: HASH_LENGTH }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("aurionReplayRuns_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt)]);

export const aurionCausalArchive = mysqlTable("aurionCausalArchive", {
  id: varchar("id", { length: 96 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  startTick: int("startTick").notNull(),
  endTick: int("endTick").notNull(),
  receiptCount: int("receiptCount").notNull(),
  archiveHash: varchar("archiveHash", { length: HASH_LENGTH }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCausalArchive_world_zone_start_uq").on(table.worldId, table.zoneId, table.startTick),
  index("aurionCausalArchive_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

export const aurionCrossZoneTransfers = mysqlTable("aurionCrossZoneTransfers", {
  id: varchar("id", { length: 96 }).primaryKey(),
  sourceWorldId: varchar("sourceWorldId", { length: 64 }).notNull(),
  sourceZoneId: varchar("sourceZoneId", { length: 64 }).notNull(),
  sourceTick: int("sourceTick").notNull(),
  targetWorldId: varchar("targetWorldId", { length: 64 }).notNull(),
  targetZoneId: varchar("targetZoneId", { length: 64 }).notNull(),
  targetTick: int("targetTick"),
  transferHash: varchar("transferHash", { length: HASH_LENGTH }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  status: mysqlEnum("status", ["PENDING", "CONSUMED", "REJECTED"]).default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),
}, table => [
  index("aurionCrossZoneTransfers_source_idx").on(table.sourceWorldId, table.sourceZoneId, table.sourceTick),
  index("aurionCrossZoneTransfers_target_idx").on(table.targetWorldId, table.targetZoneId),
]);

export const aurionGlobalStateProofs = mysqlTable("aurionGlobalStateProofs", {
  id: varchar("id", { length: 96 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  globalProofHash: varchar("globalProofHash", { length: HASH_LENGTH }).notNull(),
  globalProofJson: text("globalProofJson").notNull(),
  status: mysqlEnum("status", ["VERIFIED", "UNPROVABLE", "CONFLICT"]).default("UNPROVABLE").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGlobalStateProofs_world_epoch_uq").on(table.worldId, table.epoch),
  uniqueIndex("aurionGlobalStateProofs_hash_uq").on(table.globalProofHash),
  index("aurionGlobalStateProofs_world_created_idx").on(table.worldId, table.createdAt),
]);
