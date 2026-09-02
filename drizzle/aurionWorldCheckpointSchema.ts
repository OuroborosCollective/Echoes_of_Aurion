import { int, longtext, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Immutable, server-authoritative checkpoints for a confirmed Aurion world epoch.
 * A checkpoint is a read model boundary: clients may consume it but cannot write it.
 */
export const aurionWorldCheckpoints = mysqlTable(
  "aurionWorldCheckpoints",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    worldId: varchar("worldId", { length: 64 }).notNull(),
    worldSeed: varchar("worldSeed", { length: 128 }).notNull(),
    epoch: int("epoch").notNull(),
    worldRevision: varchar("worldRevision", { length: 64 }).notNull(),
    chunkRevision: varchar("chunkRevision", { length: 64 }).notNull(),
    snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),
    snapshotJson: longtext("snapshotJson").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("aurionWorldCheckpoints_world_seed_epoch_uq").on(
      table.worldId,
      table.worldSeed,
      table.epoch,
    ),
    uniqueIndex("aurionWorldCheckpoints_revision_uq").on(
      table.worldId,
      table.worldRevision,
      table.chunkRevision,
    ),
    uniqueIndex("aurionWorldCheckpoints_snapshot_hash_uq").on(table.snapshotHash),
    uniqueIndex("aurionWorldCheckpoints_idempotency_uq").on(table.idempotencyKey),
  ],
);

export type AurionWorldCheckpointRow = typeof aurionWorldCheckpoints.$inferSelect;
export type InsertAurionWorldCheckpointRow = typeof aurionWorldCheckpoints.$inferInsert;
