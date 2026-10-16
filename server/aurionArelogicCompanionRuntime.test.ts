import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
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

  it("clears the retired Redis URL while retaining the durable companion volume", () => {
    expect(compose).toMatch(/^\s+REDIS_URL: ""$/m);
    expect(compose).toContain("- ${AURION_ENV_FILE:");
    expect(compose).toContain("name: echoes-of-aurion-companion-memory");
  });

  it("runs the real pre-promotion volume guard and rejects unsafe existing mounts", () => {
    const start = "# companion-memory-preflight-start";
    const end = "# companion-memory-preflight-end";
    const guard = promoter.split(start)[1]?.split(end)[0];
    expect(guard).toBeTruthy();
    expect(promoter.indexOf(start)).toBeLessThan(promoter.indexOf("phase=compose-promotion"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-volume-preflight-"));
    try {
      const docker = path.join(dir, "docker");
      fs.writeFileSync(docker, `#!${process.execPath}
const args=process.argv.slice(2);
if(args[0]==="ps") { console.log("a".repeat(64)); process.exit(0); }
if(args[0]==="volume"&&args[1]==="inspect") process.exit(0);
if(args[0]==="inspect"&&args[1]==="--format") {
  if(args[2].includes("com.docker.compose.project")) console.log("echoes-of-aurion");
  else if(args[2].includes("com.docker.compose.service")) console.log("aurion");
  else if(args[2]==="{{json .Mounts}}") console.log(process.env.TEST_COMPANION_MOUNTS);
  else process.exit(64);
  process.exit(0);
}
process.exit(64);
`, { mode: 0o700 });
      const valid = { Type: "volume", Name: "echoes-of-aurion-companion-memory", Destination: "/var/lib/aurion/companion-memory", RW: true };
      const check = (mounts: unknown) => spawnSync("bash", ["-c", `set -euo pipefail\n${guard}`], {
        encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_COMPANION_MOUNTS: JSON.stringify(mounts) },
      });
      expect(check([valid]).status).toBe(0);
      for (const mounts of [[], [valid, valid], [{ ...valid, RW: false }], [{ ...valid, Name: "different-volume" }], [{ ...valid, Type: "bind" }]]) {
        expect(check(mounts).status).not.toBe(0);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
