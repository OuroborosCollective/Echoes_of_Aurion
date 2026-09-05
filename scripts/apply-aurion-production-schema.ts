import { readProductionSchemaContracts } from "./aurionProductionSchemaContracts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import {
  classifyMigrationContracts,
  lateAurionMigrationTags,
  type ExpectedMigration,
  type MigrationClassification,
  type ObservedIndex,
  type ObservedTable,
} from "./aurionProductionSchemaReconciliation";

const projectRoot = path.resolve(process.env.AURION_SCHEMA_APPLY_ROOT?.trim() || process.cwd());
const lockName = "aurion_production_schema_apply_0021_0027";
const migrationSeparator = "--> statement-breakpoint";

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
  statements: readonly string[];
}>;

type JournalState = Readonly<{
  exists: boolean;
  rows: readonly { hash: string; when: number | null }[];
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
  return readProductionSchemaContracts(projectRoot);
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

  const [checkRows] = await connection.query<(RowDataPacket & { TABLE_NAME: string; CONSTRAINT_NAME: string; CHECK_CLAUSE: string })[]>(
      `SELECT TABLE_NAME,CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.check_constraints WHERE constraint_schema=DATABASE() AND TABLE_NAME IN (${placeholders(expectedTableNames.length)}) ORDER BY TABLE_NAME,CONSTRAINT_NAME`,
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
    observedTables.set(tableName, { name: tableName, columns, indexes, checks: checkRows.filter(row => row.TABLE_NAME === tableName).map(row => ({ name: row.CONSTRAINT_NAME, expression: row.CHECK_CLAUSE })) });
  }
  return classifyMigrationContracts(expected, observedTables);
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
    const source = await readFile(path.join(projectRoot, "drizzle", `${tag}.sql`), "utf8");
    const statements = source.split(migrationSeparator).map(statement => statement.trim()).filter(Boolean);
    if (statements.length === 0) throw new SchemaApplyError("JOURNAL_CONFLICT");
    journal.push({ tag, when, hash: createHash("sha256").update(source, "utf8").digest("hex"), statements });
  }
  if (journal.some((entry, index) => index > 0 && entry.when <= journal[index - 1].when)) {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
  if (new Set(journal.map(entry => entry.hash)).size !== journal.length) {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
  return journal;
}

async function readJournalState(connection: Connection): Promise<JournalState> {
  const [tableRows] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND LOWER(TABLE_NAME)=LOWER('__drizzle_migrations') ORDER BY TABLE_NAME",
  );
  if (tableRows.length === 0) return { exists: false, rows: [] };
  if (tableRows.length !== 1 || String(tableRows[0].TABLE_NAME) !== "__drizzle_migrations") {
    throw new SchemaApplyError("JOURNAL_CONFLICT");
  }
  const [columnRows] = await connection.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND TABLE_NAME='__drizzle_migrations' ORDER BY ORDINAL_POSITION",
  );
  const columns = new Set(columnRows.map(row => String(row.COLUMN_NAME).toLowerCase()));
  if (!columns.has("hash") || !columns.has("created_at")) throw new SchemaApplyError("JOURNAL_CONFLICT");
  const [rows] = await connection.query<DrizzleJournalRow[]>(
    "SELECT hash,created_at FROM `__drizzle_migrations` ORDER BY created_at ASC,hash ASC",
  );
  return {
    exists: true,
    rows: rows.map(row => {
      const numericWhen = Number(row.created_at);
      return {
        hash: String(row.hash),
        when: Number.isSafeInteger(numericWhen) ? numericWhen : null,
      };
    }),
  };
}

