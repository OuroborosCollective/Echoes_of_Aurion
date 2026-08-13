import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** A one-time issued pairing authority for an external MCP-capable LLM client. */
export const gatewaySessions = mysqlTable("gatewaySessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  providerLabel: varchar("providerLabel", { length: 120 }).notNull(),
  tokenDigest: varchar("tokenDigest", { length: 128 }).notNull().unique(),
  allowedCommands: text("allowedCommands").notNull(),
  status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("gatewaySessions_userId_idx").on(table.userId)]);

/** Immutable normalized game commands; model prose and provider tokens are never stored here. */
export const gatewayCommands = mysqlTable("gatewayCommands", {
  id: varchar("id", { length: 64 }).primaryKey(),
  gatewaySessionId: varchar("gatewaySessionId", { length: 64 }).notNull(),
  sequence: int("sequence").notNull(),
  command: varchar("command", { length: 1 }).notNull(),
  source: varchar("source", { length: 32 }).default("authorized-mcp").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("gatewayCommands_session_sequence_uq").on(table.gatewaySessionId, table.sequence),
  index("gatewayCommands_session_created_idx").on(table.gatewaySessionId, table.createdAt),
]);

export type GatewaySession = typeof gatewaySessions.$inferSelect;
export type GatewayCommand = typeof gatewayCommands.$inferSelect;
