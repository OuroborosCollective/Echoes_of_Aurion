import fs from "node:fs";
import { createConnection } from "mysql2/promise";

/** CI-only staged schema. Never operates on real or remotely addressed databases. */
if (process.env.AURION_NATIVE_AUTH_E2E !== "1") throw new Error("NATIVE_AUTH_ISOLATED_FLAG_REQUIRED");
const value = process.env.DATABASE_URL;
if (!value) throw new Error("NATIVE_AUTH_TEST_DATABASE_URL_REQUIRED");
const url = new URL(value);
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (url.protocol !== "mysql:" || url.hostname !== "127.0.0.1" || url.port !== "3306" ||
    !/^[a-z0-9_]+_test$/.test(databaseName)) {
  throw new Error("NATIVE_AUTH_NON_ISOLATED_DATABASE_REJECTED");
}
const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
if (journal.entries.some(entry => entry.tag === "0075_aurion_native_auth_sessions")) {
  throw new Error("NATIVE_AUTH_SCHEMA_ALREADY_JOURNALED");
}
const statements = fs.readFileSync("fixtures/native-auth/0075_native_auth_candidate.sql", "utf8")
  .split("--> statement-breakpoint").map(text => text.trim()).filter(Boolean);
const expectedTables = [
  "aurionNativeAuthTransactions",
  "aurionNativeAuthSessions",
  "aurionNativeAuthRefreshTokens",
  "aurionNativeAuthAccessTokens",
];
if (statements.length !== expectedTables.length ||
    statements.some((text, i) => !text.startsWith("CREATE TABLE `" + expectedTables[i] + "` (") ||
      !text.endsWith(");") || /\b(?:DROP|ALTER|DELETE|UPDATE|INSERT|TRUNCATE)\b/i.test(text))) {
  throw new Error("NATIVE_AUTH_TEST_DDL_NOT_WHITELISTED");
}
const connection = await createConnection(value);
try {
  for (const statement of statements) await connection.query(statement);
  const [rows] = await connection.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?,?,?,?)",
    [databaseName, ...expectedTables],
  );
  if (rows.length !== expectedTables.length || expectedTables.some(name => !rows.some(row => row.name === name))) {
    throw new Error("NATIVE_AUTH_TEST_SCHEMA_READBACK_FAILED");
  }
  process.stdout.write(JSON.stringify({
    recordType: "aurion_native_auth_isolated_schema_fixture",
    databaseKind: "isolated_mysql_test",
    tablesCreated: expectedTables.length,
    productionApply: false,
  }) + "\n");
} finally {
  await connection.end();
}