function validateJournalProgress(state: JournalState, journal: readonly MigrationJournalEntry[], matchedPrefix: number): number {
  if (!state.exists) {
    if (matchedPrefix > 0) throw new SchemaApplyError("JOURNAL_CONFLICT");
    return 0;
  }

  const journalIndexByHash = new Map(journal.map((entry, index) => [entry.hash, index]));
  const observedLateIndexes = new Set<number>();
  for (const row of state.rows) {
    const index = journalIndexByHash.get(row.hash);
    if (index === undefined) continue;
    if (observedLateIndexes.has(index)) throw new SchemaApplyError("JOURNAL_CONFLICT");
    if (row.when !== journal[index].when) throw new SchemaApplyError("JOURNAL_CONFLICT");
    observedLateIndexes.add(index);
  }

  let journalPrefix = 0;
  while (observedLateIndexes.has(journalPrefix)) journalPrefix += 1;
  if (observedLateIndexes.size !== journalPrefix) throw new SchemaApplyError("JOURNAL_CONFLICT");
  if (journalPrefix > matchedPrefix) throw new SchemaApplyError("JOURNAL_CONFLICT");
  return journalPrefix;
}

async function ensureJournalTable(connection: Connection): Promise<void> {
  await connection.query(`CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
    \`id\` serial primary key,
    \`hash\` text not null,
    \`created_at\` bigint
  )`);
}

async function insertJournalEntry(connection: Connection, migration: MigrationJournalEntry): Promise<void> {
  await connection.query(
    "INSERT INTO `__drizzle_migrations` (`hash`,`created_at`) VALUES (?,?)",
    [migration.hash, migration.when],
  );
}

async function repairJournalPrefix(
  connection: Connection,
  journal: readonly MigrationJournalEntry[],
  journalPrefix: number,
  matchedPrefix: number,
): Promise<string[]> {
  const repaired: string[] = [];
  for (let index = journalPrefix; index < matchedPrefix; index += 1) {
    await insertJournalEntry(connection, journal[index]);
    repaired.push(journal[index].tag);
  }
  return repaired;
}

async function applyBoundedMigrations(
  connection: Connection,
  expected: readonly ExpectedMigration[],
  journal: readonly MigrationJournalEntry[],
  matchedPrefix: number,
): Promise<string[]> {
  const applied: string[] = [];
  for (let index = matchedPrefix; index < journal.length; index += 1) {
    const migration = journal[index];
    for (const statement of migration.statements) {
      await connection.query(statement);
    }

    const observed = await observeMigrations(connection, expected);
    const observedPrefix = matchedPrefixLength(observed);
    if (observedPrefix !== index + 1) throw new SchemaApplyError("SCHEMA_NOT_APPLYABLE");

    await insertJournalEntry(connection, migration);
    applied.push(migration.tag);
  }
  return applied;
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
    const journalBefore = await readJournalState(connection);
    const journalPrefix = validateJournalProgress(journalBefore, journal, matchedPrefix);

    if (matchedPrefix === lateAurionMigrationTags.length && journalPrefix === lateAurionMigrationTags.length) {
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
        repairedJournalTags: [],
      }, null, 2));
      return;
    }

    failureStage = "MIGRATE";
    await ensureJournalTable(connection);
    const repairedJournalTags = await repairJournalPrefix(connection, journal, journalPrefix, matchedPrefix);
    const appliedMigrationTags = await applyBoundedMigrations(connection, expected, journal, matchedPrefix);

    failureStage = "POSTFLIGHT_SCHEMA";
    const after = await observeMigrations(connection, expected);
    const afterSummary = summarize(after);
    if (afterSummary.matchCount !== lateAurionMigrationTags.length || afterSummary.absentCount !== 0 || afterSummary.driftCount !== 0) {
      throw new SchemaApplyError("SCHEMA_NOT_APPLYABLE");
    }
    failureStage = "POSTFLIGHT_JOURNAL";
    const journalAfter = await readJournalState(connection);
    const finalJournalPrefix = validateJournalProgress(journalAfter, journal, lateAurionMigrationTags.length);
    if (finalJournalPrefix !== lateAurionMigrationTags.length) throw new SchemaApplyError("JOURNAL_CONFLICT");

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
      appliedMigrationTags,
      repairedJournalTags,
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
