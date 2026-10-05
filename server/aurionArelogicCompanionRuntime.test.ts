import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("ARE-rLOGIC companion production bridge", () => {
  const compose = read("docker-compose.traefik.yml");
  const dockerfile = read("Dockerfile");
  const promoter = read("deploy/promote-aurion-zone-runtime.sh");
  const helper = read("deploy/aurion-arelogic-companion-export");
  const exporter = read("scripts/export-arelogic-companion-memory.mjs");
  const runner = read(".github/workflows/arelogic-companion-offline-runner.yml");
  const artifactBuilder = read("scripts/build-aurion-traefik-runtime-artifact.mjs");

  it("persists server-side companion demonstrations outside the container layer", () => {
    expect(compose).toContain("COMPANION_MEMORY_DIR: /var/lib/aurion/companion-memory");
    expect(compose).toContain("aurion-companion-memory:/var/lib/aurion/companion-memory");
    expect(compose).toContain("name: echoes-of-aurion-companion-memory");
    expect(dockerfile).toContain("/var/lib/aurion/companion-memory");
    expect(promoter).toContain("docker volume inspect echoes-of-aurion-companion-memory");
    expect(promoter).toContain('eq .Destination "/var/lib/aurion/companion-memory"');
  });

  it("keeps raw memory behind a fixed root sanitizer", () => {
    expect(helper).toContain("volume_name=echoes-of-aurion-companion-memory");
    expect(helper).toContain("target_base=/var/lib/aurion-arelogic-export");
    expect(helper).toContain("/usr/bin/node \"$exporter\"");
    expect(helper).toContain("--input \"$mountpoint\"");
    expect(helper).toContain("chown root:aurion-deploy");
    expect(helper).toContain("chmod 0640");
    expect(promoter).toContain("/usr/local/sbin/aurion-arelogic-companion-export");
    expect(promoter).toContain("NOPASSWD: /usr/local/sbin/aurion-arelogic-companion-export");
    expect(runner).toContain("sudo -n /usr/local/sbin/aurion-arelogic-companion-export");
    expect(runner).not.toContain("docker volume inspect");
  });

  it("exports only pseudonymous bounded research rows", () => {
    expect(exporter).toContain("aurion.rl.demonstration.v1");
    expect(exporter).toContain('account_identifier: "omitted"');
    expect(exporter).toContain('timestamp: "omitted"');
    expect(exporter).toContain('note: "omitted"');
    expect(exporter).toContain('captured_frame: "not_present_in_server_memory"');
    expect(runner).toContain("ARE_RLOGIC_REVISION: eb6497fb2598c3159cbc4a67bfd97ad6d9c98ce1");
    expect(runner).toContain("workflow_call:");
    expect(runner).toContain("inputs.source_sha != ''");
    expect(runner).not.toContain("workflow_run:");
  });

  it("calls ARE-rLOGIC only after the trusted final production gate", () => {
    const deployWorkflow = read(".github/workflows/deploy-aurion-zone-runtime.yml");
    expect(deployWorkflow).toContain("needs: [final-production-gate]");
    expect(deployWorkflow).toContain("uses: ./.github/workflows/arelogic-companion-offline-runner.yml");
  });

  it("seals the sanitizer and helper into the immutable runtime artifact", () => {
    expect(artifactBuilder).toContain('"deploy/aurion-arelogic-companion-export"');
    expect(artifactBuilder).toContain('"scripts/export-arelogic-companion-memory.mjs"');
    expect(promoter).toContain('"deploy/aurion-arelogic-companion-export"');
    expect(promoter).toContain('"scripts/export-arelogic-companion-memory.mjs"');
  });
});
