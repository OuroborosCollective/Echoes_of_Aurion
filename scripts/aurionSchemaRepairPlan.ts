import { createHash } from "node:crypto";
import {
  compareTableContract, parseLateMigrationSql, lateAurionMigrationTags,
  type ExpectedMigration, type ExpectedTable, type ObservedTable,
} from "./aurionProductionSchemaReconciliation";

export const REPAIR_POLICY = {
  absent: ["0067_aurion_npc_decision_log", "0069_aurion_combat_victory_events", "0071_aurion_npc_guild_authority", "0072_aurion_production_probe_approvals"],
  drift: ["0025_aurion_loot_mastery_ethos", "0030_aurion_guild_bank_economy", "0031_aurion_profession_crafting_persistence", "0033_aurion_ax1_ui_controls", "0066_aurion_inventory_transaction_kernel", "0068_aurion_item_manipulation_runtime"],
} as const;
export const REPAIR_MAX_AGE_MS = 15 * 60 * 1000;
export type JournalIdentity = { tag: string; when: number; hash: string };
export type RepairObservation = {
  sourceRevision: string; observedAt: string; readOnly: true;
  observedTables: ObservedTable[];
  drizzleJournal: Array<{ tableName: string; rows?: Array<{ hash: string; createdAt?: string }>; rowReadback?: string }>;
  migrations: Array<{ tag: string; state: string }>;
};
export type RepairOperation = {
  tag: string; statementIndex: number; sql: string; sqlSha256: string;
  kind: "CREATE_TABLE" | "ADD_COLUMN" | "ADD_INDEX" | "ADD_CHECK";
};
export function canonicalJson(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)])) : item;
  return JSON.stringify(canonical(value));
}
export function repairHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export function sqlHash(sql: string): string { return createHash("sha256").update(sql).digest("hex"); }
export function observationHash(observation: RepairObservation): string {
  // The timestamp is checked separately; re-reading the same structure must
  // produce the same fingerprint. No player rows or secrets enter this plan.
  return repairHash({ tables: observation.observedTables, journal: observation.drizzleJournal });
}
const asObserved = (table: ExpectedTable): ObservedTable => ({
  ...table,
  columns: table.columns.map(column => ({ name: column.name, columnType: column.sqlType, nullable: column.nullable, defaultSql: column.defaultSql, extra: column.extra })),
  indexes: table.indexes.map(index => ({ ...index, name: index.name.replace(/^inline_unique:/, "") })),
});

/** Pure, bounded planner. SQL is selected byte-for-byte from the pinned source.
 * No DROP, MODIFY, UPDATE, trigger replacement or journal overwrite is emitted.
 * Every unresolved discrepancy blocks the ENTIRE plan before its first write. */
