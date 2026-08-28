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
  });

  it("uses only the existing allowlisted root promoter on the production runner", () => {
    const invocations = workflow.match(
      /sudo \/usr\/local\/sbin\/promote-aurion-zone-runtime/g,
    );
    expect(invocations?.length).toBe(2);
    expect(workflow).not.toContain("sudo bash deploy/install-aurion-production-schema-reconcile");
    expect(workflow).not.toContain("drizzle-kit migrate");
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
});
