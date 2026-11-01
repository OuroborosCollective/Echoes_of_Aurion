import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { AURION_BINARY_AUTHORITY } from "../shared/aurionZoneRulesetContract.mjs";

describe("Blocker 1 final production proof contract", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy-aurion-zone-runtime.yml", "utf8");
  const promoter = fs.readFileSync("deploy/promote-aurion-zone-runtime.sh", "utf8");
  const compose = fs.readFileSync("docker-compose.traefik.yml", "utf8");
  const schemaReadback = fs.readFileSync(".github/workflows/aurion-production-schema-readback.yml", "utf8");
  const serverCore = fs.readFileSync("server/_core/index.ts", "utf8");

  it("injects immutable build/artifact/image/archive digests into production", () => {
    for (const key of ["AURION_BUILD_INPUT_DIGEST","AURION_ARTIFACT_DIGEST","AURION_RUNTIME_IMAGE_DIGEST","AURION_RELEASE_ARCHIVE_DIGEST"]) {
      expect(compose).toContain(key);
      expect(promoter).toContain(`export ${key}=`);
    }
    expect(promoter).toContain('runtime_image_id="$(docker image inspect');
    expect(promoter).toContain('build_input_digest="$(node --input-type=module');
    expect(promoter).toContain('artifact_digest="sha256:$(sha256sum');
    expect(promoter).toContain('release_archive_digest="sha256:$(sha256sum');
    expect(serverCore).toContain('releaseArchiveDigest: releaseArchiveDigest || "UNVERIFIED"');
  });

  it("requires internal and public health to match immutable identity and authority", () => {
    for (const field of [
      "health.buildInputDigest",
      "health.artifactDigest",
      "health.runtimeImageDigest",
      "health.releaseArchiveDigest",
      'health.authority?.ruleset !== "aurion-zone-v3"',
      'health.authority?.rulesetScope !== "runtime-default"',
      'health.authority?.defaultRulesetVersion !== "aurion.zone.rules.v3"',
      "health.authority.supportedZoneRulesets.length !== 2",
      "health.authority?.tickHz !== 10",
      "health.authority?.causalReceipts !== true",
    ]) expect(promoter).toContain(field);
    expect(promoter).toContain("authenticated_select_1");
  });

  it("publishes root-authored readback with the full release identity", () => {
    for (const field of [
      '"buildInputDigest":"%s"',
      '"artifactDigest":"%s"',
      '"runtimeImageDigest":"%s"',
      '"releaseArchiveDigest":"%s"',
      `"authority":${JSON.stringify(AURION_BINARY_AUTHORITY)}`,
    ]) expect(promoter).toContain(field);
    // The root-only shell promoter keeps serialized protocol snapshots; these
    // must stay identical to the runtime's single reviewed capability contract.
    const snapshots = [...promoter.matchAll(/"authority":(\{[^{}\r\n]*\})/g)].map(match => JSON.parse(match[1]));
    expect(snapshots).toHaveLength(2);
    for (const snapshot of snapshots) expect(snapshot).toEqual(AURION_BINARY_AUTHORITY);
  });

  function runFinalRulesetGuard(input: unknown) {
    const finalStep = workflow.split("- name: Emit final Blocker 1 production gate")[1];
    const actualImport = finalStep?.match(/import \{ requireZoneRulesetEvidence \} from "\.\/shared\/aurionZoneRulesetContract\.mjs";/)?.[0];
    const actualGuard = finalStep?.match(/\/\/ aurion-final-zone-ruleset-guard:start([\s\S]*?)\/\/ aurion-final-zone-ruleset-guard:end/)?.[1];
    if (!actualImport || !actualGuard) throw new Error("FINAL_RULESET_GUARD_SOURCE_MISSING");
    // Execute the actual workflow fragment in plain Node, the production
    // gate's runtime, using deliberately small contract fixtures only.
    return spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs";
      ${actualImport}
      const {gameplay, installed, health}=JSON.parse(fs.readFileSync(0,"utf8"));
      ${actualGuard}
      process.stdout.write(JSON.stringify({zoneRulesetVersion}));
    `], { input: JSON.stringify(input), encoding: "utf8", timeout: 10000,
      env: { PATH: process.env.PATH } });
  }

  function rulesetFixture(ruleset = "aurion.zone.rules.v2") {
    return { gameplay: { zoneRulesetVersion: ruleset, membershipPersistence: { receipts: [{ rulesetVersion: ruleset }] } },
      installed: { authority: structuredClone(AURION_BINARY_AUTHORITY) },
      health: { authority: structuredClone(AURION_BINARY_AUTHORITY) } };
  }

  it.each(["aurion.zone.rules.v2", "aurion.zone.rules.v3"])("final plain-Node gate certifies actual %s separately from binary default", ruleset => {
    const result = runFinalRulesetGuard(rulesetFixture(ruleset));
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ zoneRulesetVersion: ruleset });
    expect(workflow).toContain("binaryAuthority:health.authority");
    expect(workflow).toContain("binaryAuthorityRulesetScope");
    expect(workflow).not.toMatch(/\bauthorityRuleset:/);
  });

  it.each(["missing", "unsupported", "receipt", "empty", "scope", "default", "support", "tick", "causal"])("final plain-Node gate rejects %s ruleset evidence", mode => {
    const input: any = rulesetFixture();
    if (mode === "missing") delete input.gameplay.zoneRulesetVersion;
    if (mode === "unsupported") {
      input.gameplay.zoneRulesetVersion = "aurion.zone.rules.v999";
      input.gameplay.membershipPersistence.receipts[0].rulesetVersion = "aurion.zone.rules.v999";
      input.health.authority.supportedZoneRulesets.push("aurion.zone.rules.v999");
      input.installed.authority.supportedZoneRulesets.push("aurion.zone.rules.v999");
    }
    if (mode === "receipt") input.gameplay.membershipPersistence.receipts[0].rulesetVersion = "aurion.zone.rules.v3";
    if (mode === "empty") input.gameplay.membershipPersistence.receipts = [];
    if (mode === "scope") input.health.authority.rulesetScope = "executed-gameplay";
    if (mode === "default") input.installed.authority.defaultRulesetVersion = "aurion.zone.rules.v2";
    if (mode === "support") input.health.authority.supportedZoneRulesets = ["aurion.zone.rules.v3"];
    if (mode === "tick") input.installed.authority.tickHz = 9;
    if (mode === "causal") input.health.authority.causalReceipts = false;
    const result = runFinalRulesetGuard(input);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("GAMEPLAY_RULESET_MISMATCH");
  });

  it("requires trusted attestations and exact production schema before final PASS", () => {
    expect(workflow).toContain("final-production-gate:");
    expect(workflow).toContain("needs: [verify-release-attestations, production-schema-readback, functional-production-readback]");
    expect(workflow).toContain("FINAL_GAMEPLAY_READBACK_NOT_PASS");
    expect(workflow).toContain('--deny-self-hosted-runners');
    expect(workflow).toContain('schema.state!=="PRESENT_SCHEMA_MATCH"');
    expect(workflow).toContain('expectedTags.includes(requiredCausalReceiptV2Tag)');
    expect(workflow).toContain('schema.migrations.some(item=>item.tag===requiredCausalReceiptV2Tag)');
    expect(workflow).toContain('schema.migrations.at(-1)?.tag!==expectedTags.at(-1)');
    expect(workflow).toContain('schemaCausalReceiptV2Present:true');
    expect(workflow).toContain('schemaLastMigration:expectedTags.at(-1)');
    expect(workflow).toContain("health.releaseArchiveDigest!==identity.releaseArchiveDigest");
    expect(workflow).toContain("releaseArchiveDigest:identity.releaseArchiveDigest");
    expect(workflow).toContain('gateId:"AURION-M21-B1-PRODUCTION"');
    expect(workflow).toContain("authenticatedReadback:true");
  });

  it("seals non-destructive continuous assurance from runtime and external gate evidence", () => {
    expect(serverCore).toContain("causalAssurance: globalAssuranceService.latest()");
    expect(workflow).toContain('health.causalAssurance?.schema!=="aurion.causal-assurance.v1"');
    expect(workflow).toContain("node scripts/aurion-production-assurance.mjs");
    expect(workflow).toContain("aurion-production-assurance.json");
    expect(workflow).toContain('receipt.snapshot?.status==="CONTRADICTED"');
  });

  it("keeps causal receipt v2 explicit while following the canonical migration manifest", () => {
    expect(schemaReadback).toContain('"0049_aurion_causal_receipt_v2"');
    expect(schemaReadback).toContain("receipt.sourceRevision!==process.env.EXPECTED_SHA");
    expect(schemaReadback).toContain("receipt.databaseCredentialReturned!==false");
  });

  it("does not add a raw manual production correction path", () => {
    expect(workflow).not.toContain("ssh ");
    expect(promoter).not.toContain("git pull");
    expect(promoter).not.toMatch(/\bdocker\s+exec\s+.*(?:mysql|mariadb)\s+-e\s+["']?(?:UPDATE|INSERT|DELETE|ALTER|DROP)/i);
  });
});
