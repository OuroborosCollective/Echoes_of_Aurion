import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Blocker 2 detached release attestation contract", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy-aurion-zone-runtime.yml", "utf8");
  const builder = fs.readFileSync("scripts/build-aurion-traefik-runtime-artifact.mjs", "utf8");
  const buildInput = fs.readFileSync("scripts/aurion-build-input-manifest.mjs", "utf8");

  it("pins GitHub's attestation action and grants only explicit signing permissions", () => {
    expect(workflow.match(/actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6/g)?.length).toBe(2);
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
  });

  it("signs only after the final runtime archive exists and before publishing it", () => {
    const archive = workflow.indexOf("tar -C dist-traefik-runtime -czf aurion-traefik-runtime-release.tgz");
    const predicate = workflow.indexOf("Prepare canonical release artifact attestation predicate");
    const attest = workflow.indexOf("Attest finalized Aurion runtime release archive");
    const publish = workflow.indexOf("Publish immutable runtime artifact");
    expect(archive).toBeGreaterThan(-1);
    expect(archive).toBeLessThan(predicate);
    expect(predicate).toBeLessThan(attest);
    expect(attest).toBeLessThan(publish);
  });

  it("binds custom predicates to exact signer workflow, main ref and source digest", () => {
    expect(workflow).toContain("--signer-workflow");
    expect(workflow).toContain("--source-digest");
    expect(workflow).toContain('--source-ref "refs/heads/main"');
    expect(workflow).toContain('--predicate-type "https://arelogic.space/attestations/aurion-release-artifact/v1"');
    expect(workflow).toContain("--deny-self-hosted-runners");
    expect(workflow).toContain('--predicate-type "https://arelogic.space/attestations/aurion-runtime-release/v1"');
    expect(workflow).toContain('test "${tamper_status}" -ne 0');
  });

  it("requires independent attestation verification before production schema apply", () => {
    expect(workflow).toContain("verify-release-attestations:");
    expect(workflow).toContain("needs: [migration-ledger, promote-zone-runtime, verify-release-attestations]");
    expect(workflow.indexOf("verify-release-attestations:")).toBeLessThan(workflow.indexOf("apply-reviewed-schema-plan:"));
  });

  it("seals a canonical BuildInputManifest into the runtime artifact", () => {
    expect(builder).toContain("writeAurionBuildInputManifest");
    expect(builder).toContain('buildInputManifest: "build-input-manifest.json"');
    expect(builder).toContain("buildInputDigest: buildInput.digest");
    for (const bound of [
      "package.json",
      "pnpm-lock.yaml",
      "Dockerfile",
      "docker-compose.traefik.yml",
      "drizzle/meta/_journal.json",
      "scripts/install-game-development-studio.mjs",
    ]) expect(buildInput).toContain(bound);
  });
});
