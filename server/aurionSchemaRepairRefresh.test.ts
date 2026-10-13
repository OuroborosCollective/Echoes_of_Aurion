import { describe, expect, it } from "vitest";
import { assertRepairPlanRefresh, REPAIR_MAX_AGE_MS, REPAIR_POLICY, repairHash, type SchemaRepairPlan } from "../scripts/aurionSchemaRepairPlan";
import { schemaRepairRefreshReadback } from "../deploy/aurion-schema-repair-failure-receipt.mjs";
import { readFileSync } from "node:fs";

const now = Date.parse("2026-10-12T23:23:00.000Z");
const source = "a".repeat(40), ledger = "b".repeat(64);
function plan(at: number, changes: Record<string, unknown> = {}): SchemaRepairPlan {
  const body = { schemaVersion: "aurion.schema-repair-plan.v2", sourceRevision: source, ledgerPlanSha256: ledger,
    observedAt: new Date(at).toISOString(), expiresAt: new Date(at + REPAIR_MAX_AGE_MS).toISOString(),
    observationSha256: "c".repeat(64), canonicalSchemaSha256: "d".repeat(64), policy: REPAIR_POLICY,
    decision: "REVIEWED_REPAIR_READY", blockers: [], affected: [], initialDrift: [],
    operations: [{ tag: "0068_aurion_item_manipulation_runtime", statementIndex: 3, sql: "PRIVATE_SQL_SENTINEL", sqlSha256: "e".repeat(64), kind: "ADD_INDEX" }],
    journalInsertions: [], reviewedRecovery: { registryId: "aurion.schema-reviewed-recovery.v1", preservedJournalRows: [], protectedProductionApprovalRequired: true }, ...changes };
  return { ...body, repairPlanSha256: repairHash(body) } as SchemaRepairPlan;
}

