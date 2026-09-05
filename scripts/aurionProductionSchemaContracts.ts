import { readFile } from "node:fs/promises";
import path from "node:path";
import { lateAurionMigrationTags, parseLateMigrationSql, type ExpectedMigration, type ExpectedTable } from "./aurionProductionSchemaReconciliation";

/** Read-only contract sources; these old migrations are never reapplied. */
export const legacyContractTags = [
  "0001_shocking_doctor_octopus", "0009_rainy_multiple_man",
  "0019_wasd_aurion_crafting_receipt_inventory",
] as const;

export async function readProductionSchemaContracts(root: string): Promise<ExpectedMigration[]> {
  const sources = await Promise.all(legacyContractTags.map(tag => readFile(path.join(root, "drizzle", `${tag}.sql`), "utf8")));
  // Only the two legacy tables evolved by 0030/0031 are prerequisites. All of
  // their real CREATE, ALTER and index statements are retained in source order.
  const legacySql = sources.flatMap(sql => sql.split("--> statement-breakpoint")).filter(statement =>
    /(?:CREATE\s+TABLE|ALTER\s+TABLE)\s+`(?:itemInstances|craftingReceipts)`/i.test(statement)
      || /CREATE\s+(?:UNIQUE\s+)?INDEX\s+`[^`]+`\s+ON\s+`(?:itemInstances|craftingReceipts)`/i.test(statement),
  ).join("\n");
  const baseline = parseLateMigrationSql(lateAurionMigrationTags[0], legacySql);
  const state = new Map<string, ExpectedTable>(baseline.tables.map(table => [table.name, table]));
  const result: ExpectedMigration[] = [];
  for (const tag of lateAurionMigrationTags) {
    const migration = parseLateMigrationSql(tag, await readFile(path.join(root, "drizzle", `${tag}.sql`), "utf8"), state);
    result.push(migration);
    for (const table of migration.tables) state.set(table.name, table);
  }
  return result;
}
