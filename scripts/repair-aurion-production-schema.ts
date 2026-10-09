import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { readProductionSchemaContracts } from "./aurionProductionSchemaContracts";
import { compareTableContract } from "./aurionProductionSchemaReconciliation";
import { buildSchemaRepairPlan, canonicalJson, type JournalIdentity, type SchemaRepairPlan } from "./aurionSchemaRepairPlan";
import { readRepairObservation, repairDatabaseUrl } from "./aurionSchemaRepairDatabase";

const root = path.resolve(process.env.AURION_SCHEMA_APPLY_ROOT || process.cwd());
const sourceRevision = process.env.AURION_SCHEMA_APPLY_SOURCE_SHA ?? "";
const ledgerPlanSha256 = process.env.AURION_SCHEMA_APPLY_PLAN_SHA256 ?? "";
const mode = process.argv[2];
const executed: Array<Record<string, unknown>> = [];
let repairPlanSha256: string | null = null;
let stage = "INITIALIZE";
async function main() {
  if (!["plan", "apply", "rehearse"].includes(mode)) throw new Error("REPAIR_MODE_INVALID");
  const contracts = await readProductionSchemaContracts(root);
  const sources = Object.fromEntries(await Promise.all(contracts.map(async m => [m.tag, await readFile(path.join(root, "drizzle", `${m.tag}.sql`), "utf8")])));
  const journal = JSON.parse(await readFile(path.join(root, "drizzle/meta/repair-history.json"), "utf8")) as JournalIdentity[];
  const connection = await mysql.createConnection(await repairDatabaseUrl());
  let locked = false;
  try {
    if (mode === "plan") await connection.query("SET SESSION TRANSACTION READ ONLY");
    else {
      const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT GET_LOCK(?, 30) AS granted", ["aurion_production_schema_apply_0021_0027"]);
      if (Number(rows[0]?.granted) !== 1) throw new Error("DATABASE_LOCK_UNAVAILABLE");
      locked = true;
    }
    stage = "PREFLIGHT_SCHEMA";
    const observation = await readRepairObservation(connection, contracts, sourceRevision);
    const approved = mode === "plan" ? null : JSON.parse(await readFile(process.argv[3], "utf8")) as SchemaRepairPlan;
    if (approved) observation.observedAt = approved.observedAt;
    const plan = buildSchemaRepairPlan({ sourceRevision, ledgerPlanSha256, nowMs: Date.now(), observation, contracts, sources, journal });
    repairPlanSha256 = plan.repairPlanSha256;
    if (mode === "plan") {
      console.log(JSON.stringify(plan, null, 2));
      if (plan.decision === "BLOCKED_OPERATOR_REVIEW") process.exitCode = 3;
      return;
    }
    // Regeneration under the database lock validates every operation, its
    // source hash, exact pre-state, identity and freshness before the first DDL.
    if (canonicalJson(approved) !== canonicalJson(plan)) throw new Error("REPAIR_PLAN_OR_PRESTATE_CHANGED");
    if (plan.decision === "BLOCKED_OPERATOR_REVIEW") throw new Error("REPAIR_OPERATOR_REVIEW_REQUIRED");
    const backupSha256 = process.env.AURION_SCHEMA_REPAIR_BACKUP_SHA256 ?? "";
    const rehearsalSha256 = process.env.AURION_SCHEMA_REPAIR_REHEARSAL_SHA256 ?? "";
    if (!/^[a-f0-9]{64}$/.test(backupSha256) || (mode === "apply" && !/^[a-f0-9]{64}$/.test(rehearsalSha256))) throw new Error("REPAIR_RECOVERY_EVIDENCE_REQUIRED");
    stage = "MIGRATE";
    for (const operation of plan.operations) {
      const receipt: Record<string, unknown> = { tag: operation.tag, statementIndex: operation.statementIndex, sqlSha256: operation.sqlSha256, kind: operation.kind, startedAt: new Date().toISOString(), backupSha256, result: "PENDING" };
      executed.push(receipt);
      try { await connection.query(operation.sql); receipt.result = "APPLIED"; }
      catch { receipt.result = "FAILED"; receipt.errorClass = "CANONICAL_STATEMENT_FAILED"; throw new Error("CANONICAL_STATEMENT_FAILED"); }
      finally { receipt.endedAt = new Date().toISOString(); }
    }
    stage = "POSTFLIGHT_SCHEMA";
    const after = await readRepairObservation(connection, contracts, sourceRevision);
    const final = new Map(contracts.flatMap(m => m.tables.map(t => [t.name, t] as const)));
    const actual = new Map(after.observedTables.map(t => [t.name, t]));
    if ([...final].some(([name, table]) => !actual.has(name) || compareTableContract(table, actual.get(name)!).length)) throw new Error("REPAIR_POSTFLIGHT_MISMATCH");
    stage = "POSTFLIGHT_JOURNAL";
    // Journal entries are appended only after the full structural readback.
    // Existing records, hashes and timestamps are never rewritten or removed.
    for (const entry of plan.journalInsertions) await connection.query("INSERT INTO `__drizzle_migrations` (`hash`,`created_at`) VALUES (?,?)", [entry.hash, entry.when]);
    const finalObservation = await readRepairObservation(connection, contracts, sourceRevision);
    const verified = buildSchemaRepairPlan({ sourceRevision, ledgerPlanSha256, nowMs: Date.now(), observation: finalObservation, contracts, sources, journal });
    if (verified.decision !== "ALREADY_MATCHED") throw new Error("REPAIR_POSTFLIGHT_MISMATCH");
    console.log(JSON.stringify({ recordType: "aurion_production_schema_apply_execution", schemaVersion: 1, sourceRevision, planSha256: ledgerPlanSha256, repairPlanSha256,
      mode: "apply", executionMode: mode, state: "APPLY_SUCCEEDED", backupSha256, rehearsalSha256: mode === "apply" ? rehearsalSha256 : null,
      operations: executed, journalInsertions: plan.journalInsertions.map(x => x.tag),
      appliedMigrationTags: [...new Set(plan.operations.map(x => x.tag))], repairedJournalTags: plan.journalInsertions.map(x => x.tag),
      postflight: { migrationCount: contracts.length, matchCount: contracts.length, absentCount: 0, driftCount: 0 }, databaseCredentialReturned: false }, null, 2));
  } finally {
    if (locked) await connection.query("DO RELEASE_LOCK(?)", ["aurion_production_schema_apply_0021_0027"]).catch(() => undefined);
    await connection.end();
  }
}
main().catch(error => {
  // Driver messages can contain credentials or SQL values. Emit only our
  // bounded error codes; detailed database errors stay outside this receipt.
  const message = error instanceof Error ? error.message : "";
  const errorClass = /^[A-Z][A-Z_]{4,80}$/.test(message) ? message : "REPAIR_EXECUTION_FAILED";
  console.log(JSON.stringify({ recordType: "aurion_production_schema_apply_execution", schemaVersion: 1, sourceRevision, planSha256: ledgerPlanSha256, repairPlanSha256,
    mode: "apply", executionMode: mode, state: "APPLY_FAILED", failureStage: stage, errorClass, retryable: false, preflight: null, operations: executed, databaseCredentialReturned: false }, null, 2));
  process.exitCode = 2;
});
