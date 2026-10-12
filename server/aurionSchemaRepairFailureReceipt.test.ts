import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { schemaRepairFailureReceipt } from "../deploy/aurion-schema-repair-failure-receipt.mjs";
import { repairHash } from "../scripts/aurionSchemaRepairPlan";

const revision = "a".repeat(40);
const ledger = "b".repeat(64);
const secret = "PRIVATE_DRIVER_SQL_VALUE_SENTINEL";
function blockedPlan(blockers = ["JOURNAL_IDENTITY_CONFLICT"]) {
  const body = {
    schemaVersion: "aurion.schema-repair-plan.v1", sourceRevision: revision, ledgerPlanSha256: ledger,
    decision: "BLOCKED_OPERATOR_REVIEW", blockers,
    affected: [{ tag: "0067_aurion_npc_decision_log", state: "ABSENT_APPLY_REQUIRED", privateField: secret }],
    operations: [{ sql: secret }], journalInsertions: [{ hash: secret }],
  };
  return { ...body, repairPlanSha256: repairHash(body) };
}

describe("schema repair failure diagnostic boundary", () => {
  it("projects a hash-bound blocked plan without private SQL, journal values or extra fields", () => {
    const value = schemaRepairFailureReceipt(blockedPlan(), revision, ledger);
    expect(value).toMatchObject({ kind: "BLOCKED_PLAN", blockerCount: 1, truncated: false,
      blockers: [{ code: "JOURNAL_IDENTITY_CONFLICT" }],
      affected: [{ tag: "0067_aurion_npc_decision_log", state: "ABSENT_APPLY_REQUIRED" }], databaseCredentialReturned: false });
    expect(JSON.stringify(value)).not.toContain(secret);
    expect(value).not.toHaveProperty("operations");
    expect(value).not.toHaveProperty("journalInsertions");
  });

  it("retains schema identifiers but removes observed SQL types and arbitrary blocker text", () => {
    const value = schemaRepairFailureReceipt(blockedPlan([
      "OPERATOR_REVIEW_REQUIRED:aurionNpcDecisionLog:type:reason:expected=text:observed=" + secret,
      "REQUIRED_COLUMN_WITHOUT_DEFAULT:aurionNpcDecisionLog.reason",
      "HISTORICAL_JOURNAL_GAP:0001_shocking_doctor_octopus",
      "UNEXPECTED_MIGRATION_STATE:0067_aurion_npc_decision_log:ABSENT_APPLY_REQUIRED",
      secret,
    ]), revision, ledger);
    expect(value.blockers).toEqual([
      { code: "OPERATOR_REVIEW_REQUIRED", table: "aurionNpcDecisionLog", kind: "type", field: "reason" },
      { code: "REQUIRED_COLUMN_WITHOUT_DEFAULT", table: "aurionNpcDecisionLog", field: "reason" },
      { code: "HISTORICAL_JOURNAL_GAP", migration: "0001_shocking_doctor_octopus" },
      { code: "UNEXPECTED_MIGRATION_STATE", migration: "0067_aurion_npc_decision_log", state: "ABSENT_APPLY_REQUIRED" },
      { code: "UNCLASSIFIED_BLOCKER" },
    ]);
    expect(JSON.stringify(value)).not.toContain(secret);
  });

  it("rejects mismatched identity, tampered hashes and an unblocked plan", () => {
    expect(schemaRepairFailureReceipt(blockedPlan(), "c".repeat(40), ledger)).toBeNull();
    expect(schemaRepairFailureReceipt(blockedPlan(), revision, "d".repeat(64))).toBeNull();
    expect(schemaRepairFailureReceipt({ ...blockedPlan(), blockers: [secret] }, revision, ledger)).toBeNull();
    expect(schemaRepairFailureReceipt({ ...blockedPlan(), decision: "ADDITIVE_REPAIR_READY" }, revision, ledger)).toBeNull();
  });

  it("bounds diagnostics while retaining the total blocker count", () => {
    const value = schemaRepairFailureReceipt(blockedPlan(Array(201).fill("JOURNAL_IDENTITY_CONFLICT")), revision, ledger);
    expect(value).toMatchObject({ blockerCount: 201, truncated: true });
    expect(value.blockers).toHaveLength(200);
  });

  it("retains only allowlisted planner execution errors", () => {
    const failure = { recordType: "aurion_production_schema_apply_execution", schemaVersion: 1,
      sourceRevision: revision, planSha256: ledger, executionMode: "plan", state: "APPLY_FAILED",
      failureStage: "PREFLIGHT_SCHEMA", errorClass: "UNSUPPORTED_SCHEMA_STRUCTURE", driverMessage: secret, databaseCredentialReturned: false };
    const value = schemaRepairFailureReceipt(failure, revision, ledger);
    expect(value).toMatchObject({ kind: "EXECUTION_ERROR", errorClass: "UNSUPPORTED_SCHEMA_STRUCTURE" });
    expect(JSON.stringify(value)).not.toContain(secret);
    expect(schemaRepairFailureReceipt({ ...failure, errorClass: secret }, revision, ledger)).toBeNull();
    expect(schemaRepairFailureReceipt({ ...failure, executionMode: "apply" }, revision, ledger)).toBeNull();
  });

  it("executes the root failure serializer without hiding failure or disclosing private input", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const core = readFileSync(path.join(root, "deploy/aurion-production-schema-apply-core"), "utf8");
    const script = core.match(/  node --input-type=module -e '\n([\s\S]+?)\n  ' "\$tmp"/)?.[1];
    expect(script).toBeTruthy();
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-repair-failure-"));
    try {
      const planFile = path.join(directory, "plan.json");
      const receiptFile = path.join(directory, "receipt.json");
      writeFileSync(planFile, JSON.stringify(blockedPlan()), { mode: 0o600 });
      const run = spawnSync(process.execPath, ["--input-type=module", "-e", script!, receiptFile], {
        encoding: "utf8", env: { ...process.env, APPLY_SOURCE_REVISION: revision, APPLY_PLAN_SHA256: ledger,
          APPLY_FAILURE_STAGE: "REPAIR_PLAN_BLOCKED", APPLY_FAILURE_STATUS: "70", APPLY_BACKUP_CREATED: "false",
          APPLY_RECOVERY_EXECUTED: "false", APPLY_FAILURE_RECEIPT: "", APPLY_REPAIR_PLAN_PATH: planFile, APPLY_RELEASE_ROOT: root },
      });
      expect(run.status, run.stderr).toBe(0);
      const text = readFileSync(receiptFile, "utf8");
      expect(JSON.parse(text)).toMatchObject({ overallState: "APPLY_FAILED", failureStage: "REPAIR_PLAN_BLOCKED",
        runnerStatus: 70, backup: { created: false }, repair: { kind: "BLOCKED_PLAN", blockers: [{ code: "JOURNAL_IDENTITY_CONFLICT" }] } });
      expect(text).not.toContain(secret);
      expect(statSync(receiptFile).mode & 0o777).toBe(0o600);
      writeFileSync(planFile, secret);
      const malformed = spawnSync(process.execPath, ["--input-type=module", "-e", script!, receiptFile], { encoding: "utf8", env: {
        ...process.env, APPLY_SOURCE_REVISION: revision, APPLY_PLAN_SHA256: ledger, APPLY_FAILURE_STAGE: "REPAIR_PLAN_BLOCKED",
        APPLY_FAILURE_STATUS: "70", APPLY_BACKUP_CREATED: "false", APPLY_RECOVERY_EXECUTED: "false", APPLY_FAILURE_RECEIPT: "",
        APPLY_REPAIR_PLAN_PATH: planFile, APPLY_RELEASE_ROOT: root } });
      expect(malformed.status, malformed.stderr).toBe(0);
      expect(JSON.parse(readFileSync(receiptFile, "utf8"))).toMatchObject({ overallState: "APPLY_FAILED", repair: null });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
