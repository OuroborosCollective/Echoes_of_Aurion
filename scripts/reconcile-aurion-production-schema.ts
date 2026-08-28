import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import {
  classifyMigrationContract,
  lateAurionMigrationTags,
  parseLateMigrationSql,
  type ExpectedMigration,
  type ObservedIndex,
  type ObservedTable,
} from "./aurionProductionSchemaReconciliation";

const projectRoot = path.resolve(process.env.AURION_RECONCILIATION_ROOT?.trim() || process.cwd());
const requireMatch = process.argv.includes("--require-match");
const sourceRevision = (() => {
  const value = process.env.AURION_RECONCILIATION_SOURCE_SHA?.trim();
  if (!value) return null;
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error("AURION_RECONCILIATION_SOURCE_SHA must be a 40-character lowercase Git SHA");
  return value;
})();

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

async function resolveDatabaseUrl(): Promise<string | null> {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;
  const envFile = process.env.AURION_RECONCILIATION_ENV_FILE?.trim();
  if (!envFile) return null;
  const source = await readFile(envFile, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=([\s\S]*)$/);
    if (!match) continue;
    const value = parseEnvironmentValue(match[1]);
    if (!value || /[\r\n\0]/.test(value)) throw new Error("DATABASE_URL in reconciliation environment is invalid");
    return value;
  }
  return null;
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(",");
}

function safeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_$]+$/.test(value)) throw new Error("Unsafe database identifier observed");
  return `\`${value}\``;
}

async function expectedMigrations(): Promise<ExpectedMigration[]> {
  return Promise.all(lateAurionMigrationTags.map(async tag => {
    const sql = await readFile(path.join(projectRoot, "drizzle", `${tag}.sql`), "utf8");
    return parseLateMigrationSql(tag, sql);
  }));
}

function unreadableReceipt(error: unknown) {
  const errorName = error instanceof Error && /^[A-Za-z0-9_.$ -]{1,120}$/.test(error.name) ? error.name : "UnknownError";
  return {
    recordType: "aurion_production_schema_reconciliation",
    schemaVersion: 1,
    sourceRevision,
    readOnly: true,
    requireMatch,
    databaseCredentialReturned: false,
    overallState: "UNREADABLE_FAIL_CLOSED",
    errorName,
    migrations: lateAurionMigrationTags.map(tag => ({ tag, state: "UNREADABLE_FAIL_CLOSED" })),
  };
}

async function readDrizzleJournal(connection: Connection) {
  const [tableRows] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND (TABLE_NAME='__drizzle_migrations' OR LOWER(TABLE_NAME) LIKE '%drizzle%migration%') ORDER BY TABLE_NAME"
  );
  const results: Array<Record<string, unknown>> = [];
  for (const row of tableRows) {
    const tableName = String(row.TABLE_NAME);
    safeIdentifier(tableName);
    const [columnRows] = await connection.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",
      [tableName],
    );
    const columns = columnRows.map(column => String(column.COLUMN_NAME));
    const hashColumn = columns.find(column => column.toLowerCase() === "hash");
    const createdColumn = columns.find(column => ["created_at", "createdat", "created"].includes(column.toLowerCase()));
    if (!hashColumn) {
      results.push({ tableName, columns, rowReadback: "hash_column_absent" });
      continue;
    }
    const order = createdColumn ? ` ORDER BY ${safeIdentifier(createdColumn)}` : "";
    const selectCreated = createdColumn ? `, ${safeIdentifier(createdColumn)} AS createdAt` : "";
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT ${safeIdentifier(hashColumn)} AS hash${selectCreated} FROM ${safeIdentifier(tableName)}${order}`,
    );
    results.push({
      tableName,
      columns,
      rowCount: rows.length,
      rows: rows.map(row => ({ hash: String(row.hash), ...(createdColumn ? { createdAt: String(row.createdAt) } : {}) })),
    });
  }
  return results;
}

async function main() {
  const databaseUrl = await resolveDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for read-only schema reconciliation");
  const expected = await expectedMigrations();
  const expectedTableNames = Array.from(new Set(expected.flatMap(migration => migration.tables.map(table => table.name)))).sort();
  const connection = await mysql.createConnection(databaseUrl);
  try {
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

    const migrations = expected.map(migration => classifyMigrationContract(migration, observedTables));
    const journal = await readDrizzleJournal(connection);
    const driftCount = migrations.filter(migration => migration.state === "PRESENT_SCHEMA_DRIFT").length;
    const absentCount = migrations.filter(migration => migration.state === "ABSENT_APPLY_REQUIRED").length;
    const matchCount = migrations.filter(migration => migration.state === "PRESENT_SCHEMA_MATCH").length;
    const overallState = driftCount > 0
      ? "PRESENT_SCHEMA_DRIFT"
      : requireMatch && absentCount > 0
        ? "ABSENT_APPLY_REQUIRED"
        : absentCount > 0
          ? "RECONCILIATION_REQUIRED"
          : "PRESENT_SCHEMA_MATCH";
    const receipt = {
      recordType: "aurion_production_schema_reconciliation",
      schemaVersion: 1,
      sourceRevision,
      readOnly: true,
      requireMatch,
      databaseCredentialReturned: false,
      overallState,
      summary: { migrationCount: migrations.length, matchCount, absentCount, driftCount },
      migrations,
      drizzleJournal: journal,
    };
    console.log(JSON.stringify(receipt, null, 2));
    if (driftCount > 0) process.exitCode = 3;
    else if (requireMatch && absentCount > 0) process.exitCode = 4;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.log(JSON.stringify(unreadableReceipt(error), null, 2));
  process.exitCode = 2;
});
