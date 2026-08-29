import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import {
  classifyMigrationContract,
  lateAurionMigrationTags,
  parseLateMigrationSql,
  type ExpectedMigration,
  type MigrationClassification,
  type ObservedIndex,
  type ObservedTable,
} from "./aurionProductionSchemaReconciliation";

const projectRoot = path.resolve(process.env.AURION_SCHEMA_APPLY_ROOT?.trim() || process.cwd());
const lockName = "aurion_production_schema_apply_0021_0027";

type ApplyFailureStage =
  | "INITIALIZE"
  | "READ_ENVIRONMENT"
  | "READ_EXPECTED_MIGRATIONS"
  | "CONNECT_DATABASE"
  | "ACQUIRE_LOCK"
  | "PREFLIGHT_SCHEMA"
  | "PREFLIGHT_JOURNAL"
  | "MIGRATE"
  | "POSTFLIGHT_SCHEMA"
  | "POSTFLIGHT_JOURNAL"
  | "CLOSE_DATABASE";

type ApplyErrorClass =
  | "SOURCE_REVISION_INVALID"
  | "PLAN_HASH_INVALID"
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_INVALID"
  | "ENVIRONMENT_FILE_NOT_FOUND"
  | "SCHEMA_NOT_APPLYABLE"
  | "JOURNAL_CONFLICT"
  | "DATABASE_LOCK_UNAVAILABLE"
  | "APPLY_EXECUTION_FAILED";

class SchemaApplyError extends Error {
  constructor(readonly code: ApplyErrorClass) {
    super(code);
  }
}

type ColumnRow = RowDataPacket & {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
};

type IndexRow = RowDataPacket & {
  TABLE_NAME: string;
  INDEX_NAME: string;
  NON_UNIQUE: number;
  SEQ_IN_INDEX: number;
  COLUMN_NAME: string;
};

type DrizzleJournalRow = RowDataPacket & {
  hash: string;
  created_at: string | number;
};

type MigrationJournalEntry = Readonly<{
  tag: string;
  when: number;
  hash: string;
}>;

type JournalState = Readonly<{
  exists: boolean;
  rowsAtOrAfterFirstLateMigration: readonly { hash: string; when: number }[];
}>;

let failureStage: ApplyFailureStage = "INITIALIZE";
let sourceRevision: string | null = null;
let planSha256: string | null = null;
let preflightSummary: Record<string, number> | null = null;

function parseEnvironmentValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1);
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\([\\"nrt])/g, (_match, escaped: string) => {
      if (escaped === "n") return "\n";
      if (escaped === "r") return "\r";
      if (escaped === "t") return "\t";
      return escaped;
    });
  }
  return value;
}

function resolveIdentity(name: string, expression: RegExp, errorCode: ApplyErrorClass): string {
  const value = process.env[name]?.trim().toLowerCase() || "";
  if (!expression.test(value)) throw new SchemaApplyError(errorCode);
  return value;
}

async function databaseUrlFromEnvironmentFile(envFile: string): Promise<string | null> {
  let source: string;
  try {
    source = await readFile(envFile, "utf8");
  } catch {
    throw new SchemaApplyError("ENVIRONMENT_FILE_NOT_FOUND");
  }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=([\s\S]*)$/);
    if (!match) continue;
    const value = parseEnvironmentValue(match[1]);
    if (!value || /[\r\n\0]/.test(value)) throw new SchemaApplyError("DATABASE_URL_INVALID");
    return value;
  }
  return null;
}

