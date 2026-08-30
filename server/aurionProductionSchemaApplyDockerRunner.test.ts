import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion production schema apply boundary", () => {
  const runner = read("deploy/aurion-production-schema-apply");
  const core = read("deploy/aurion-production-schema-apply-core");
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
    expect(runner).toContain("VERIFY_GITHUB_ACTIONS_OIDC");
    expect(runner).toContain("token.actions.githubusercontent.com/.well-known/jwks");
    expect(runner).toContain("aurion-production-schema-apply-v1:${expectedSha}:${planSha256}");
    expect(runner).toContain("workflow_ref");
    expect(runner).toContain("repo:OuroborosCollective@266194342/Echoes_of_Aurion@1313103794:environment:production");
    expect(runner).toContain("repository_id");
    expect(runner).toContain("repository_owner_id");
    expect(runner).not.toContain('payload.sub!=="repo:OuroborosCollective/Echoes_of_Aurion:environment:production"');
    expect(core).toContain("phase=CREATE_LOGICAL_BACKUP");
  });

  it("requires a fresh read-only preflight before a write-capable Docker boundary", () => {
    expect(core).toContain("phase=FRESH_READ_ONLY_PREFLIGHT");
    expect(core).toContain("node /apply/bin/reconcile.cjs");
    expect(core).toContain("phase=APPLY_SCHEMA");
    expect(core).toContain("node /apply/bin/apply.cjs");
    expect(core.indexOf("phase=FRESH_READ_ONLY_PREFLIGHT")).toBeLessThan(core.indexOf("phase=CREATE_LOGICAL_BACKUP"));
    expect(core.indexOf("phase=CREATE_LOGICAL_BACKUP")).toBeLessThan(core.indexOf("phase=APPLY_SCHEMA"));
    expect(core).toContain("phase=POST_APPLY_READBACK");
  });

  it("backs up and restores in a network-isolated disposable database before apply", () => {
    expect(core).toContain("--single-transaction --quick --skip-lock-tables --routines --events --triggers --add-drop-database --databases");
    expect(core).toContain("gzip -t");
    expect(core).toContain("--network none");
    expect(core).toContain("MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1");
    expect(core).toContain("RECOVERY_PROOF_MISMATCH");
    expect(core).toContain("APPLY_RECOVERY_ERROR_CLASS");
    expect(core).toContain("MARIADB_ERROR_");
    expect(core).toContain("recovery_stderr_sha256");
    expect(core).toContain('rm -f "$recovery_stderr"');
    expect(core).toContain('type=bind,src=${backup_file},dst=/recovery-input/production.sql.gz,readonly');
    expect(core).toContain("RECOVERY_TOOLING_UNAVAILABLE");
    expect(core).toContain('case "$(cat /proc/1/comm)" in');
    expect(core).toContain("mariadbd|mysqld");
    expect(core.indexOf('case "$(cat /proc/1/comm)" in')).toBeLessThan(
      core.indexOf("gzip -t /recovery-input/production.sql.gz"),
    );
    expect(core).toContain("gzip -t /recovery-input/production.sql.gz");
    expect(core).toContain('gzip -cd /recovery-input/production.sql.gz | "$client" --protocol=socket -uroot');
    expect(core).not.toContain('gzip -cd "$backup_file" 2>"$recovery_stderr" | docker exec -i');
    expect(core).not.toContain('cat "$recovery_stderr"');
    expect(core).toContain("schemaSha256");
    expect(core).not.toContain("--privileged");
    expect(core).not.toContain("--network host");
    expect(core).not.toContain("/var/run/docker.sock");
  });

  it("keeps credentials in root-only files and never returns them in receipts", () => {
    expect(core).toContain("env_file=/opt/echoes-of-aurion/.env.production");
    expect(core).toContain('"$(stat -c \'%U:%G:%a\' "$env_file")" == "root:root:600"');
    expect(core).toContain("databaseCredentialReturned:false");
    expect(core).toContain("mysql-client-config.cjs");
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
