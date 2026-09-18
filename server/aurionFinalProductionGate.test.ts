import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Blocker 1 final production proof contract", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy-aurion-zone-runtime.yml", "utf8");
  const promoter = fs.readFileSync("deploy/promote-aurion-zone-runtime.sh", "utf8");
  const compose = fs.readFileSync("docker-compose.traefik.yml", "utf8");
  const schemaReadback = fs.readFileSync(".github/workflows/aurion-production-schema-readback.yml", "utf8");

  it("injects all immutable release digests into the production container", () => {
    for (const key of [
      "AURION_BUILD_INPUT_DIGEST",
      "AURION_ARTIFACT_DIGEST",
      "AURION_RUNTIME_IMAGE_DIGEST",
    ]) {
      expect(compose).toContain(key);
      expect(promoter).toContain(`export ${key}=`);
    }
    expect(promoter).toContain('runtime_image_id="$(docker image inspect');
    expect(promoter).toContain("docker inspect --format '{{.Image}}' \"$container_id\"");
    expect(promoter).toContain('build_input_digest="$(node --input-type=module');
    expect(promoter).toContain('artifact_digest="sha256:$(sha256sum');
    expect(promoter).toContain('release_archive_digest="sha256:$(sha256sum');
  });

  it("requires internal and public health to match full release identity and authority", () => {
    for (const field of [
      "health.buildInputDigest",
      "health.artifactDigest",
      "health.runtimeImageDigest",
      'health.authority?.ruleset !== "aurion-zone-v3"',
      "health.authority?.tickHz !== 10",
      "health.authority?.causalReceipts !== true",
    ]) expect(promoter).toContain(field);
    expect(promoter).toContain("databaseConnectivity");
    expect(promoter).toContain("authenticated_select_1");
  });

  it("publishes root-authored readback with immutable identities", () => {
    for (const field of [
      '"buildInputDigest":"%s"',
      '"artifactDigest":"%s"',
      '"runtimeImageDigest":"%s"',
      '"releaseArchiveDigest":"%s"',
      '"authority":{"ruleset":"aurion-zone-v3","tickHz":10,"causalReceipts":true}',
    ]) expect(promoter).toContain(field);
  });

  it("requires detached attestation before production apply and final gate after schema readback", () => {
    expect(workflow).toContain("needs: [migration-ledger, promote-zone-runtime, verify-release-attestations]");
    expect(workflow).toContain("final-production-gate:");
    expect(workflow).toContain("needs: [verify-release-attestations, production-schema-readback]");
    expect(workflow).toContain('schema.state!=="PRESENT_SCHEMA_MATCH"');
    expect(workflow).toContain('schema.migrations.at(-1)?.tag!=="0049_aurion_causal_receipt_v2"');
    expect(workflow).toContain('gateId:"AURION-M21-B1-PRODUCTION"');
    expect(workflow).toContain("authenticatedReadback:true");
  });

  it("keeps production schema readback revision-bound through migration 0049", () => {
    expect(schemaReadback).toContain('"0049_aurion_causal_receipt_v2"');
    expect(schemaReadback).toContain('receipt.sourceRevision!==process.env.EXPECTED_SHA');
    expect(schemaReadback).toContain('receipt.databaseCredentialReturned!==false');
  });

  it("does not introduce a raw manual production correction path", () => {
    expect(workflow).not.toContain("ssh ");
    expect(workflow).not.toContain("sudo docker");
    expect(promoter).not.toContain("git pull");
    expect(promoter).not.toMatch(/\bdocker\s+exec\s+.*(?:mysql|mariadb)\s+-e\s+["']?(?:UPDATE|INSERT|DELETE|ALTER|DROP)/i);
  });
});
