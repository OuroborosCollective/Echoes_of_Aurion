import fs from "node:fs";
import { describe, expect, it } from "vitest";

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
      '"authority":{"ruleset":"aurion-zone-v3","tickHz":10,"causalReceipts":true}',
    ]) expect(promoter).toContain(field);
  });

  it("requires trusted attestations and exact production schema before final PASS", () => {
    expect(workflow).toContain("final-production-gate:");
    expect(workflow).toContain("needs: [verify-release-attestations, production-schema-readback]");
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
