import { sql } from "drizzle-orm";
import { check, index, int, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Extends the existing crafting receipt in the same MariaDB transaction. */
export const aurionProfessionReceipts = mysqlTable("aurionProfessionReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  sourceCraftingReceiptId: varchar("sourceCraftingReceiptId", { length: 64 }).notNull(),
  operationId: varchar("operationId", { length: 128 }).notNull(),
  commitHash: varchar("commitHash", { length: 64 }).notNull(),
  envelopeJson: text("envelopeJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionProfessionReceipts_source_uq").on(table.sourceCraftingReceiptId),
  uniqueIndex("aurionProfessionReceipts_operation_uq").on(table.operationId),
  index("aurionProfessionReceipts_user_idx").on(table.userId),
]);

/** Replayable scoped XP and quality events; legacy discipline events remain intact. */
export const aurionScopedMasteryEvents = mysqlTable("aurionScopedMasteryEvents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  scopeKey: varchar("scopeKey", { length: 128 }).notNull(),
  professionReceiptId: varchar("professionReceiptId", { length: 64 }).notNull(),
  eventHash: varchar("eventHash", { length: 64 }).notNull(),
  eventJson: text("eventJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionScopedMasteryEvents_source_scope_uq").on(table.userId, table.professionReceiptId, table.scopeKey),
  index("aurionScopedMasteryEvents_user_scope_idx").on(table.userId, table.scopeKey),
]);

/** Exact lazy origin ranges; index zero is the original inventory output. */
export const aurionProfessionOutputBatches = mysqlTable("aurionProfessionOutputBatches", {
  professionReceiptId: varchar("professionReceiptId", { length: 64 }).primaryKey(),
  sourceCraftingReceiptId: varchar("sourceCraftingReceiptId", { length: 64 }).notNull(),
  ownerUserId: int("ownerUserId").notNull(),
  totalQuantityExact: text("totalQuantityExact").notNull(),
  nextOutputIndexExact: text("nextOutputIndexExact").notNull(),
  templateJson: text("templateJson").notNull(),
}, table => [
  uniqueIndex("aurionProfessionOutputBatches_source_uq").on(table.sourceCraftingReceiptId),
  index("aurionProfessionOutputBatches_owner_idx").on(table.ownerUserId),
  check("aurionProfessionOutputBatches_quantity_ck", sql`${table.totalQuantityExact} REGEXP '^[1-9][0-9]*$'`),
  check("aurionProfessionOutputBatches_index_ck", sql`${table.nextOutputIndexExact} REGEXP '^[1-9][0-9]*$'`),
]);
