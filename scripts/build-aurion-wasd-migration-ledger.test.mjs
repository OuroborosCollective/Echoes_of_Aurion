import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  LATE_AURION_MIGRATION_TAGS,
  buildAurionWasdMigrationLedger,
  canonicalSha256,
} from "./build-aurion-wasd-migration-ledger.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function initializeRepository(root) {
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "ledger@example.test"]);
  git(root, ["config", "user.name", "Migration Ledger Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
}

async function createFixture() {
  const aurionRoot = await mkdtemp(join(tmpdir(), "aurion-wasd-ledger-target-"));
  const wasdRoot = await mkdtemp(join(tmpdir(), "aurion-wasd-ledger-source-"));
  await mkdir(join(aurionRoot, "drizzle", "meta"), { recursive: true });
  await mkdir(join(wasdRoot, "server", "src", "world"), { recursive: true });
  const sourcePath = join(wasdRoot, "server", "src", "world", "WorldTick.ts");
  const sourceContent = "export const world = true;\n";
  await writeFile(sourcePath, sourceContent);
  await initializeRepository(wasdRoot);
  const sourceRevision = git(wasdRoot, ["rev-parse", "HEAD"]);
  const unsignedSourceLedger = {
    schemaVersion: "wasd.aurion-source-ledger.v1",
    recordType: "wasd_aurion_source_ledger",
    source: { repository: "OuroborosCollective/Wasd", revision: sourceRevision, path: "server/src" },
    files: [{ path: "server/src/world/WorldTick.ts", sha256: sha256(sourceContent), bytes: Buffer.byteLength(sourceContent), domain: "world" }],
    policy: {
      automaticActions: ["discover_source", "hash_source", "emit_receipt"],
      requiresOwnerApproval: ["schema_apply"],
      prohibitedActions: ["database_write"],
      databaseConnectionsOpened: false,
      sourceCodeCopiedIntoAurion: false,
    },
  };
  const sourceLedger = { ...unsignedSourceLedger, manifestSha256: canonicalSha256(unsignedSourceLedger) };
  await mkdir(join(wasdRoot, ".ledger"), { recursive: true });
  const sourceLedgerPath = join(wasdRoot, ".ledger", "source-ledger.json");
  await writeFile(sourceLedgerPath, `${JSON.stringify(sourceLedger, null, 2)}\n`);

  const journalEntries = LATE_AURION_MIGRATION_TAGS.map((tag, index) => ({ idx: index, tag, version: "5", when: index + 1, breakpoints: true }));
  await writeFile(join(aurionRoot, "drizzle", "meta", "_journal.json"), `${JSON.stringify({ version: "7", dialect: "mysql", entries: journalEntries }, null, 2)}\n`);
  for (const tag of LATE_AURION_MIGRATION_TAGS) {
    await writeFile(join(aurionRoot, "drizzle", `${tag}.sql`), `-- ${tag}\nCREATE TABLE \`${tag}\` (\`id\` int NOT NULL);\n`);
  }
  await initializeRepository(aurionRoot);
  return { aurionRoot, wasdRoot, sourceLedgerPath };
}

test("migration ledger verifies both revisions and cannot schedule a production write", async testContext => {
  const fixture = await createFixture();
  testContext.after(() => Promise.all([
    rm(fixture.aurionRoot, { recursive: true, force: true }),
    rm(fixture.wasdRoot, { recursive: true, force: true }),
  ]));
  const result = await buildAurionWasdMigrationLedger({
    root: fixture.aurionRoot,
    wasdRoot: fixture.wasdRoot,
    sourceLedgerPath: fixture.sourceLedgerPath,
    out: ".ledger",
  });
  const ledger = JSON.parse(await readFile(join(fixture.aurionRoot, ".ledger", "migration-ledger.json"), "utf8"));

  assert.equal(ledger.recordType, "aurion_wasd_migration_ledger");
  assert.equal(ledger.repositoryState, "PENDING_PRODUCTION_READBACK");
  assert.equal(ledger.source.revision, git(fixture.wasdRoot, ["rev-parse", "HEAD"]));
  assert.equal(ledger.target.revision, git(fixture.aurionRoot, ["rev-parse", "HEAD"]));
  assert.equal(ledger.target.migrationJournal.migrations.length, 7);
  assert.equal(ledger.target.migrationJournal.migrations.every(migration => migration.journalPresent), true);
  assert.equal(ledger.plan.productionWritesScheduled, false);
  assert.equal(ledger.plan.prohibitedActions.includes("schema_apply"), true);
  assert.equal(ledger.plan.ownerApprovalRequiredFor.includes("data_backfill"), true);
  assert.match(result.planSha256, /^[a-f0-9]{64}$/u);
});

test("migration ledger rejects a source ledger that claims a different source revision", async testContext => {
  const fixture = await createFixture();
  testContext.after(() => Promise.all([
    rm(fixture.aurionRoot, { recursive: true, force: true }),
    rm(fixture.wasdRoot, { recursive: true, force: true }),
  ]));
  const sourceLedger = JSON.parse(await readFile(fixture.sourceLedgerPath, "utf8"));
  sourceLedger.source.revision = "0".repeat(40);
  const unsignedSourceLedger = { ...sourceLedger };
  delete unsignedSourceLedger.manifestSha256;
  sourceLedger.manifestSha256 = canonicalSha256(unsignedSourceLedger);
  await writeFile(fixture.sourceLedgerPath, `${JSON.stringify(sourceLedger, null, 2)}\n`);

  await assert.rejects(() => buildAurionWasdMigrationLedger({
    root: fixture.aurionRoot,
    wasdRoot: fixture.wasdRoot,
    sourceLedgerPath: fixture.sourceLedgerPath,
    out: ".ledger",
  }), /WASD_SOURCE_REVISION_MISMATCH/);
});

test("workflow keeps the WASD ledger toolchain pinned while inventorying source data", async () => {
  const workflow = await readFile(new URL("../.github/workflows/aurion-wasd-migration-ledger.yml", import.meta.url), "utf8");
  assert.match(workflow, /ref: e39ee9b6c085a1a02e5feb898532ad0e3085c30a/u);
  assert.match(workflow, /path: \.wasd-ledger-toolchain/u);
  assert.match(workflow, /node --test \.wasd-ledger-toolchain\/scripts\/__tests__\/build-wasd-aurion-source-ledger\.test\.mjs/u);
  assert.match(workflow, /node \.\.\/\.wasd-ledger-toolchain\/scripts\/build-wasd-aurion-source-ledger\.mjs/u);
  assert.doesNotMatch(workflow, /cd \.wasd-source\n\s+WASD_SOURCE_SHA=.* node scripts\/build-wasd-aurion-source-ledger\.mjs/u);
});
