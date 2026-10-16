import { bigint, index, int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Server-owned native login transaction. No browser cookie, state secret or handoff code is stored. */
export const aurionNativeAuthTransactions = mysqlTable("aurionNativeAuthTransactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  requestStateDigest: varchar("requestStateDigest", { length: 64 }).notNull(),
  codeChallenge: varchar("codeChallenge", { length: 43 }).notNull(),
  appBuild: varchar("appBuild", { length: 120 }).notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  expiresAtMs: bigint("expiresAtMs", { mode: "number" }).notNull(),
  verifiedUserId: int("verifiedUserId"),
  handoffCodeDigest: varchar("handoffCodeDigest", { length: 64 }),
  handoffExpiresAtMs: bigint("handoffExpiresAtMs", { mode: "number" }),
  issuedAtMs: bigint("issuedAtMs", { mode: "number" }),
  consumedAtMs: bigint("consumedAtMs", { mode: "number" }),
}, table => [
  uniqueIndex("aurionNativeAuthTransactions_handoff_uq").on(table.handoffCodeDigest),
  index("aurionNativeAuthTransactions_expiry_idx").on(table.expiresAtMs),
]);

/** A session is its own refresh-token family. Revocation applies to all issued tokens. */
export const aurionNativeAuthSessions = mysqlTable("aurionNativeAuthSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  appBuild: varchar("appBuild", { length: 120 }).notNull(),
  currentRefreshDigest: varchar("currentRefreshDigest", { length: 64 }).notNull(),
  createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
  absoluteExpiresAtMs: bigint("absoluteExpiresAtMs", { mode: "number" }).notNull(),
  idleExpiresAtMs: bigint("idleExpiresAtMs", { mode: "number" }).notNull(),
  revokedAtMs: bigint("revokedAtMs", { mode: "number" }),
}, table => [
  index("aurionNativeAuthSessions_user_idx").on(table.userId),
]);

/** Consumed refresh-token digests remain durable for replay detection. */
export const aurionNativeAuthRefreshTokens = mysqlTable("aurionNativeAuthRefreshTokens", {
  tokenDigest: varchar("tokenDigest", { length: 64 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  issuedAtMs: bigint("issuedAtMs", { mode: "number" }).notNull(),
  expiresAtMs: bigint("expiresAtMs", { mode: "number" }).notNull(),
  consumedAtMs: bigint("consumedAtMs", { mode: "number" }),
}, table => [
  index("aurionNativeAuthRefreshTokens_session_idx").on(table.sessionId),
]);

/** Short-lived access tokens are stored as digests, never as bearer plaintext. */
export const aurionNativeAuthAccessTokens = mysqlTable("aurionNativeAuthAccessTokens", {
  tokenDigest: varchar("tokenDigest", { length: 64 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  issuedAtMs: bigint("issuedAtMs", { mode: "number" }).notNull(),
  expiresAtMs: bigint("expiresAtMs", { mode: "number" }).notNull(),
}, table => [
  index("aurionNativeAuthAccessTokens_session_idx").on(table.sessionId),
]);