export function buildSchemaRepairPlan(input: {
  sourceRevision: string; ledgerPlanSha256: string; nowMs: number;
  observation: RepairObservation; contracts: ExpectedMigration[];
  sources: Record<string, string>; journal: JournalIdentity[];
}) {
  const { observation, contracts, sources, journal, nowMs, sourceRevision, ledgerPlanSha256 } = input;
  if (!/^[a-f0-9]{40}$/.test(sourceRevision) || !/^[a-f0-9]{64}$/.test(ledgerPlanSha256)) throw new Error("REPAIR_IDENTITY_INVALID");
  const observedAtMs = Date.parse(observation.observedAt);
  if (observation.sourceRevision !== sourceRevision || observation.readOnly !== true) throw new Error("REPAIR_READBACK_IDENTITY_MISMATCH");
  if (!Number.isFinite(observedAtMs) || observedAtMs > nowMs || nowMs - observedAtMs > REPAIR_MAX_AGE_MS) throw new Error("REPAIR_READBACK_STALE");
  if (contracts.map(m => m.tag).join() !== lateAurionMigrationTags.join()
    || observation.migrations.map(m => m.tag).join() !== lateAurionMigrationTags.join()) throw new Error("REPAIR_MIGRATION_COVERAGE_INVALID");
  const blockers: string[] = [];
  const affected = observation.migrations.filter(m => m.state !== "PRESENT_SCHEMA_MATCH");
  for (const m of affected) {
    // Prefix-based legacy readback can label a missing non-contiguous table
    // DRIFT. Keep the explicit revision-bound migration boundary; classify the actual structure below.
    if (!["ABSENT_APPLY_REQUIRED", "PRESENT_SCHEMA_DRIFT"].includes(m.state)
      || !([...REPAIR_POLICY.absent, ...REPAIR_POLICY.drift] as readonly string[]).includes(m.tag)) blockers.push(`UNEXPECTED_MIGRATION_STATE:${m.tag}:${m.state}`);
  }
  const finalTables = new Map<string, ExpectedTable>();
  for (const m of contracts) for (const table of m.tables) finalTables.set(table.name, table);
  const actual = new Map(observation.observedTables.map(table => [table.name, table]));
  if (actual.size !== observation.observedTables.length) throw new Error("REPAIR_DUPLICATE_TABLE");
  const initialDrift = [...finalTables.values()].flatMap(table => actual.has(table.name)
    ? compareTableContract(table, actual.get(table.name)!) : [`${table.name}:missing_table`]).sort();
  for (const name of actual.keys()) if (!finalTables.has(name)) blockers.push(`UNKNOWN_TABLE:${name}`);
  const identityByHash = new Map(journal.map(entry => [entry.hash, entry]));
  const identityByTag = new Map(journal.map(entry => [entry.tag, entry]));
  if (identityByHash.size !== journal.length || identityByTag.size !== journal.length
    || journal.some(entry => !/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isSafeInteger(entry.when))) throw new Error("REPAIR_HISTORY_INVALID");
  for (const tag of lateAurionMigrationTags) {
    if (!identityByTag.has(tag) || identityByTag.get(tag)!.hash !== sqlHash(sources[tag] ?? "")) throw new Error("REPAIR_SOURCE_HISTORY_MISMATCH");
  }
  const journalTables = observation.drizzleJournal;
  const rows = journalTables[0]?.rows;
  if (journalTables.length !== 1 || journalTables[0].tableName !== "__drizzle_migrations" || !Array.isArray(rows)) blockers.push("JOURNAL_UNREADABLE_OR_AMBIGUOUS");
  const recorded = new Set<string>();
  for (const row of rows ?? []) {
    const identity = identityByHash.get(row.hash);
    if (!identity || Number(row.createdAt) !== identity.when || recorded.has(row.hash)) blockers.push("JOURNAL_IDENTITY_CONFLICT");
    recorded.add(row.hash);
  }
  for (const entry of journal) if (!(lateAurionMigrationTags as readonly string[]).includes(entry.tag) && !recorded.has(entry.hash)) blockers.push(`HISTORICAL_JOURNAL_GAP:${entry.tag}`);

  const operations: RepairOperation[] = [];
  const simulated = new Map(actual);
  for (const m of contracts) {
    if (![...REPAIR_POLICY.absent, ...REPAIR_POLICY.drift].includes(m.tag as never)) continue;
    const statements = sources[m.tag].split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean);
    for (const [statementIndex, sql] of statements.entries()) {
      const clean = sql.replace(/^\s*--.*$/gm, "").trim();
      const create = clean.match(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`([^`]+)`\s*\(/i);
      const column = clean.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD(?:\s+COLUMN)?\s+`([^`]+)`\s+/i);
      const index = clean.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i)
        ?? clean.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`([^`]+)`/i)?.map((v, i, a) => i === 1 ? a[2] : i === 2 ? a[1] : v);
      const check = clean.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`([^`]+)`\s+CHECK\b/i);
      let kind: RepairOperation["kind"] | undefined;
      let tableName: string | undefined;
      if (create && !simulated.has(create[1])) {
        kind = "CREATE_TABLE"; tableName = create[1];
      } else if (column && simulated.has(column[1]) && !simulated.get(column[1])!.columns.some(c => c.name === column[2])) {
        // A new required column needs a canonical default; implicit coercion
        // of existing rows is not an additive repair contract.
        if (/\bNOT\s+NULL\b/i.test(clean) && !/\bDEFAULT\b/i.test(clean)) { blockers.push(`REQUIRED_COLUMN_WITHOUT_DEFAULT:${column[1]}.${column[2]}`); continue; }
        kind = "ADD_COLUMN"; tableName = column[1];
      } else if (index && simulated.has(index[2]) && !simulated.get(index[2])!.indexes.some(i => i.name === index[1])) {
        kind = "ADD_INDEX"; tableName = index[2];
      } else if (check && simulated.has(check[1]) && !(simulated.get(check[1])!.checks ?? []).some(c => c.name === check[2])) {
        kind = "ADD_CHECK"; tableName = check[1];
      }
      if (!kind || !tableName) continue;
      const before = simulated.get(tableName);
      const canonicalBefore = before && {
        ...before, columns: before.columns.map(c => ({ name: c.name, sqlType: c.columnType, nullable: c.nullable, defaultSql: c.defaultSql, extra: c.extra })),
      };
      let next: ObservedTable;
      if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(clean) && index && before) {
        const declared = m.tables.find(t => t.name === tableName)?.indexes.find(i => i.name === index[1]);
        if (!declared) throw new Error("REPAIR_INDEX_SOURCE_INVALID");
        next = { ...before, indexes: [...before.indexes, declared] };
      } else {
        const parsed = parseLateMigrationSql(m.tag, sql, new Map(canonicalBefore ? [[tableName, canonicalBefore]] : []));
        next = asObserved(parsed.tables.find(table => table.name === tableName)!);
      }
      // Never introduce an obsolete historical field/index/check merely
      // because a once-canonical statement exists in an old migration.
      const beforeDrift = before ? compareTableContract(finalTables.get(tableName)!, before) : [];
      const nextDrift = compareTableContract(finalTables.get(tableName)!, next);
      if (nextDrift.some(reason => /:(unexpected_|type:|nullability:|index_uniqueness:|index_columns:|check_expression:|trigger_contract:)/.test(reason) && !beforeDrift.includes(reason))) continue;
      simulated.set(tableName, next);
      operations.push({ tag: m.tag, statementIndex, sql, sqlSha256: sqlHash(sql), kind });
      if (kind === "CREATE_TABLE" && recorded.has(identityByTag.get(m.tag)!.hash)) blockers.push(`RECORDED_MIGRATION_TABLE_MISSING:${m.tag}:${tableName}`);
    }
  }
  const unresolved = [...finalTables.values()].flatMap(table => simulated.has(table.name)
    ? compareTableContract(table, simulated.get(table.name)!) : [`${table.name}:missing_table`]);
  blockers.push(...unresolved.map(reason => `OPERATOR_REVIEW_REQUIRED:${reason}`));
  const journalInsertions = contracts.filter(m => !recorded.has(identityByTag.get(m.tag)!.hash)).map(m => identityByTag.get(m.tag)!);
  for (const entry of journalInsertions) if (![...REPAIR_POLICY.absent, ...REPAIR_POLICY.drift].includes(entry.tag as never)) blockers.push(`UNEXPECTED_JOURNAL_GAP:${entry.tag}`);
  const body = {
    schemaVersion: "aurion.schema-repair-plan.v1", sourceRevision, ledgerPlanSha256,
    observedAt: observation.observedAt, expiresAt: new Date(observedAtMs + REPAIR_MAX_AGE_MS).toISOString(),
    observationSha256: observationHash(observation), canonicalSchemaSha256: repairHash([...finalTables.values()]),
    policy: REPAIR_POLICY, affected, initialDrift,
    decision: blockers.length ? "BLOCKED_OPERATOR_REVIEW" : operations.length || journalInsertions.length ? "ADDITIVE_REPAIR_READY" : "ALREADY_MATCHED",
    blockers: [...new Set(blockers)].sort(), operations, journalInsertions,
  };
  return { ...body, repairPlanSha256: repairHash(body) };
}
export type SchemaRepairPlan = ReturnType<typeof buildSchemaRepairPlan>;
