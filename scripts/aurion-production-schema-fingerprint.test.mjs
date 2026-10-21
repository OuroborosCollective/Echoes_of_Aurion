import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const core = readFileSync(fileURLToPath(new URL("../deploy/aurion-production-schema-apply-core", import.meta.url)), "utf8");
const start = core.indexOf("\nphase=ISOLATED_RECOVERY_PROOF\n");
const end = core.indexOf("\nrecovery_container=", start);
assert.ok(start > 0 && end > start, "source fingerprint segment must remain present and bounded");
const segment = core.slice(start, end);

function runSchemaFingerprint(mode) {
  const fixture = `set -euo pipefail
    database_name=aurion_test
    phase=START
    trap 'printf "OBSERVED_PHASE=%s\\n" "$phase"' EXIT
    production_client() {
      case ${JSON.stringify(mode)} in
        ok) printf 'CREATE TABLE sample (id INT);\\n'; return 0 ;;
        timeout) return 124 ;;
        interrupted) return 137 ;;
        client-error) return 2 ;;
        require-unlocked)
          case " $* " in *" --single-transaction "*) ;; *) return 23 ;; esac
          case " $* " in *" --skip-lock-tables "*) ;; *) return 23 ;; esac
          case " $* " in *" --no-data "*) ;; *) return 23 ;; esac
          printf 'CREATE TABLE sample (id INT);\\n'; return 0 ;;
      esac
    }
    ${segment}
    printf 'SCHEMA_SHA256=%s\\n' "$source_schema_sha256"
  `;
  return spawnSync("bash", ["-c", fixture], { encoding: "utf8", timeout: 8000 });
}

test("successful source schema fingerprint remains SHA-256 of the complete dump", () => {
  const result = runSchemaFingerprint("ok");
  assert.equal(result.status, 0, result.stderr);
  const expected = createHash("sha256").update("CREATE TABLE sample (id INT);\n").digest("hex");
  assert.match(result.stdout, new RegExp(`SCHEMA_SHA256=${expected}`));
});

test("a source dump exit 124 is reported as bounded timeout, not generic failure", () => {
  const result = runSchemaFingerprint("timeout");
  assert.equal(result.status, 69);
  assert.match(result.stdout, /OBSERVED_PHASE=SOURCE_SCHEMA_FINGERPRINT_TIMEOUT/);
});

test("a killed source dump fails closed with its own interrupted classification", () => {
  const result = runSchemaFingerprint("interrupted");
  assert.equal(result.status, 69);
  assert.match(result.stdout, /OBSERVED_PHASE=SOURCE_SCHEMA_FINGERPRINT_INTERRUPTED/);
});

test("other source dump failures retain their fail-closed generic stage", () => {
  const result = runSchemaFingerprint("client-error");
  assert.equal(result.status, 69);
  assert.match(result.stdout, /OBSERVED_PHASE=SOURCE_SCHEMA_FINGERPRINT_FAILED/);
});

test("the source schema fingerprint runs a non-locking snapshot dump", () => {
  const result = runSchemaFingerprint("require-unlocked");
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("all source, recovery and refreshed schema fingerprints use the same non-locking dump options", () => {
  const calls = [...core.matchAll(/(?:production_client|recovery_client) dump --no-data[^\n]+/g)].map(m => m[0]);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.match(call, /--no-data --single-transaction --skip-lock-tables/);
  }
});
