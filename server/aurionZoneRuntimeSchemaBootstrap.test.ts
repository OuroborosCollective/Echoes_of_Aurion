import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion zone promotion schema-runner bootstrap", () => {
  const workflow = read(".github/workflows/deploy-aurion-zone-runtime.yml");
  const promoter = read("deploy/promote-aurion-zone-runtime.sh");

  it("builds and publishes the read-only reconciler with the exact zone revision", () => {
    expect(workflow).toContain("AURION_RELEASE_SHA: ${{ github.sha }}");
    expect(workflow).toContain("node scripts/build-aurion-production-reconcile-artifact.mjs");
    expect(workflow).toContain("dist-production-reconcile");
    expect(workflow).toContain('manifest.mode!=="read_only"');
    expect(workflow).toContain('manifest.revision!==process.env.GITHUB_SHA');
    expect(workflow).toContain('node dist-production-reconcile/deploy/verify-aurion-production-schema-reconcile-artifact.mjs dist-production-reconcile "$GITHUB_SHA"');
  });

  it("makes a real production receipt a required final deployment gate", () => {
    expect(workflow).toContain("root-reconciliation-proof:");
    expect(workflow).toContain("uses: ./.github/workflows/aurion-root-reconciliation-artifact-proof.yml");
    expect(workflow).toContain("production-schema-readback:");
    expect(workflow).toContain("uses: ./.github/workflows/aurion-production-schema-readback.yml");
    expect(workflow).toContain("needs: promote-zone-runtime");
    expect(workflow).toContain("expected_sha: ${{ github.sha }}");
    expect(workflow).toContain("upstream_run_id: ${{ github.run_id }}");
  });

  it("uses only the existing allowlisted root promoter on the production runner", () => {
    const invocations = workflow.match(
      /sudo \/usr\/local\/sbin\/promote-aurion-zone-runtime/g,
    );
    expect(invocations?.length).toBe(2);
    expect(workflow).not.toContain("sudo bash deploy/install-aurion-production-schema-reconcile");
    expect(workflow).not.toContain("drizzle-kit migrate");
  });

  it("provisions and verifies the artifact-pinned reconciliation image before promotion", () => {
    const preflight = workflow.indexOf("Provision digest-pinned reconciliation Docker image");
    const promote = workflow.indexOf("Promote node runtime and bounded schema runner");
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(promote);
    expect(workflow).toContain('(cd "$artifact" && sha256sum --strict -c checksums.sha256)');
    expect(workflow).toContain('sudo docker pull "$pinned_image"');
    expect(workflow).toContain('grep -Fq "@${image_digest}"');
  });

  it("installs only the fixed read-only runner and never applies SQL", () => {
    expect(promoter).toContain("install-aurion-production-schema-reconcile");
    expect(promoter).toContain("--enable-runner");
    expect(promoter).toContain("schema_current=/opt/echoes-of-aurion-schema-reconcile/current");
    expect(promoter).toContain("visudo -cf /etc/sudoers.d/aurion-production-schema-reconcile");
    expect(promoter).not.toMatch(/drizzle-kit\s+migrate/);
    expect(promoter).not.toMatch(/mysql\s+-|mariadb\s+-|psql\s+-/);
    expect(promoter).not.toContain("0021_aurion_global_world_state.sql");
  });

  it("fails promotion unless the installed reconciliation tree is byte-identical to the artifact", () => {
    for (const token of [
      'cmp -s "${schema_artifact}/manifest.json" "${schema_current}/manifest.json"',
      'cmp -s "${schema_artifact}/checksums.sha256" "${schema_current}/checksums.sha256"',
      'cmp -s "${schema_artifact}/deploy/aurion-production-schema-reconcile" /usr/local/sbin/aurion-production-schema-reconcile',
      'cmp -s "${schema_artifact}/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-reconcile-artifact.mjs',
    ]) expect(promoter).toContain(token);
    expect(workflow).toContain('cmp -s "$artifact/manifest.json" "$installed_root/manifest.json"');
    expect(workflow).toContain('cmp -s "$artifact/checksums.sha256" "$installed_root/checksums.sha256"');
  });
});
