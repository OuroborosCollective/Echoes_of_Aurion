import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Aurion world-entity foundation — a definition-only registry for the classless
 * (RuneScape-style) progression world.
 *
 * These tables hold authored canonical content definitions sourced from the
 * Aurion content catalogs (e.g. `shared/aurionAx1ContentCatalog.json`). They
 * carry NO live gameplay state and NO receipts: runtime authority, progression
 * deltas and receipts remain in the existing Aurion receipt/state tables.
 *
 * Authority model: `definitions only` (liveState: false). A row is an immutable
 * content definition keyed by its catalog id; `definitionVersion` bumps when the
 * authored definition changes and `contentHash` pins the exact catalog payload
 * (sha256 of the definition JSON), so a drifted seed can be detected and re-synced.
 */

/** A classless skill/profession — crafting, gathering or civic. Unbounded leveling. */
export const aurionProfessionDefinitions = mysqlTable("aurionProfessionDefinitions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceId: varchar("sourceId", { length: 64 }).notNull(),
  category: mysqlEnum("category", ["crafting", "gathering", "civic"]).notNull(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  masteryScope: varchar("masteryScope", { length: 128 }).notNull(),
  unbounded: boolean("unbounded").default(true).notNull(),
  definitionJson: text("definitionJson").notNull(),
  sourceCatalog: varchar("sourceCatalog", { length: 120 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 120 }).notNull(),
  contentHash: varchar("contentHash", { length: 71 }).notNull(),
  definitionVersion: int("definitionVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionProfessionDefinitions_category_idx").on(table.category),
]);

/** A gather/process activity bound to a profession; grants scoped mastery XP. */
export const aurionActivityDefinitions = mysqlTable("aurionActivityDefinitions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  professionId: varchar("professionId", { length: 64 }).notNull(),
  kind: mysqlEnum("kind", ["gather", "process"]).notNull(),
  outputItemKey: varchar("outputItemKey", { length: 96 }).notNull(),
  outputItemLabel: varchar("outputItemLabel", { length: 120 }).notNull(),
  definitionJson: text("definitionJson").notNull(),
  sourceCatalog: varchar("sourceCatalog", { length: 120 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 120 }).notNull(),
  contentHash: varchar("contentHash", { length: 71 }).notNull(),
  definitionVersion: int("definitionVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionActivityDefinitions_profession_idx").on(table.professionId),
]);

/** A crafting recipe bound to a profession; consumes ingredients and yields items. */
export const aurionRecipeDefinitions = mysqlTable("aurionRecipeDefinitions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  professionId: varchar("professionId", { length: 64 }).notNull(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  outputItemKey: varchar("outputItemKey", { length: 96 }).notNull(),
  definitionJson: text("definitionJson").notNull(),
  sourceCatalog: varchar("sourceCatalog", { length: 120 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 120 }).notNull(),
  contentHash: varchar("contentHash", { length: 71 }).notNull(),
  definitionVersion: int("definitionVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionRecipeDefinitions_profession_idx").on(table.professionId),
]);

/** A world boss definition — spawn zone, coordinates and respawn cadence. */
export const aurionWorldBossDefinitions = mysqlTable("aurionWorldBossDefinitions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  zoneKey: varchar("zoneKey", { length: 96 }).notNull(),
  respawnTicksExact: varchar("respawnTicksExact", { length: 32 }).notNull(),
  definitionJson: text("definitionJson").notNull(),
  sourceCatalog: varchar("sourceCatalog", { length: 120 }).notNull(),
  contentVersion: varchar("contentVersion", { length: 120 }).notNull(),
  contentHash: varchar("contentHash", { length: 71 }).notNull(),
  definitionVersion: int("definitionVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("aurionWorldBossDefinitions_zone_idx").on(table.zoneKey),
]);

export type AurionProfessionDefinition = typeof aurionProfessionDefinitions.$inferSelect;
export type AurionActivityDefinition = typeof aurionActivityDefinitions.$inferSelect;
export type AurionRecipeDefinition = typeof aurionRecipeDefinitions.$inferSelect;
export type AurionWorldBossDefinition = typeof aurionWorldBossDefinitions.$inferSelect;
