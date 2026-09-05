import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-installed-tool-"));
const expected = path.join(directory, "expected");
fs.writeFileSync(expected, "exact verified executable\n");
const digest = createHash("sha256").update(fs.readFileSync(expected)).digest("hex");
fs.writeFileSync(path.join(directory, "sudo"), `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "-n" ]] || exit 64
case "$2" in
  stat) [[ "$3" == "-c" && "$4" == "%u_%g_%f" && "$#" == 5 ]] || exit 64; printf '%s\\n' "$TEST_METADATA" ;;
  sha256sum) [[ "$#" == 3 ]] || exit 64; printf '%s  %s\\n' "$TEST_DIGEST" "$3" ;;
  *) exit 64 ;;
esac
`, { mode: 0o755 });
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

function verify(metadata = "0_0_81ed", actual = digest, target = "/usr/local/sbin/aurion-production-schema-reconcile") {
  return spawnSync("bash", [path.resolve("deploy/verify-aurion-installed-schema-tool"), expected, target], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TEST_METADATA: metadata, TEST_DIGEST: actual }, encoding: "utf8",
  });
}

describe("fixed installed schema tool attestation", () => {
  it("accepts only matching regular root-owned 0755 executable bytes", () => {
    expect(verify().status).toBe(0);
    for (const metadata of ["1000_0_81ed", "0_1000_81ed", "0_0_81ff", "0_0_a1ff", "0_0_41ed"]) expect(verify(metadata).status).toBe(70);
    expect(verify("0_0_81ed", "0".repeat(64)).status).toBe(70);
  });
  it("rejects unrelated targets before invoking sudo", () => {
    expect(verify("0_0_81ed", digest, "/etc/shadow").status).toBe(64);
    expect(verify("0_0_81ed", digest, "/usr/local/sbin/aurion-production-schema-reconcile extra").status).toBe(64);
  });
});
