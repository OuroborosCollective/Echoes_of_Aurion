import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { AURION_BINARY_AUTHORITY } from "../shared/aurionZoneRulesetContract.mjs";

const workflow = readFileSync(".github/workflows/deploy-aurion-zone-runtime.yml", "utf8");
const promotion = workflow.split("      - name: Read back installed container and schema identities")[1]?.split("      - name:")[0];
const script = promotion?.match(/node --input-type=module -e '(\n\s+import fs from "node:fs";[\s\S]*?)'\s+"\$readback"/)?.[1];

// Offline contract fixtures only; these do not represent an executed deployment.
function validateAuthority(authority: unknown) {
  if (!script) throw new Error("PROMOTION_VALIDATOR_NOT_FOUND");
  const directory = mkdtempSync(join(tmpdir(), "aurion-authority-contract-"));
  const receipt = {
    recordType: "aurion_traefik_runtime_readback", revision: "a".repeat(40), releaseId: "test-release",
    buildInputDigest: `sha256:${"b".repeat(64)}`, artifactDigest: `sha256:${"c".repeat(64)}`,
    releaseArchiveDigest: `sha256:${"d".repeat(64)}`, imageId: `sha256:${"e".repeat(64)}`,
    runtimeImageDigest: `sha256:${"e".repeat(64)}`, containerId: "f".repeat(64),
    domain: "arelogic.space", traefikNetwork: "areloria_arelorian-network",
    databaseNetwork: "echoes-of-aurion-internal", databaseConnectivity: "authenticated_select_1",
    runtimeManifestSha256: "1".repeat(64), schemaManifestSha256: "2".repeat(64), schemaMode: "read_only", authority,
  };
  const file = join(directory, "receipt.json");
  writeFileSync(file, JSON.stringify(receipt));
  try {
    return spawnSync(process.execPath, ["--input-type=module", "-e", script, file, receipt.revision,
      receipt.releaseId, receipt.runtimeManifestSha256, receipt.schemaManifestSha256,
      receipt.buildInputDigest, receipt.artifactDigest, receipt.releaseArchiveDigest], { encoding: "utf8", timeout: 10_000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("release authority follows the canonical binary contract", () => {
  it("accepts the current authority in the actual promotion validator", () => {
    const result = validateAuthority(AURION_BINARY_AUTHORITY);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it.each([
    { ruleset: "aurion-zone-v3" }, { tickHz: 9 }, { causalReceipts: false },
    { rulesetScope: "executed-zone" }, { defaultRulesetVersion: "aurion.zone.rules.v3" },
    { supportedZoneRulesets: [] }, { supportedZoneRulesets: [...AURION_BINARY_AUTHORITY.supportedZoneRulesets].reverse() },
  ])("rejects authority drift: %j", change => {
    expect(validateAuthority({ ...AURION_BINARY_AUTHORITY, ...change }).status).not.toBe(0);
  });

  it("emits final-gate expectations from the same binary authority", () => {
    const final = workflow.split("      - name: Emit final Blocker 1 production gate")[1];
    const expected = final.split("          const expected={")[1].split("          };")[0];
    const fields = ["binaryAuthorityRuleset", "binaryAuthorityRulesetScope", "binaryDefaultRulesetVersion", "authorityTickHz", "causalReceipts"];
    const expressions = fields.map(key => {
      const expression = expected.match(new RegExp(`\\b${key}:([^,\\n]+)`))?.[1];
      if (!expression) throw new Error(`FINAL_AUTHORITY_EXPECTATION_MISSING:${key}`);
      return `${key}:${expression}`;
    });
    const actual = runInNewContext(`({${expressions.join(",")}})`, { AURION_BINARY_AUTHORITY });
    expect(JSON.parse(JSON.stringify(actual))).toEqual({
      binaryAuthorityRuleset: AURION_BINARY_AUTHORITY.ruleset,
      binaryAuthorityRulesetScope: AURION_BINARY_AUTHORITY.rulesetScope,
      binaryDefaultRulesetVersion: AURION_BINARY_AUTHORITY.defaultRulesetVersion,
      authorityTickHz: AURION_BINARY_AUTHORITY.tickHz, causalReceipts: AURION_BINARY_AUTHORITY.causalReceipts,
    });
  });
});
