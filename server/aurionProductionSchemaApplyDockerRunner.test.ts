import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion production schema apply boundary", () => {
  const runner = read("deploy/aurion-production-schema-apply");
  const installer = read("deploy/install-aurion-production-schema-apply");
  const verifier = read("deploy/verify-aurion-production-schema-apply-artifact.mjs");
  const builder = read("scripts/build-aurion-production-apply-artifact.mjs");
  const apply = read("scripts/apply-aurion-production-schema.ts");
  const databaseClientConfig = read("scripts/aurionProductionDatabaseClientConfig.ts");

  it("uses a distinct artifact, root entrypoint and narrow sudo rule", () => {
    expect(runner).toContain("base=/opt/echoes-of-aurion-schema-apply");
    expect(runner).toContain("installed_runner=/usr/local/sbin/aurion-production-schema-apply");
    expect(runner).toContain("plan_sha256");
    expect(read("deploy/aurion-production-schema-apply.sudoers")).toContain(
      "aurion-deploy ALL=(root) NOPASSWD: /usr/local/sbin/aurion-production-schema-apply *",
    );
    expect(read("deploy/aurion-production-schema-apply.sudoers")).not.toContain("ALL=(ALL)");
  });

  it("requires a fresh read-only preflight before a write-capable Docker boundary", () => {
    expect(runner).toContain("phase=FRESH_READ_ONLY_PREFLIGHT");
    expect(runner).toContain("node /apply/bin/reconcile.cjs");
    expect(runner).toContain("phase=APPLY_SCHEMA");
    expect(runner).toContain("node /apply/bin/apply.cjs");
    expect(runner.indexOf("phase=FRESH_READ_ONLY_PREFLIGHT")).toBeLessThan(runner.indexOf("phase=CREATE_LOGICAL_BACKUP"));
    expect(runner.indexOf("phase=CREATE_LOGICAL_BACKUP")).toBeLessThan(runner.indexOf("phase=APPLY_SCHEMA"));
    expect(runner).toContain("phase=POST_APPLY_READBACK");
  });

  it("backs up and restores in a network-isolated disposable database before apply", () => {
    expect(runner).toContain("--single-transaction --quick --skip-lock-tables --routines --events --triggers --add-drop-database --databases");
    expect(runner).toContain("gzip -t");
    expect(runner).toContain("--network none");
    expect(runner).toContain("MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1");
    expect(runner).toContain("RECOVERY_PROOF_MISMATCH");
    expect(runner).toContain("schemaSha256");
    expect(runner).not.toContain("--privileged");
    expect(runner).not.toContain("--network host");
    expect(runner).not.toContain("/var/run/docker.sock");
  });

  it("keeps credentials in root-only files and never returns them in receipts", () => {
    expect(runner).toContain("env_file=/opt/echoes-of-aurion/.env.production");
    expect(runner).toContain('"$(stat -c \'%U:%G:%a\' "$env_file")" == "root:root:600"');
    expect(runner).toContain("databaseCredentialReturned:false");
    expect(runner).toContain("mysql-client-config.cjs");
    expect(databaseClientConfig).toContain("--my-cnf");
    expect(databaseClientConfig).toContain("--database-name");
    expect(databaseClientConfig).not.toContain("console.log");
  });

  it("locks and validates the expected journal prefix before Drizzle migration", () => {
    expect(apply).toContain("GET_LOCK(?, 30)");
    expect(apply).toContain("validateJournalProgress");
    expect(apply).toContain("JOURNAL_CONFLICT");
    expect(apply).toContain("migrationsFolder: path.join(projectRoot, \"drizzle\")");
    expect(apply).toContain("APPLY_SUCCEEDED");
    expect(apply).toContain("ALREADY_APPLIED");
  });

  it("installs only a closed manifest-bound artifact", () => {
    expect(builder).toContain("aurion_production_schema_apply_artifact");
    expect(builder).toContain("backup_recovery_apply");
    expect(builder).toContain("drizzle/meta/_journal.json");
    expect(verifier).toContain("aurion_production_schema_apply_artifact");
    expect(verifier).toContain("backup_recovery_apply");
    expect(verifier).toContain("actualFiles");
    expect(installer).toContain("validate_artifact");
    expect(installer).toContain("validate_release");
    expect(installer).toContain("visudo -cf");
    expect(installer).toContain("root:root:600");
  });
});
