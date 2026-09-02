import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/deploy-aurion-zone-runtime.yml"),
  "utf8",
);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("Aurion production root readback boundary", () => {
  it("keeps installed schema manifests root-owned and reads them only through fixed non-interactive sudo commands", () => {
    for (const target of [
      "/opt/echoes-of-aurion-schema-reconcile/current/manifest.json",
      "/opt/echoes-of-aurion-schema-apply/current/manifest.json",
    ]) {
      const escapedTarget = escapeRegExp(target);
      expect(workflow).toContain(`sudo -n test -f ${target}`);
      expect(workflow).toContain(`sudo -n grep -Fq "\${EXPECTED_SHA}" ${target}`);
      expect(workflow).not.toMatch(new RegExp(`(?<!sudo -n )\\btest\\s+-f\\s+${escapedTarget}`));
      expect(workflow).not.toMatch(new RegExp(`(?<!sudo -n )\\bgrep\\s+-Fq\\s+"\\$\\{EXPECTED_SHA\\}"\\s+${escapedTarget}`));
    }
  });
});
