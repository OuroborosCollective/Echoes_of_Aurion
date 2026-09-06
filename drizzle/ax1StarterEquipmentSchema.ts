import { index, int, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Aurion persists provenance only. The starter definition itself is owned by AX1
 * and every row is bound to the exact AX1 source revision/blob that supplied it.
 */
export const aurionAx1StarterEquipmentReceipts = mysqlTable("aurionAx1StarterEquipmentReceipts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  definitionId: varchar("definitionId", { length: 96 }).notNull(),
  sourceRevision: varchar("sourceRevision", { length: 40 }).notNull(),
  sourceBlobSha: varchar("sourceBlobSha", { length: 40 }).notNull(),
  sourcePath: varchar("sourcePath", { length: 192 }).notNull(),
  contentSha256: varchar("contentSha256", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("aurionAx1StarterEquipmentReceipts_user_definition_uq").on(table.userId, table.definitionId),
  index("aurionAx1StarterEquipmentReceipts_user_created_idx").on(table.userId, table.createdAt),
]);
