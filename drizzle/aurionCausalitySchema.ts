import { bigint, index, int, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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





export const aurionEconomicLedgerCoordinator = mysqlTable("aurionEconomicLedgerCoordinator", {
  worldId: varchar("worldId", { length: 64 }).primaryKey(),
  nextOrdinal: bigint("nextOrdinal", { mode: "bigint", unsigned: true }).default(1n).notNull(),
});

export const aurionEconomicEvents = mysqlTable("aurionEconomicEvents", {
  eventId: varchar("eventId", { length: 96 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  ordinal: bigint("ordinal", { mode: "bigint", unsigned: true }).notNull(),
  eventType: mysqlEnum("eventType", ["economic_transition"]).notNull(),
  sourceKind: mysqlEnum("sourceKind", ["trade_crafting","loot_v1","loot_v2","market_transaction","system_sale","guild_bank","progression_points"]).notNull(),
  sourceId: varchar("sourceId", { length: 128 }).notNull(),
  sourceEvidenceHash: varchar("sourceEvidenceHash", { length: 96 }).notNull(),
  temporalEventId: varchar("temporalEventId", { length: 96 }).notNull(),
  temporalEventHash: varchar("temporalEventHash", { length: 96 }).notNull(),
  sourceWorldRoot: varchar("sourceWorldRoot", { length: 96 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  eventHash: varchar("eventHash", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionEconomicEvents_world_ordinal_uq").on(table.worldId, table.ordinal),
  uniqueIndex("aurionEconomicEvents_event_hash_uq").on(table.eventHash),
  uniqueIndex("aurionEconomicEvents_source_uq").on(table.sourceKind, table.sourceId),
  index("aurionEconomicEvents_world_epoch_idx").on(table.worldId, table.epoch),
]);

export const aurionEconomicResourceDeltas = mysqlTable("aurionEconomicResourceDeltas", {
  eventId: varchar("eventId", { length: 96 }).notNull(),
  resourceId: varchar("resourceId", { length: 96 }).notNull(),
  accountId: varchar("accountId", { length: 128 }).notNull(),
  deltaExact: varchar("deltaExact", { length: 128 }).notNull(),
}, table => [
  primaryKey({ name: "aurionEconomicResourceDeltas_pk", columns: [table.eventId, table.resourceId, table.accountId] }),
  index("aurionEconomicResourceDeltas_resource_account_idx").on(table.resourceId, table.accountId),
]);

export const aurionEconomicAssetTransitions = mysqlTable("aurionEconomicAssetTransitions", {
  eventId: varchar("eventId", { length: 96 }).notNull(),
  assetId: varchar("assetId", { length: 128 }).notNull(),
  transitionKind: mysqlEnum("transitionKind", ["create","transfer","consume"]).notNull(),
  fromOwnerId: varchar("fromOwnerId", { length: 128 }),
  toOwnerId: varchar("toOwnerId", { length: 128 }),
}, table => [
  primaryKey({ name: "aurionEconomicAssetTransitions_pk", columns: [table.eventId, table.assetId] }),
  index("aurionEconomicAssetTransitions_asset_idx").on(table.assetId),
]);

export const aurionTemporalEvents = mysqlTable("aurionTemporalEvents", {
  eventId: varchar("eventId", { length: 96 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  domain: mysqlEnum("domain", ["world","zone","quest","npc","faction","economy","ownership","social"]).notNull(),
  validFromEpoch: int("validFromEpoch").notNull(),
  validToEpoch: int("validToEpoch"),
  sourceReceiptHash: varchar("sourceReceiptHash", { length: HASH_LENGTH }).notNull(),
  sourceWorldRoot: varchar("sourceWorldRoot", { length: HASH_LENGTH }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  payloadJson: text("payloadJson").notNull(),
  payloadHash: varchar("payloadHash", { length: HASH_LENGTH }).notNull(),
  eventHash: varchar("eventHash", { length: HASH_LENGTH }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionTemporalEvents_event_hash_uq").on(table.eventHash),
  index("aurionTemporalEvents_world_epoch_idx").on(table.worldId, table.epoch),
  index("aurionTemporalEvents_world_domain_epoch_idx").on(table.worldId, table.domain, table.epoch),
]);

export const aurionTemporalEventSubjects = mysqlTable("aurionTemporalEventSubjects", {
  eventId: varchar("eventId", { length: 96 }).notNull(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  subjectId: varchar("subjectId", { length: 128 }).notNull(),
  domain: mysqlEnum("domain", ["world","zone","quest","npc","faction","economy","ownership","social"]).notNull(),
  validFromEpoch: int("validFromEpoch").notNull(),
  validToEpoch: int("validToEpoch"),
}, table => [
  primaryKey({ name: "aurionTemporalEventSubjects_pk", columns: [table.eventId, table.subjectId] }),
  index("aurionTemporalEventSubjects_world_subject_epoch_idx").on(table.worldId, table.subjectId, table.validFromEpoch),
]);

export const aurionTemporalEventPredecessors = mysqlTable("aurionTemporalEventPredecessors", {
  eventId: varchar("eventId", { length: 96 }).notNull(),
  predecessorEventId: varchar("predecessorEventId", { length: 96 }).notNull(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
}, table => [
  primaryKey({ name: "aurionTemporalEventPredecessors_pk", columns: [table.eventId, table.predecessorEventId] }),
  index("aurionTemporalEventPredecessors_predecessor_idx").on(table.predecessorEventId),
  index("aurionTemporalEventPredecessors_world_event_idx").on(table.worldId, table.eventId),
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

/** AIM-298: append-only binding from a persisted quest receipt to one real causal tick/root. */
export const aurionQuestCausalAnchors = mysqlTable("aurionQuestCausalAnchors", {
  id: varchar("id", { length: 96 }).primaryKey(),
  questReceiptId: varchar("questReceiptId", { length: 128 }).notNull(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  epoch: int("epoch").notNull(),
  zoneId: varchar("zoneId", { length: 128 }).notNull(),
  tick: int("tick").notNull(),
  causalReceiptHash: varchar("causalReceiptHash", { length: HASH_LENGTH }).notNull(),
  sourceWorldRoot: varchar("sourceWorldRoot", { length: HASH_LENGTH }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  sourceEvidenceId: varchar("sourceEvidenceId", { length: 128 }).notNull(),
  sourceEvidenceDigest: varchar("sourceEvidenceDigest", { length: 64 }).notNull(),
  sourceLogicalRevision: int("sourceLogicalRevision").notNull(),
  triggerEventId: varchar("triggerEventId", { length: 128 }).notNull(),
  triggerEventDigest: varchar("triggerEventDigest", { length: 128 }).notNull(),
  compilerVersion: varchar("compilerVersion", { length: 64 }).notNull(),
  templateSetHash: varchar("templateSetHash", { length: 64 }).notNull(),
  candidateSetHash: varchar("candidateSetHash", { length: 64 }).notNull(),
  seedDigest: varchar("seedDigest", { length: 64 }).notNull(),
  roleBindingHash: varchar("roleBindingHash", { length: 64 }).notNull(),
  commandId: varchar("commandId", { length: 64 }).notNull(),
  planHash: varchar("planHash", { length: 64 }).notNull(),
  graphHash: varchar("graphHash", { length: 64 }).notNull(),
  previousStateHash: varchar("previousStateHash", { length: 64 }).notNull(),
  resultStateHash: varchar("resultStateHash", { length: 64 }).notNull(),
  anchorHash: varchar("anchorHash", { length: HASH_LENGTH }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionQuestCausalAnchors_receipt_uq").on(table.questReceiptId),
  uniqueIndex("aurionQuestCausalAnchors_anchor_uq").on(table.anchorHash),
  index("aurionQuestCausalAnchors_causal_receipt_idx").on(table.causalReceiptHash),
  index("aurionQuestCausalAnchors_world_epoch_idx").on(table.worldId, table.epoch),
  index("aurionQuestCausalAnchors_world_source_idx").on(table.worldId, table.sourceEvidenceId),
]);
