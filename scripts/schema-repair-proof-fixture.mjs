// Destructive fixture setup is confined to the disposable GitHub-hosted proof
// database. This script is never included in a production apply artifact.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { createHash } from "node:crypto";

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
  } else if (["prepare-additive", "prepare-reviewed"].includes(mode)) {
    const history = JSON.parse(fs.readFileSync("dist-production-apply/drizzle/meta/repair-history.json", "utf8"));
    for (const tag of ["0067_aurion_npc_decision_log", "0069_aurion_combat_victory_events", "0071_aurion_npc_guild_authority", "0072_aurion_production_probe_approvals", "0073_aurion_production_probe_session_fence"]) {
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
    if (mode === "prepare-reviewed") {
      await db.query("ALTER TABLE aurionItemInstancesV2 ADD CONSTRAINT aurionItemInstancesV2_exactly_one_provenance_ck CHECK ((lootReceiptId IS NOT NULL AND inventoryReceiptId IS NULL) OR (lootReceiptId IS NULL AND inventoryReceiptId IS NOT NULL))");
      await db.query("ALTER TABLE craftingReceipts DROP INDEX craftingReceipts_input_item_idx, ADD UNIQUE INDEX craftingReceipts_inputItemId_unique (inputItemId)");
      const inventory = history.find(e => e.tag === "0066_aurion_inventory_transaction_kernel");
      const manipulation = history.find(e => e.tag === "0068_aurion_item_manipulation_runtime");
      await db.query("DELETE FROM __drizzle_migrations WHERE hash IN (?,?)", [inventory.hash, manipulation.hash]);
      await db.query("INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)", ["42ba1655995dc5ac0fcd47bd7ee4aca7dd025a8edf7602fccaa68d8dae83341f",1790816583000]);
      const [changed] = await db.query("UPDATE __drizzle_migrations SET created_at=? WHERE hash=? AND created_at=?", [1787843338567,"918952d05fe420da9c3d8876d07cfaa73c78a7fbc2d3d16083d50afc4ee0064a",1787841103616]);
      assert.equal(changed.affectedRows,1);
      await db.query("INSERT INTO aurionItemInstancesV2 (id,ownerUserId,lootReceiptId,baseItemDefinitionId,category,quality,itemLevelExact,affixesJson,itemPower,deterministicHash,mergeKey,provenanceHash) VALUES ('reviewed-existing-item',1,'reviewed-loot','proof','weapon','normal','1','[]',1,REPEAT('a',64),'reviewed-merge','reviewed-provenance')");
    }

  } else if (mode === "reject-tampered-plan") {
    const env = { ...process.env, AURION_SCHEMA_APPLY_ROOT: path.resolve("dist-production-apply"),
      AURION_SCHEMA_APPLY_SOURCE_SHA: process.env.GITHUB_SHA,
      AURION_SCHEMA_APPLY_PLAN_SHA256: process.env.AURION_APPLY_TEST_PLAN };
    const run = args => spawnSync(process.execPath, ["dist-production-apply/bin/repair.cjs", ...args], { env, encoding: "utf8" });
    const planned = run(["plan"]);
    assert.equal(planned.status, 0);
    const original = JSON.parse(planned.stdout);
    assert.equal(original.decision, "REVIEWED_REPAIR_READY");
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
      stale.expiresAt = "2000-01-01T00:15:00.000Z";
      const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
      const {repairPlanSha256: staleHash, ...staleBody}=stale;
      stale.repairPlanSha256=createHash("sha256").update(JSON.stringify(canonical(staleBody))).digest("hex");
      fs.writeFileSync(file, JSON.stringify(stale));
      assert.equal(JSON.parse(run(["apply", file]).stdout).errorClass, "REPAIR_READBACK_STALE");
      const [journalBeforeRefresh]=await db.query("SELECT hash,created_at FROM __drizzle_migrations ORDER BY id");
      const [columnsBeforeRefresh]=await db.query("SHOW COLUMNS FROM aurionItemInstancesV2");
      const refreshed=run(["refresh",file]);
      assert.equal(refreshed.status,0,refreshed.stdout);
      const renewed=JSON.parse(refreshed.stdout);
      const semantic=({observedAt,expiresAt,repairPlanSha256,...body})=>body;
      assert.deepEqual(semantic(renewed),semantic(original));
      assert.equal(fs.readFileSync(file,"utf8"),JSON.stringify(stale));
      assert.deepEqual((await db.query("SELECT hash,created_at FROM __drizzle_migrations ORDER BY id"))[0],journalBeforeRefresh);
      assert.deepEqual((await db.query("SHOW COLUMNS FROM aurionItemInstancesV2"))[0],columnsBeforeRefresh);
      fs.writeFileSync(file, JSON.stringify(original));
      await db.query("ALTER TABLE aurionItemInstancesV2 ADD COLUMN interveningSchemaProof text NULL");
      try {
        const changed = run(["apply", file]);
        assert.equal(JSON.parse(changed.stdout).errorClass, "REPAIR_PLAN_OR_PRESTATE_CHANGED");
        assert.deepEqual(JSON.parse(changed.stdout).operations, []);
        const refreshChanged=run(["refresh",file]);
        assert.notEqual(refreshChanged.status,0);
        assert.equal(JSON.parse(refreshChanged.stdout).errorClass,"REPAIR_PLAN_OR_PRESTATE_CHANGED");
      } finally { await db.query("ALTER TABLE aurionItemInstancesV2 DROP COLUMN interveningSchemaProof"); }
      const [rows] = await db.query("SELECT sourceSizeBytes FROM aurionContentHashLedger WHERE id='append-only-proof'");
      assert.deepEqual(rows.map(row => row.sourceSizeBytes), [1]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } else if (["verify-repaired", "verify-reviewed"].includes(mode)) {
    const [rows] = await db.query("SELECT sourceSizeBytes FROM aurionContentHashLedger WHERE id='append-only-proof'");
    assert.deepEqual(rows.map(row => row.sourceSizeBytes), [1], "existing data must survive repair and restore rehearsal");
    const [columns] = await db.query("SHOW COLUMNS FROM aurionItemInstancesV2 LIKE 'craftingReceiptId'");
    assert.equal(columns.length, 1);
    const [tables] = await db.query("SHOW TABLES LIKE 'aurionNpcGuildStates'");
    assert.equal(tables.length, 1);
    const [journal] = await db.query("SELECT COUNT(*) AS n FROM __drizzle_migrations");
    const expectedCount = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length;
    assert.equal(Number(journal[0].n), expectedCount + (mode === "verify-reviewed" ? 2 : 0));
    if (mode === "verify-reviewed") {
      const history = JSON.parse(fs.readFileSync("dist-production-apply/drizzle/meta/repair-history.json","utf8"));
      const [actual] = await db.query("SELECT hash,created_at FROM __drizzle_migrations");
      const pairs = actual.map(r=>`${r.hash}:${r.created_at}`);
      for (const e of history) assert.equal(pairs.filter(p=>p===`${e.hash}:${e.when}`).length,1);
      for (const pair of ["918952d05fe420da9c3d8876d07cfaa73c78a7fbc2d3d16083d50afc4ee0064a:1787843338567","42ba1655995dc5ac0fcd47bd7ee4aca7dd025a8edf7602fccaa68d8dae83341f:1790816583000"]) assert.equal(pairs.filter(p=>p===pair).length,1);
      const [items]=await db.query("SELECT mergeKey,provenanceHash,craftingReceiptId,quantityExact,status FROM aurionItemInstancesV2 WHERE id='reviewed-existing-item'");
      assert.deepEqual(items.map(i=>({...i})),[{mergeKey:'reviewed-merge',provenanceHash:'reviewed-provenance',craftingReceiptId:null,quantityExact:'1',status:'owned'}]);
      const [indexes]=await db.query("SHOW INDEX FROM craftingReceipts WHERE Key_name IN ('craftingReceipts_inputItemId_unique','craftingReceipts_input_item_idx')");
      assert.ok(indexes.length===1&&indexes[0].Key_name==='craftingReceipts_input_item_idx'&&Number(indexes[0].Non_unique)===1);
      await db.query("INSERT INTO aurionItemInstancesV2 (id,ownerUserId,craftingReceiptId,baseItemDefinitionId,category,quality,itemLevelExact,affixesJson,itemPower,deterministicHash,mergeKey,provenanceHash) VALUES ('reviewed-crafted-item',1,'reviewed-crafted','proof','weapon','normal','1','[]',1,REPEAT('b',64),'reviewed-crafted-merge','reviewed-crafted-provenance')");
      await assert.rejects(db.query("UPDATE aurionItemInstancesV2 SET lootReceiptId='invalid-double-provenance' WHERE id='reviewed-crafted-item'"),error=>Number(error.errno)===4025);
    }
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
