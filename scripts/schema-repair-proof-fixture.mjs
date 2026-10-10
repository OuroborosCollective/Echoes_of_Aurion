// Destructive fixture setup is confined to the disposable GitHub-hosted proof
// database. This script is never included in a production apply artifact.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";

const target = new URL(process.env.DATABASE_URL ?? "");
assert.equal(process.env.CI, "true");
assert.equal(target.hostname, "mariadb");
assert.equal(target.pathname, "/aurion_schema_apply_test");
assert.equal(target.username, "root");
const db = await mysql.createConnection(target.href);
const mode = process.argv[2];
try {
  if (mode === "reject-column-contract-drift") {
    const root = path.resolve("dist-production-apply");
    const env = { ...process.env, AURION_SCHEMA_APPLY_ROOT: root,
      AURION_RECONCILIATION_ROOT: root, AURION_SCHEMA_APPLY_SOURCE_SHA: process.env.GITHUB_SHA,
      AURION_RECONCILIATION_SOURCE_SHA: process.env.GITHUB_SHA,
      AURION_SCHEMA_APPLY_PLAN_SHA256: process.env.AURION_APPLY_TEST_PLAN };
    const run = name => spawnSync(process.execPath, [`${root}/bin/${name}.cjs`], { env, encoding: "utf8" });
    const baseline = run("reconcile");
    assert.equal(baseline.status, 0, baseline.stdout);
    assert.equal(JSON.parse(baseline.stdout).summary.driftCount, 0);
    const [journalBefore] = await db.query("SELECT * FROM __drizzle_migrations ORDER BY id");
    const [tablesBefore] = await db.query("SHOW TABLES");
    for (const [definition, reason] of [
      ["timestamp NOT NULL DEFAULT '2001-01-01 00:00:00'", "default:createdAt"],
      ["timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", "extra:createdAt"],
    ]) {
      await db.query(`ALTER TABLE itemInstances MODIFY COLUMN createdAt ${definition}`);
      try {
        const readback = run("reconcile");
        assert.equal(readback.status, 3, readback.stdout);
        assert.ok(JSON.parse(readback.stdout).migrations.some(m => m.drift.includes(`itemInstances:${reason}`)));
        const apply = run("apply");
        assert.notEqual(apply.status, 0);
        assert.equal(JSON.parse(apply.stdout).failureStage, "PREFLIGHT_SCHEMA");
        assert.equal(JSON.parse(apply.stdout).errorClass, "SCHEMA_NOT_APPLYABLE");
        assert.deepEqual((await db.query("SELECT * FROM __drizzle_migrations ORDER BY id"))[0], journalBefore);
        assert.deepEqual((await db.query("SHOW TABLES"))[0], tablesBefore);
      } finally {
        await db.query("ALTER TABLE itemInstances MODIFY COLUMN createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
      }
    }
    assert.equal(run("reconcile").status, 0);
  } else if (mode === "prepare-additive") {
    const history = JSON.parse(fs.readFileSync("dist-production-apply/drizzle/meta/repair-history.json", "utf8"));
    for (const tag of ["0067_aurion_npc_decision_log", "0069_aurion_combat_victory_events", "0071_aurion_npc_guild_authority", "0072_aurion_production_probe_approvals"]) {
      const sql = fs.readFileSync(`drizzle/${tag}.sql`, "utf8");
      for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? `([^`]+)`/g)) {
        const [rows] = await db.query(`SELECT COUNT(*) AS n FROM \`${match[1]}\``);
        assert.equal(Number(rows[0].n), 0, "fixture must not discard seeded rows");
        await db.query(`DROP TABLE \`${match[1]}\``);
      }
      const entry = history.find(entry => entry.tag === tag);
      const [deleted] = await db.query("DELETE FROM __drizzle_migrations WHERE hash=? AND created_at=?", [entry.hash, entry.when]);
      assert.equal(deleted.affectedRows, 1);
    }
    await db.query("ALTER TABLE aurionItemInstancesV2 DROP CONSTRAINT aurionItemInstancesV2_exactly_one_provenance_ck");
    await db.query("ALTER TABLE aurionItemInstancesV2 DROP INDEX aurionItemInstancesV2_crafting_receipt_uq");
    await db.query("ALTER TABLE aurionItemInstancesV2 DROP COLUMN craftingReceiptId");
  } else if (mode === "reject-tampered-plan") {
    const env = { ...process.env, AURION_SCHEMA_APPLY_ROOT: path.resolve("dist-production-apply"),
      AURION_SCHEMA_APPLY_SOURCE_SHA: process.env.GITHUB_SHA,
      AURION_SCHEMA_APPLY_PLAN_SHA256: process.env.AURION_APPLY_TEST_PLAN };
    const run = args => spawnSync(process.execPath, ["dist-production-apply/bin/repair.cjs", ...args], { env, encoding: "utf8" });
    const planned = run(["plan"]);
    assert.equal(planned.status, 0);
    const original = JSON.parse(planned.stdout);
    assert.equal(original.decision, "ADDITIVE_REPAIR_READY");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-plan-proof-"));
    try {
      const file = path.join(dir, "plan.json");
      const tampered = structuredClone(original);
      tampered.operations[0].sql = "DROP TABLE aurionContentHashLedger";
      fs.writeFileSync(file, JSON.stringify(tampered));
      const rejected = run(["apply", file]);
      assert.notEqual(rejected.status, 0);
      assert.equal(JSON.parse(rejected.stdout).errorClass, "REPAIR_PLAN_OR_PRESTATE_CHANGED");
      assert.deepEqual(JSON.parse(rejected.stdout).operations, []);
      const stale = structuredClone(original);
      stale.observedAt = "2000-01-01T00:00:00.000Z";
      fs.writeFileSync(file, JSON.stringify(stale));
      assert.equal(JSON.parse(run(["apply", file]).stdout).errorClass, "REPAIR_READBACK_STALE");
      fs.writeFileSync(file, JSON.stringify(original));
      await db.query("ALTER TABLE aurionItemInstancesV2 ADD COLUMN interveningSchemaProof text NULL");
      try {
        const changed = run(["apply", file]);
        assert.equal(JSON.parse(changed.stdout).errorClass, "REPAIR_PLAN_OR_PRESTATE_CHANGED");
        assert.deepEqual(JSON.parse(changed.stdout).operations, []);
      } finally { await db.query("ALTER TABLE aurionItemInstancesV2 DROP COLUMN interveningSchemaProof"); }
      const [rows] = await db.query("SELECT sourceSizeBytes FROM aurionContentHashLedger WHERE id='append-only-proof'");
      assert.deepEqual(rows.map(row => row.sourceSizeBytes), [1]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } else if (mode === "verify-repaired") {
    const [rows] = await db.query("SELECT sourceSizeBytes FROM aurionContentHashLedger WHERE id='append-only-proof'");
    assert.deepEqual(rows.map(row => row.sourceSizeBytes), [1], "existing data must survive repair and restore rehearsal");
    const [columns] = await db.query("SHOW COLUMNS FROM aurionItemInstancesV2 LIKE 'craftingReceiptId'");
    assert.equal(columns.length, 1);
    const [tables] = await db.query("SHOW TABLES LIKE 'aurionNpcGuildStates'");
    assert.equal(tables.length, 1);
    const [journal] = await db.query("SELECT COUNT(*) AS n FROM __drizzle_migrations");
    assert.equal(Number(journal[0].n), JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length);
  } else if (mode === "prepare-unknown") {
    await db.query("ALTER TABLE aurionItemInstancesV2 ADD COLUMN unknownRepairProof text NULL");
    await db.query("ALTER TABLE aurionItemInstancesV2 DROP INDEX aurionItemInstancesV2_crafting_receipt_uq");
  } else if (mode === "verify-blocked") {
    const [index] = await db.query("SHOW INDEX FROM aurionItemInstancesV2 WHERE Key_name='aurionItemInstancesV2_crafting_receipt_uq'");
    assert.equal(index.length, 0, "unknown drift must block even the otherwise safe index repair");
    const [column] = await db.query("SHOW COLUMNS FROM aurionItemInstancesV2 LIKE 'unknownRepairProof'");
    assert.equal(column.length, 1, "unknown structures must never be overwritten");
  } else throw new Error("UNKNOWN_PROOF_MODE");
  console.log(JSON.stringify({ proof: mode, result: "PASS", productionDatabase: false }));
} finally { await db.end(); }
