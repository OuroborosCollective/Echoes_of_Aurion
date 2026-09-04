import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const workflow = read(".github/workflows/deploy-aurion-zone-runtime.yml");
const reconcileSudoers = read("deploy/aurion-production-schema-reconcile.sudoers");
const applySudoers = read("deploy/aurion-production-schema-apply.sudoers");
const sha40Pattern = "?".repeat(40);

describe("Aurion post-promotion manifest readback authority", () => {
  it("authorizes only the fixed root-owned manifest checks used by the workflow", () => {
    const reconcileManifest = "/opt/echoes-of-aurion-schema-reconcile/current/manifest.json";
    const applyManifest = "/opt/echoes-of-aurion-schema-apply/current/manifest.json";

    expect(workflow).toContain(`sudo -n test -f ${reconcileManifest}`);
    expect(workflow).toContain(`sudo -n grep -Fq "${"${EXPECTED_SHA}"}" ${reconcileManifest}`);
    expect(workflow).toContain(`sudo -n test -f ${applyManifest}`);
    expect(workflow).toContain(`sudo -n grep -Fq "${"${EXPECTED_SHA}"}" ${applyManifest}`);

    expect(reconcileSudoers).toContain(
      `aurion-deploy ALL=(root) NOPASSWD: /usr/bin/test -f ${reconcileManifest}`,
    );
    expect(reconcileSudoers).toContain(
      `aurion-deploy ALL=(root) NOPASSWD: /usr/bin/grep -Fq ${sha40Pattern} ${reconcileManifest}`,
    );
    expect(applySudoers).toContain(
      `aurion-deploy ALL=(root) NOPASSWD: /usr/bin/test -f ${applyManifest}`,
    );
    expect(applySudoers).toContain(
      `aurion-deploy ALL=(root) NOPASSWD: /usr/bin/grep -Fq ${sha40Pattern} ${applyManifest}`,
    );
  });

  it("does not grant generic root shell, Docker, test, grep, or extra-path access", () => {
    for (const policy of [reconcileSudoers, applySudoers]) {
      expect(policy).not.toContain("/bin/bash");
      expect(policy).not.toContain("/usr/bin/docker");
      expect(policy).not.toContain("/usr/bin/test *");
      expect(policy).not.toContain("/usr/bin/grep -Fq *");
      expect(policy).not.toMatch(/\/usr\/bin\/grep\s+[^\n]*\s+\/[^\n]*\s+\/[^\n]*$/m);
    }
  });
});
