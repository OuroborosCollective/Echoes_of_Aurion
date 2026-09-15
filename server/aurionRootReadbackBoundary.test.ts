import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion root readback boundary contracts", () => {
  const reconcileSudoers = read("deploy/aurion-production-schema-reconcile.sudoers");
  const applySudoers = read("deploy/aurion-production-schema-apply.sudoers");
  const deployWorkflow = read(".github/workflows/deploy-aurion-zone-runtime.yml");

  const reconcileManifest = "/opt/echoes-of-aurion-schema-reconcile/current/manifest.json";
  const applyManifest = "/opt/echoes-of-aurion-schema-apply/current/manifest.json";

  it("enforces fixed root-owned manifest paths across apply and reconcile policies", () => {
    expect(reconcileSudoers).toContain(`/usr/bin/test -f ${reconcileManifest}`);
    expect(applySudoers).toContain(`/usr/bin/test -f ${applyManifest}`);
  });

  it("requires non-interactive sudo -n execution for manifest existence and revision grep", () => {
    expect(deployWorkflow).toContain(`sudo -n test -f ${reconcileManifest}`);
    expect(deployWorkflow).toContain(`sudo -n grep -Fq "\${EXPECTED_SHA}" ${reconcileManifest}`);
    expect(deployWorkflow).toContain(`sudo -n test -f ${applyManifest}`);
    expect(deployWorkflow).toContain(`sudo -n grep -Fq "\${EXPECTED_SHA}" ${applyManifest}`);
  });

  it("enforces exact 40-hex character pattern for grep in sudoers to prevent command injection", () => {
    const sha40Pattern = "[0-9a-f]".repeat(40);
    expect(reconcileSudoers).toContain(
      `aurion-deploy ALL=(root) NOPASSWD: /usr/bin/grep -Fq ${sha40Pattern} ${reconcileManifest}`
    );
    expect(applySudoers).toContain(
      `aurion-deploy ALL=(root) NOPASSWD: /usr/bin/grep -Fq ${sha40Pattern} ${applyManifest}`
    );
  });

  it("rejects dangerous shells, container escape binaries, and wildcard arguments", () => {
    for (const sudoers of [reconcileSudoers, applySudoers]) {
      expect(sudoers).not.toMatch(/\/bin\/sh\b/);
      expect(sudoers).not.toContain("/bin/bash");
      expect(sudoers).not.toContain("/usr/bin/docker");
      expect(sudoers).not.toContain("/usr/bin/test *");
      expect(sudoers).not.toContain("/usr/bin/grep -Fq *");
      expect(sudoers).not.toContain("/usr/bin/grep -Fq ?");
    }
  });

  it("enforces root integrity verification of reconciliation runner executables", () => {
    expect(reconcileSudoers).toContain(
      "aurion-deploy ALL=(root) NOPASSWD: /usr/bin/stat -c %u_%g_%f /usr/local/sbin/aurion-production-schema-reconcile"
    );
    expect(reconcileSudoers).toContain(
      "aurion-deploy ALL=(root) NOPASSWD: /usr/bin/sha256sum /usr/local/sbin/aurion-production-schema-reconcile"
    );
  });
});