describe("post-recovery repair plan freshness", () => {
  it("renews an expired observation only after an identical fresh readback, retaining the 15-minute bound", () => {
    const old = plan(now - 25 * 60 * 1000), fresh = plan(now);
    const originalBytes = JSON.stringify(old);
    expect(() => assertRepairPlanRefresh(old, fresh, now)).not.toThrow();
    expect(JSON.stringify(old)).toBe(originalBytes);
    expect(REPAIR_MAX_AGE_MS).toBe(15 * 60 * 1000);
    const receipt = schemaRepairRefreshReadback(old, fresh, source, ledger);
    expect(receipt).toMatchObject({ semanticsUnchanged: true, originalRepairPlanSha256: old.repairPlanSha256, repairPlanSha256: fresh.repairPlanSha256 });
    expect(JSON.stringify(receipt)).not.toContain("PRIVATE_SQL_SENTINEL");
  });

  it.each([
    { observationSha256: "f".repeat(64) }, { canonicalSchemaSha256: "f".repeat(64) },
    { operations: [] }, { journalInsertions: [{ tag: "other", hash: "f".repeat(64), when: 1 }] },
    { policy: { absent: [], drift: [] } }, { reviewedRecovery: { protectedProductionApprovalRequired: false } },
    { sourceRevision: "f".repeat(40) }, { ledgerPlanSha256: "f".repeat(64) }, { newUnknownField: true },
    { decision: "BLOCKED_OPERATOR_REVIEW" },
  ])("rejects changed prestate, operations, source, policy and unknown semantic fields: %j", changes => {
    const old = plan(now - 25 * 60 * 1000), changed = plan(now, changes);
    expect(() => assertRepairPlanRefresh(old, changed, now)).toThrow("REPAIR_PLAN_OR_PRESTATE_CHANGED");
    expect(schemaRepairRefreshReadback(old, changed, source, ledger)).toBeNull();
  });

  it("rejects tampering, stale/future refreshes and altered validity windows", () => {
    const old = plan(now - 25 * 60 * 1000);
    expect(() => assertRepairPlanRefresh({ ...old, repairPlanSha256: "0".repeat(64) }, plan(now), now)).toThrow("REPAIR_PLAN_OR_PRESTATE_CHANGED");
    expect(() => assertRepairPlanRefresh(old, plan(now - REPAIR_MAX_AGE_MS - 1), now)).toThrow("REPAIR_READBACK_STALE");
    expect(() => assertRepairPlanRefresh(old, plan(now + 1), now)).toThrow("REPAIR_READBACK_STALE");
    const extended = plan(now, { expiresAt: new Date(now + REPAIR_MAX_AGE_MS + 1).toISOString() });
    expect(() => assertRepairPlanRefresh(old, extended, now)).toThrow("REPAIR_READBACK_STALE");
  });

  it("never rehearses a renewed plan against the earlier production snapshot", () => {
    const core = readFileSync(new URL("../deploy/aurion-production-schema-apply-core", import.meta.url), "utf8");
    const refresh = core.indexOf('run_repair refresh "$repair_plan_fresh"');
    const snapshot = core.indexOf("phase=CAPTURE_REFRESHED_PRODUCTION_SNAPSHOT");
    const backup = core.indexOf('refreshed_basename="${expected_sha}-${plan_sha256:0:16}-${refreshed_stamp}-refreshed.sql.gz"');
    const restore = core.indexOf("phase=RESTORE_REFRESHED_PRODUCTION_SNAPSHOT");
    const proof = core.indexOf("phase=VERIFY_REFRESHED_RECOVERY");
    const revalidate = core.indexOf("phase=REVALIDATE_REFRESHED_REPAIR_PLAN");
    const rehearsal = core.indexOf('run_repair rehearse "$repair_rehearsal"');
    const apply = core.indexOf('run_repair apply "$apply_raw"');
    expect(refresh).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(refresh);
    expect(backup).toBeGreaterThan(snapshot);
    expect(restore).toBeGreaterThan(backup);
    expect(proof).toBeGreaterThan(restore);
    expect(revalidate).toBeGreaterThan(proof);
    expect(rehearsal).toBeGreaterThan(revalidate);
    expect(apply).toBeGreaterThan(rehearsal);
    const refreshPath = core.slice(snapshot, rehearsal);
    expect(refreshPath).toContain('production_client dump --single-transaction --quick');
    expect(refreshPath).toContain('gzip -t "$refreshed_tmp"');
    expect(refreshPath).toContain('backup_sha256="$refreshed_sha256"');
    expect(refreshPath).toContain('backup_file="$refreshed_file"');
    expect(refreshPath).toContain('cleanup_recovery');
    expect(refreshPath).toContain('--mount "type=bind,src=${backup_file},dst=/recovery-input/production.sql.gz,readonly"');
    expect(refreshPath).toContain('gzip -cd /recovery-input/production.sql.gz');
    expect(refreshPath).toContain('recovery_restore_status=$?');
    expect(refreshPath).toContain('[[ "$recovery_restore_status" -eq 0 ]]');
    expect(refreshPath).toContain('phase=REFRESHED_RECOVERY_PROOF_MISMATCH');
    expect(refreshPath).toContain('run_repair refresh "$repair_plan_revalidated"');
    expect(refreshPath).toContain('repair_plan="$repair_plan_revalidated"');
    expect(refreshPath).not.toContain('run_repair apply "$apply_raw"');
  });

  it("places read-only renewal after verified recovery and before rehearsal and production apply", () => {
    const core = readFileSync(new URL("../deploy/aurion-production-schema-apply-core", import.meta.url), "utf8");
    const verified = core.indexOf('phase=RECOVERY_PROOF_MISMATCH');
    const renew = core.indexOf('run_repair refresh "$repair_plan_fresh"');
    expect(renew).toBeGreaterThan(verified);
    expect(core.indexOf('run_repair rehearse "$repair_rehearsal"')).toBeGreaterThan(renew);
    expect(core.indexOf('run_repair apply "$apply_raw"')).toBeGreaterThan(renew);
    const cli = readFileSync(new URL("../scripts/repair-aurion-production-schema.ts", import.meta.url), "utf8");
    expect(cli).toContain('mode === "plan" || mode === "refresh") await connection.query("SET SESSION TRANSACTION READ ONLY")');
  });
});
