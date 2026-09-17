import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Append-only causal tick receipts.
 * This provides the primary evidence chain for world development.
 */
export const aurionCausalTickReceipts = mysqlTable("aurionCausalTickReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  tick: int("tick").notNull(),
  revision: varchar("revision", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  preStateHash: varchar("preStateHash", { length: 64 }).notNull(),
  inputHash: varchar("inputHash", { length: 64 }).notNull(),
  inputJson: text("inputJson"),
  transitionHash: varchar("transitionHash", { length: 64 }).notNull(),
  rngRootHash: varchar("rngRootHash", { length: 64 }).notNull(),
  postStateHash: varchar("postStateHash", { length: 64 }).notNull(),
  previousReceiptHash: varchar("previousReceiptHash", { length: 64 }),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCausalTickReceipts_world_zone_tick_uq").on(table.worldId, table.zoneId, table.tick),
  uniqueIndex("aurionCausalTickReceipts_receipt_hash_uq").on(table.receiptHash),
  index("aurionCausalTickReceipts_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

/**
 * Sparse snapshots of the canonical world state.
 * Checkpoints allow the replay engine to start from a recent state instead of tick 0.
 */
export const aurionCausalCheckpoints = mysqlTable("aurionCausalCheckpoints", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  tick: int("tick").notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),
  snapshotJson: text("snapshotJson").notNull(),
  reconciled: int("reconciled").default(0).notNull(), // 0 = no, 1 = success, -1 = divergent
  reconciledAt: timestamp("reconciledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCausalCheckpoints_world_zone_tick_uq").on(table.worldId, table.zoneId, table.tick),
  index("aurionCausalCheckpoints_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

/**
 * Records of replay verification runs.
 * This table documents the status of independent verifications.
 */
export const aurionReplayRuns = mysqlTable("aurionReplayRuns", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  fromTick: int("fromTick").notNull(),
  toTick: int("toTick").notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  runtimeRuleset: varchar("runtimeRuleset", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["MATCH", "FIRST_DIVERGENCE", "UNPROVABLE"]).notNull(),
  firstDivergentStage: varchar("firstDivergentStage", { length: 64 }),
  expectedHash: varchar("expectedHash", { length: 64 }),
  observedHash: varchar("observedHash", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("aurionReplayRuns_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

/**
 * Cold storage for verified causal chains.
 * Batches of receipts are moved here to keep the hot receipts table lean.
 */
export const aurionCausalArchive = mysqlTable("aurionCausalArchive", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  startTick: int("startTick").notNull(),
  endTick: int("endTick").notNull(),
  receiptCount: int("receiptCount").notNull(),
  archiveHash: varchar("archiveHash", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(), // Batch of summarized receipts
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCausalArchive_world_zone_start_uq").on(table.worldId, table.zoneId, table.startTick),
  index("aurionCausalArchive_world_zone_created_idx").on(table.worldId, table.zoneId, table.createdAt),
]);

/**
 * Cross-zone causal transfers.
 * Used to synchronize deterministic interactions between adjacent simulation domains.
 */
export const aurionCrossZoneTransfers = mysqlTable("aurionCrossZoneTransfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceWorldId: varchar("sourceWorldId", { length: 64 }).notNull(),
  sourceZoneId: varchar("sourceZoneId", { length: 64 }).notNull(),
  sourceTick: int("sourceTick").notNull(),
  targetWorldId: varchar("targetWorldId", { length: 64 }).notNull(),
  targetZoneId: varchar("targetZoneId", { length: 64 }).notNull(),
  targetTick: int("targetTick"), // Nullable until consumed by target zone
  transferHash: varchar("transferHash", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(), // The object being transferred (e.g. Player data)
  status: mysqlEnum("status", ["PENDING", "CONSUMED", "REJECTED"]).default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),
}, table => [
  index("aurionCrossZoneTransfers_source_idx").on(table.sourceWorldId, table.sourceZoneId, table.sourceTick),
  index("aurionCrossZoneTransfers_target_idx").on(table.targetWorldId, table.targetZoneId),
]);

/**
 * Aggregated causal proofs for global world epochs.
 * This table reconciles all zone-specific proofs into a unified world evidence record.
 */
export const aurionGlobalStateProofs = mysqlTable("aurionGlobalStateProofs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  globalProofHash: varchar("globalProofHash", { length: 64 }).notNull(),
  globalProofJson: text("globalProofJson").notNull(), // GlobalWorldCanonicalState
  status: mysqlEnum("status", ["VERIFIED", "UNPROVABLE", "CONFLICT"]).default("VERIFIED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionGlobalStateProofs_world_epoch_uq").on(table.worldId, table.epoch),
  uniqueIndex("aurionGlobalStateProofs_hash_uq").on(table.globalProofHash),
  index("aurionGlobalStateProofs_world_created_idx").on(table.worldId, table.createdAt),
]);
