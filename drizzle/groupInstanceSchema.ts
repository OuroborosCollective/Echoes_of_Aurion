import { index, int, longtext, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** The bounded queue coordinator is the cross-process transaction lock, not a simulation timer. */
export const aurionGroupCoordinator = mysqlTable("aurionGroupCoordinator", {
  id: varchar("id", { length: 32 }).primaryKey(), nextOrdinal: int("nextOrdinal").default(1).notNull(),
});
export const aurionGroupPlayers = mysqlTable("aurionGroupPlayers", {
  userId: int("userId").primaryKey(), status: varchar("status", { length: 16 }).notNull(),
  queueKey: varchar("queueKey", { length: 96 }), partyId: varchar("partyId", { length: 64 }),
  stateJson: longtext("stateJson").notNull(), stateHash: varchar("stateHash", { length: 64 }).notNull(),
}, table => [index("aurionGroupPlayers_queue_idx").on(table.status, table.queueKey), index("aurionGroupPlayers_party_idx").on(table.partyId)]);
export const aurionGroupParties = mysqlTable("aurionGroupParties", {
  id: varchar("id", { length: 64 }).primaryKey(), stateJson: longtext("stateJson").notNull(), stateHash: varchar("stateHash", { length: 64 }).notNull(),
});
export const aurionGroupTickets = mysqlTable("aurionGroupTickets", {
  id: varchar("id", { length: 64 }).primaryKey(), partyId: varchar("partyId", { length: 64 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(), ticketJson: longtext("ticketJson").notNull(), ticketHash: varchar("ticketHash", { length: 64 }).notNull(),
}, table => [uniqueIndex("aurionGroupTickets_party_uq").on(table.partyId)]);
export const aurionGroupReceipts = mysqlTable("aurionGroupReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(), userId: int("userId").notNull(), expectedRevision: int("expectedRevision").notNull(),
  requestHash: varchar("requestHash", { length: 64 }).notNull(), resultJson: longtext("resultJson").notNull(), resultHash: varchar("resultHash", { length: 64 }).notNull(),
}, table => [uniqueIndex("aurionGroupReceipts_actor_revision_uq").on(table.userId, table.expectedRevision)]);
