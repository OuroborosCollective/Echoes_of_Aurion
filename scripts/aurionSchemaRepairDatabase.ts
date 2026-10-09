import { readFile } from "node:fs/promises";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { readProductionTriggers } from "./aurionProductionTriggerReadback";
import { classifyMigrationContracts, type ExpectedMigration, type ObservedTable } from "./aurionProductionSchemaReconciliation";
import type { RepairObservation } from "./aurionSchemaRepairPlan";

export async function repairDatabaseUrl(): Promise<string> {
  const file = process.env.AURION_SCHEMA_APPLY_ENV_FILE;
  if (!file) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
    return process.env.DATABASE_URL;
  }
  const source = await readFile(file, "utf8");
  const raw = source.match(/^\s*(?:export\s+)?DATABASE_URL\s*=(.*)$/m)?.[1]?.trim();
  if (!raw) throw new Error("DATABASE_URL_MISSING");
  const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replace(/\\([\\"])/g, "$1")
    : raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw;
  if (/[\r\n\0]/.test(value)) throw new Error("DATABASE_URL_INVALID");
  return value;
}

export async function readRepairObservation(connection: Connection, contracts: ExpectedMigration[], sourceRevision: string): Promise<RepairObservation> {
  const names = [...new Set(contracts.flatMap(m => m.tables.map(t => t.name)))].sort();
  const placeholders = names.map(() => "?").join(",");
  const query = async (sql: string) => (await connection.query<RowDataPacket[]>(sql, names))[0];
  const columns = await query(`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${placeholders}) ORDER BY TABLE_NAME,ORDINAL_POSITION`);
  const indexes = await query(`SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${placeholders}) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`);
  const checks = await query(`SELECT TABLE_NAME,CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.check_constraints WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN (${placeholders}) ORDER BY TABLE_NAME,CONSTRAINT_NAME`);
  const foreign = await query(`SELECT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.referential_constraints WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN (${placeholders})`);
  // The current canonical late contracts have no foreign keys or prefix
  // indexes. Do not silently certify structures the parser cannot represent.
  if (foreign.length || indexes.some(row => row.SUB_PART !== null)) throw new Error("UNSUPPORTED_SCHEMA_STRUCTURE");
  const triggers = await readProductionTriggers(connection, names);
  const observedTables: ObservedTable[] = [...new Set(columns.map(row => String(row.TABLE_NAME)))].sort().map(name => {
    const tableIndexes = indexes.filter(row => row.TABLE_NAME === name);
    return {
      name,
      columns: columns.filter(row => row.TABLE_NAME === name).map(row => ({ name: String(row.COLUMN_NAME), columnType: String(row.COLUMN_TYPE), nullable: row.IS_NULLABLE === "YES", defaultSql: row.COLUMN_DEFAULT == null ? null : String(row.COLUMN_DEFAULT), extra: String(row.EXTRA) })),
      indexes: [...new Set(tableIndexes.map(row => String(row.INDEX_NAME)))].map(indexName => ({
        name: indexName, unique: Number(tableIndexes.find(row => row.INDEX_NAME === indexName)!.NON_UNIQUE) === 0,
        columns: tableIndexes.filter(row => row.INDEX_NAME === indexName).map(row => String(row.COLUMN_NAME)),
      })),
      checks: checks.filter(row => row.TABLE_NAME === name).map(row => ({ name: String(row.CONSTRAINT_NAME), expression: String(row.CHECK_CLAUSE) })),
      triggers: triggers.get(name) ?? [],
    };
  });
  const [journalTables] = await connection.query<RowDataPacket[]>("SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) LIKE '%drizzle%migration%' ORDER BY TABLE_NAME");
  if (journalTables.length !== 1 || journalTables[0].TABLE_NAME !== "__drizzle_migrations") throw new Error("JOURNAL_UNREADABLE_OR_AMBIGUOUS");
  const [rows] = await connection.query<RowDataPacket[]>("SELECT hash,created_at FROM `__drizzle_migrations` ORDER BY created_at,hash");
  return {
    sourceRevision, readOnly: true, observedAt: new Date().toISOString(), observedTables,
    drizzleJournal: [{ tableName: "__drizzle_migrations", rows: rows.map(row => ({ hash: String(row.hash), createdAt: String(row.created_at) })) }],
    migrations: classifyMigrationContracts(contracts, new Map(observedTables.map(t => [t.name, t]))).map(({ tag, state }) => ({ tag, state })),
  };
}