async function resolveDatabaseUrl(): Promise<string> {
  const envFile = process.env.AURION_SCHEMA_APPLY_ENV_FILE?.trim();
  const value = envFile
    ? await databaseUrlFromEnvironmentFile(envFile)
    : process.env.DATABASE_URL?.trim() || null;
  if (!value) throw new SchemaApplyError("DATABASE_URL_MISSING");
  try {
    const url = new URL(value);
    if (!/^mysql:$/i.test(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") {
      throw new Error("invalid database URL");
    }
  } catch {
    throw new SchemaApplyError("DATABASE_URL_INVALID");
  }
  return value;
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(",");
}

async function expectedMigrations(): Promise<ExpectedMigration[]> {
  return Promise.all(lateAurionMigrationTags.map(async tag => {
    const sql = await readFile(path.join(projectRoot, "drizzle", `${tag}.sql`), "utf8");
    return parseLateMigrationSql(tag, sql);
  }));
}

async function observeMigrations(connection: Connection, expected: readonly ExpectedMigration[]): Promise<MigrationClassification[]> {
  const expectedTableNames = Array.from(new Set(expected.flatMap(migration => migration.tables.map(table => table.name)))).sort();
  const [columnRows] = await connection.query<ColumnRow[]>(
    `SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.columns WHERE table_schema=DATABASE() AND TABLE_NAME IN (${placeholders(expectedTableNames.length)}) ORDER BY TABLE_NAME,ORDINAL_POSITION`,
    expectedTableNames,
  );
  const [indexRows] = await connection.query<IndexRow[]>(
    `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.statistics WHERE table_schema=DATABASE() AND TABLE_NAME IN (${placeholders(expectedTableNames.length)}) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
    expectedTableNames,
  );

  const tableNamesPresent = new Set(columnRows.map(row => row.TABLE_NAME));
  const observedTables = new Map<string, ObservedTable>();
  for (const tableName of tableNamesPresent) {
    const columns = columnRows
      .filter(row => row.TABLE_NAME === tableName)
      .map(row => ({ name: row.COLUMN_NAME, columnType: row.COLUMN_TYPE, nullable: row.IS_NULLABLE === "YES" }));
    const indexGroups = new Map<string, { unique: boolean; columns: Array<{ sequence: number; name: string }> }>();
    for (const row of indexRows.filter(index => index.TABLE_NAME === tableName)) {
      const existing = indexGroups.get(row.INDEX_NAME) ?? { unique: row.NON_UNIQUE === 0, columns: [] };
      existing.columns.push({ sequence: Number(row.SEQ_IN_INDEX), name: row.COLUMN_NAME });
      indexGroups.set(row.INDEX_NAME, existing);
    }
    const indexes: ObservedIndex[] = Array.from(indexGroups, ([name, index]) => ({
      name,
      unique: index.unique,
      columns: index.columns.sort((left, right) => left.sequence - right.sequence).map(column => column.name),
    }));
    observedTables.set(tableName, { name: tableName, columns, indexes });
  }
  return expected.map(migration => classifyMigrationContract(migration, observedTables));
}

function summarize(migrations: readonly MigrationClassification[]): Record<string, number> {
  return {
    migrationCount: migrations.length,
    matchCount: migrations.filter(migration => migration.state === "PRESENT_SCHEMA_MATCH").length,
    absentCount: migrations.filter(migration => migration.state === "ABSENT_APPLY_REQUIRED").length,
    driftCount: migrations.filter(migration => migration.state === "PRESENT_SCHEMA_DRIFT").length,
  };
}

function matchedPrefixLength(migrations: readonly MigrationClassification[]): number {
  let prefix = 0;
  for (const migration of migrations) {
    if (migration.state === "PRESENT_SCHEMA_MATCH" && prefix === migrations.indexOf(migration)) {
      prefix += 1;
      continue;
    }
    if (migration.state === "ABSENT_APPLY_REQUIRED" && migrations.slice(prefix).every(item => item.state === "ABSENT_APPLY_REQUIRED")) {
      break;
    }
    throw new SchemaApplyError("SCHEMA_NOT_APPLYABLE");
  }
  const expectedStates = [
    ...new Array(prefix).fill("PRESENT_SCHEMA_MATCH"),
    ...new Array(migrations.length - prefix).fill("ABSENT_APPLY_REQUIRED"),
  ];
  if (migrations.some((migration, index) => migration.state !== expectedStates[index])) {
    throw new SchemaApplyError("SCHEMA_NOT_APPLYABLE");
  }
  return prefix;
}

async function migrationJournal(): Promise<MigrationJournalEntry[]> {
  const meta = JSON.parse(await readFile(path.join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8")) as {
    entries?: Array<{ tag?: unknown; when?: unknown }>;
  };
  const entries = meta.entries?.filter(entry => typeof entry.tag === "string" && lateAurionMigrationTags.includes(entry.tag as typeof lateAurionMigrationTags[number]));
  if (!entries || entries.length !== lateAurionMigrationTags.length) throw new SchemaApplyError("JOURNAL_CONFLICT");
  const byTag = new Map(entries.map(entry => [String(entry.tag), entry]));
  if (byTag.size !== lateAurionMigrationTags.length) throw new SchemaApplyError("JOURNAL_CONFLICT");

  const journal: MigrationJournalEntry[] = [];
  for (const tag of lateAurionMigrationTags) {
    const entry = byTag.get(tag);
    const when = Number(entry?.when);
    if (!Number.isSafeInteger(when) || when <= 0) throw new SchemaApplyError("JOURNAL_CONFLICT");
    const source = await readFile(path.join(projectRoot, "drizzle", `${tag}.sql`));
    journal.push({ tag, when, hash: createHash("sha256").update(source).digest("hex") });
  }
  if (journal.some((entry, index) => index > 0 && entry.when <= journal[index - 1].when)) {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
  return journal;
}

async function readJournalState(connection: Connection, firstLateMigrationWhen: number): Promise<JournalState> {
  const [tableRows] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND LOWER(TABLE_NAME)=LOWER('__drizzle_migrations') ORDER BY TABLE_NAME",
  );
  if (tableRows.length === 0) return { exists: false, rowsAtOrAfterFirstLateMigration: [] };
  if (tableRows.length !== 1 || String(tableRows[0].TABLE_NAME) !== "__drizzle_migrations") {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
  const [columnRows] = await connection.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND TABLE_NAME='__drizzle_migrations' ORDER BY ORDINAL_POSITION",
  );
  const columns = new Set(columnRows.map(row => String(row.COLUMN_NAME).toLowerCase()));
  if (!columns.has("hash") || !columns.has("created_at")) throw new SchemaApplyError("JOURNAL_CONFLICT");
  const [rows] = await connection.query<DrizzleJournalRow[]>(
    "SELECT hash,created_at FROM `__drizzle_migrations` WHERE created_at >= ? ORDER BY created_at ASC,hash ASC",
    [firstLateMigrationWhen],
  );
  const normalized = rows.map(row => ({ hash: String(row.hash), when: Number(row.created_at) }));
  if (normalized.some(row => !/^[a-f0-9]{64}$/.test(row.hash) || !Number.isSafeInteger(row.when))) {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
  return { exists: true, rowsAtOrAfterFirstLateMigration: normalized };
}

function validateJournalProgress(state: JournalState, journal: readonly MigrationJournalEntry[], matchedPrefix: number): void {
  if (!state.exists && matchedPrefix > 0) throw new SchemaApplyError("JOURNAL_CONFLICT");
  const expected = journal.slice(0, matchedPrefix).map(entry => ({ hash: entry.hash, when: entry.when }));
  const actual = state.rowsAtOrAfterFirstLateMigration;
  if (actual.length !== expected.length || actual.some((entry, index) => entry.hash !== expected[index].hash || entry.when !== expected[index].when)) {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
}

async function acquireLock(connection: Connection): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 30) AS lockGranted", [lockName]);
  if (Number(rows[0]?.lockGranted) !== 1) throw new SchemaApplyError("DATABASE_LOCK_UNAVAILABLE");
}

async function releaseLock(connection: Connection): Promise<void> {
  await connection.query("DO RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
}

function failureReceipt(error: unknown) {
  const errorClass = error instanceof SchemaApplyError ? error.code : "APPLY_EXECUTION_FAILED";
  return {
    recordType: "aurion_production_schema_apply_execution",
    schemaVersion: 1,
    sourceRevision,
    planSha256,
    mode: "apply",
    databaseCredentialReturned: false,
    state: "APPLY_FAILED",
    failureStage,
    errorClass,
    retryable: false,
    preflight: preflightSummary,
  };
}

async function main() {
  sourceRevision = resolveIdentity("AURION_SCHEMA_APPLY_SOURCE_SHA", /^[a-f0-9]{40}$/, "SOURCE_REVISION_INVALID");
  planSha256 = resolveIdentity("AURION_SCHEMA_APPLY_PLAN_SHA256", /^[a-f0-9]{64}$/, "PLAN_HASH_INVALID");
  failureStage = "READ_ENVIRONMENT";
  const databaseUrl = await resolveDatabaseUrl();
  failureStage = "READ_EXPECTED_MIGRATIONS";
  const expected = await expectedMigrations();
  const journal = await migrationJournal();

  let connection: Connection | null = null;
  try {
    failureStage = "CONNECT_DATABASE";
    connection = await mysql.createConnection(databaseUrl);
    failureStage = "ACQUIRE_LOCK";
    await acquireLock(connection);
    failureStage = "PREFLIGHT_SCHEMA";
    const before = await observeMigrations(connection, expected);
    preflightSummary = summarize(before);
    const matchedPrefix = matchedPrefixLength(before);
    failureStage = "PREFLIGHT_JOURNAL";
    const journalBefore = await readJournalState(connection, journal[0].when);
    validateJournalProgress(journalBefore, journal, matchedPrefix);

    if (matchedPrefix === lateAurionMigrationTags.length) {
      console.log(JSON.stringify({
        recordType: "aurion_production_schema_apply_execution",
        schemaVersion: 1,
        sourceRevision,
        planSha256,
        mode: "apply",
        databaseCredentialReturned: false,
        state: "ALREADY_APPLIED",
        preflight: preflightSummary,
        appliedMigrationTags: [],
      }, null, 2));
      return;
    }

    failureStage = "MIGRATE";
    await migrate(drizzle(connection), { migrationsFolder: path.join(projectRoot, "drizzle") });
    failureStage = "POSTFLIGHT_SCHEMA";
    const after = await observeMigrations(connection, expected);
    const afterSummary = summarize(after);
    if (afterSummary.matchCount !== lateAurionMigrationTags.length || afterSummary.absentCount !== 0 || afterSummary.driftCount !== 0) {
      throw new SchemaApplyError("SCHEMA_NOT_APPLYABLE");
    }
    failureStage = "POSTFLIGHT_JOURNAL";
    const journalAfter = await readJournalState(connection, journal[0].when);
    validateJournalProgress(journalAfter, journal, lateAurionMigrationTags.length);
    console.log(JSON.stringify({
      recordType: "aurion_production_schema_apply_execution",
      schemaVersion: 1,
      sourceRevision,
      planSha256,
      mode: "apply",
      databaseCredentialReturned: false,
      state: "APPLY_SUCCEEDED",
      preflight: preflightSummary,
      postflight: afterSummary,
      appliedMigrationTags: lateAurionMigrationTags.slice(matchedPrefix),
    }, null, 2));
  } finally {
    if (connection) {
      await releaseLock(connection);
      await connection.end();
    }
  }
}

main().catch(error => {
  console.log(JSON.stringify(failureReceipt(error), null, 2));
  process.exitCode = 2;
});
