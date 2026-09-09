import type { Connection, RowDataPacket } from "mysql2/promise";
import type { SchemaTrigger } from "./aurionProductionSchemaReconciliation";
import { ReconciliationBoundaryError } from "./aurionProductionReadbackErrors";

/** Fixed metadata-only query shared by preflight, apply postflight and readback. */
export async function readProductionTriggers(connection: Connection, tableNames: readonly string[]): Promise<Map<string, SchemaTrigger[]>> {
  if (!tableNames.length) throw new Error("TRIGGER_READBACK_TABLES_REQUIRED");
  const [rows] = await connection.query<(RowDataPacket & {
    EVENT_OBJECT_TABLE: string; TRIGGER_NAME: string; ACTION_TIMING: string;
    EVENT_MANIPULATION: string; ACTION_STATEMENT: string | null;
  })[]>(
    `SELECT EVENT_OBJECT_TABLE,TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT FROM information_schema.triggers WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN (${tableNames.map(() => "?").join(",")}) ORDER BY EVENT_OBJECT_TABLE,TRIGGER_NAME`,
    [...tableNames],
  );
  const byTable = new Map<string, SchemaTrigger[]>();
  for (const row of rows) {
    // MariaDB redacts the action for identities without TRIGGER visibility.
    // A redacted definition cannot establish that append-only protection exists.
    if (typeof row.ACTION_STATEMENT !== "string" || !row.ACTION_STATEMENT.trim()) {
      throw new ReconciliationBoundaryError("DATABASE_METADATA_ACCESS_DENIED");
    }
    const triggers = byTable.get(row.EVENT_OBJECT_TABLE) ?? [];
    triggers.push({ name: row.TRIGGER_NAME, timing: row.ACTION_TIMING, event: row.EVENT_MANIPULATION, statement: row.ACTION_STATEMENT });
    byTable.set(row.EVENT_OBJECT_TABLE, triggers);
  }
  return byTable;
}
