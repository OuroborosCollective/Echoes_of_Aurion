import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const HASH_LENGTH = 96;

export const aurionCausalTickReceipts = mysqlTable("aurionCausalTickReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  tick: int("tick").notNull(),
  revision: varchar("revision", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  receiptSchema: varchar("receiptSchema", { length: 64 }).default("aurion.causal.tick.v1").notNull(),
  preStateHash: varchar("preStateHash", { length: HASH_LENGTH }).notNull(),
  inputHash: varchar("inputHash", { length: HASH_LENGTH }).notNull(),
  inputJson: text("inputJson"),
  stageReceiptsJson: text("stageReceiptsJson"),
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
  handoverVersion: int("handoverVersion").default(1).notNull(),
  entityId: varchar("entityId", { length: 128 }),
  sourceWorldId: varchar("sourceWorldId", { length: 64 }).notNull(),
  sourceZoneId: varchar("sourceZoneId", { length: 64 }).notNull(),
  sourceTick: int("sourceTick").notNull(),
  sourceReceiptHash: varchar("sourceReceiptHash", { length: HASH_LENGTH }),
  sourceStateHash: varchar("sourceStateHash", { length: HASH_LENGTH }),
  targetWorldId: varchar("targetWorldId", { length: 64 }).notNull(),
  targetZoneId: varchar("targetZoneId", { length: 64 }).notNull(),
  targetTick: int("targetTick"),
  targetAcceptedTick: int("targetAcceptedTick"),
  targetReceiptHash: varchar("targetReceiptHash", { length: HASH_LENGTH }),
  transferHash: varchar("transferHash", { length: HASH_LENGTH }).notNull(),
  payloadHash: varchar("payloadHash", { length: HASH_LENGTH }),
  payloadJson: text("payloadJson").notNull(),
  transferReceiptHash: varchar("transferReceiptHash", { length: HASH_LENGTH }),
  previousTransferReceiptHash: varchar("previousTransferReceiptHash", { length: HASH_LENGTH }),
  status: mysqlEnum("status", [
    "PENDING", "CONSUMED",
    "PREPARED", "SOURCE_FROZEN", "TARGET_ACCEPTED", "SOURCE_FINALIZED", "COMMITTED",
    "REJECTED", "EXPIRED", "UNPROVABLE",
  ]).default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  consumedAt: timestamp("consumedAt"),
}, table => [
  index("aurionCrossZoneTransfers_source_idx").on(table.sourceWorldId, table.sourceZoneId, table.sourceTick),
  index("aurionCrossZoneTransfers_target_idx").on(table.targetWorldId, table.targetZoneId),
  index("aurionCrossZoneTransfers_entity_status_idx").on(table.entityId, table.status),
  uniqueIndex("aurionCrossZoneTransfers_receipt_hash_uq").on(table.transferReceiptHash),
]);

export const aurionCrossZoneTransferReceipts = mysqlTable("aurionCrossZoneTransferReceipts", {
  id: varchar("id", { length: 96 }).primaryKey(),
  transferId: varchar("transferId", { length: 96 }).notNull(),
  sequence: int("sequence").notNull(),
  entityId: varchar("entityId", { length: 128 }).notNull(),
  status: mysqlEnum("status", [
    "PREPARED", "SOURCE_FROZEN", "TARGET_ACCEPTED", "SOURCE_FINALIZED", "COMMITTED",
    "REJECTED", "EXPIRED", "UNPROVABLE",
  ]).notNull(),
  transferReceiptHash: varchar("transferReceiptHash", { length: HASH_LENGTH }).notNull(),
  previousTransferReceiptHash: varchar("previousTransferReceiptHash", { length: HASH_LENGTH }),
  receiptJson: text("receiptJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionCrossZoneTransferReceipts_transfer_sequence_uq").on(table.transferId, table.sequence),
  uniqueIndex("aurionCrossZoneTransferReceipts_hash_uq").on(table.transferReceiptHash),
  index("aurionCrossZoneTransferReceipts_entity_idx").on(table.entityId, table.createdAt),
]);

export const aurionEntityZoneOwnership = mysqlTable("aurionEntityZoneOwnership", {
  entityId: varchar("entityId", { length: 128 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  zoneId: varchar("zoneId", { length: 64 }).notNull(),
  mode: mysqlEnum("mode", ["ACTIVE", "FROZEN"]).default("ACTIVE").notNull(),
  activeTransferId: varchar("activeTransferId", { length: 96 }),
  generation: int("generation").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionEntityZoneOwnership_zone_mode_idx").on(table.worldId, table.zoneId, table.mode),
  uniqueIndex("aurionEntityZoneOwnership_active_transfer_uq").on(table.activeTransferId),
]);

export const aurionEffectIntents = mysqlTable("aurionEffectIntents", {
  effectId: varchar("effectId", { length: 96 }).primaryKey(),
  authorityReceiptHash: varchar("authorityReceiptHash", { length: HASH_LENGTH }).notNull(),
  effectType: varchar("effectType", { length: 96 }).notNull(),
  subjectId: varchar("subjectId", { length: 128 }).notNull(),
  ordinal: int("ordinal").notNull(),
  payloadHash: varchar("payloadHash", { length: HASH_LENGTH }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  deliveryState: mysqlEnum("deliveryState", ["PENDING", "DELIVERED", "FAILED", "RETRYABLE", "PERMANENT_FAILURE"]).default("PENDING").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  providerReceiptHash: varchar("providerReceiptHash", { length: HASH_LENGTH }),
  lastErrorCode: varchar("lastErrorCode", { length: 96 }),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("aurionEffectIntents_authority_identity_uq").on(table.authorityReceiptHash, table.effectType, table.subjectId, table.ordinal),
  index("aurionEffectIntents_state_created_idx").on(table.deliveryState, table.createdAt),
]);

export const aurionEffectDeliveryReceipts = mysqlTable("aurionEffectDeliveryReceipts", {
  id: varchar("id", { length: 96 }).primaryKey(),
  effectId: varchar("effectId", { length: 96 }).notNull(),
  attempt: int("attempt").notNull(),
  deliveryState: mysqlEnum("deliveryState", ["PENDING", "DELIVERED", "FAILED", "RETRYABLE", "PERMANENT_FAILURE"]).notNull(),
  providerReceiptHash: varchar("providerReceiptHash", { length: HASH_LENGTH }),
  errorCode: varchar("errorCode", { length: 96 }),
  deliveryReceiptHash: varchar("deliveryReceiptHash", { length: HASH_LENGTH }).notNull(),
  previousDeliveryReceiptHash: varchar("previousDeliveryReceiptHash", { length: HASH_LENGTH }),
  receiptJson: text("receiptJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionEffectDeliveryReceipts_effect_attempt_uq").on(table.effectId, table.attempt),
  uniqueIndex("aurionEffectDeliveryReceipts_hash_uq").on(table.deliveryReceiptHash),
  index("aurionEffectDeliveryReceipts_effect_created_idx").on(table.effectId, table.createdAt),
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
