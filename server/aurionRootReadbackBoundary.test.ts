import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/deploy-aurion-zone-runtime.yml"),
  "utf8",
);

describe("Aurion production root readback boundary", () => {
  it("keeps installed schema manifests root-owned and reads them only through fixed sudo commands", () => {
    for (const target of [
      "/opt/echoes-of-aurion-schema-reconcile/current/manifest.json",
      "/opt/echoes-of-aurion-schema-apply/current/manifest.json",
    ]) {
      expect(workflow).toContain(`sudo test -f ${target}`);
      expect(workflow).toContain(`sudo grep -Fq "\${EXPECTED_SHA}" ${target}`);
      expect(workflow).not.toContain(`\n          test -f ${target}`);
      expect(workflow).not.toContain(`\n          grep -Fq "\${EXPECTED_SHA}" ${target}`);
    }
  });
});
