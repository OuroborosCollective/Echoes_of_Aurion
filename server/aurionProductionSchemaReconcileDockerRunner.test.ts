import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const verifier = path.join(root, "deploy/verify-aurion-production-schema-reconcile-artifact.mjs");
const testRevision = "a".repeat(40);

function digest(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function listFiles(directory: string, prefix = ""): string[] {
  return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return listFiles(directory, relative);
    return [relative];
  });
}

function refreshArtifactMetadata(directory: string) {
  const files = listFiles(directory)
    .filter(relative => relative !== "manifest.json" && relative !== "checksums.sha256")
    .sort();
  const manifest = {
    schemaVersion: 1,
    recordType: "aurion_production_schema_reconcile_artifact",
    revision: testRevision,
    nodeTarget: "node22",
    moduleFormat: "commonjs",
    mode: "read_only",
    files: Object.fromEntries(files.map(relative => {
      const absolute = path.join(directory, relative);
      return [relative, { bytes: fs.statSync(absolute).size, sha256: digest(absolute) }];
    })),
  };
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const checksumFiles = ["manifest.json", ...files].sort();
  fs.writeFileSync(
    path.join(directory, "checksums.sha256"),
    `${checksumFiles.map(relative => `${digest(path.join(directory, relative))}  ${relative}`).join("\n")}\n`,
  );
}

function makeArtifact() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-reconcile-artifact-"));
  const tags = [
    "0021_aurion_global_world_state",
    "0022_aurion_world_chunk_deltas",
    "0023_aurion_world_presence_epochs",
    "0024_aurion_world_epoch_reactions",
    "0025_aurion_loot_mastery_ethos",
    "0026_aurion_faction_questline_state",
    "0027_aurion_faction_questline_rewards",
  ];
  fs.mkdirSync(path.join(directory, "bin"), { recursive: true });
  fs.mkdirSync(path.join(directory, "drizzle"), { recursive: true });
  fs.mkdirSync(path.join(directory, "deploy"), { recursive: true });
  fs.writeFileSync(path.join(directory, "bin/reconcile.cjs"), "module.exports = {};\n");
  for (const tag of tags) fs.writeFileSync(path.join(directory, "drizzle", `${tag}.sql`), `-- ${tag}\n`);
  for (const name of [
    "aurion-production-schema-reconcile",
    "aurion-production-schema-reconcile.sudoers",
    "install-aurion-production-schema-reconcile",
  ]) fs.writeFileSync(path.join(directory, "deploy", name), `${name}\n`);
  fs.writeFileSync(path.join(directory, "deploy/aurion-reconcile-runtime-image.conf"), read("deploy/aurion-reconcile-runtime-image.conf"));
  fs.writeFileSync(path.join(directory, "deploy/aurion-reconcile-runtime-network.conf"), read("deploy/aurion-reconcile-runtime-network.conf"));
  fs.copyFileSync(verifier, path.join(directory, "deploy/verify-aurion-production-schema-reconcile-artifact.mjs"));
  refreshArtifactMetadata(directory);
  return directory;
}

function verifyArtifact(directory: string) {
  execFileSync(process.execPath, [verifier, directory, testRevision], { stdio: "pipe" });
}

describe("Aurion production schema reconcile Docker runner contract", () => {
  const runner = read("deploy/aurion-production-schema-reconcile");
  const imageContract = JSON.parse(read("deploy/aurion-reconcile-runtime-image.conf"));
  const networkContract = JSON.parse(read("deploy/aurion-reconcile-runtime-network.conf"));

  it("uses the revision-bound private MariaDB network instead of the public Traefik network", () => {
    expect(networkContract).toEqual({
      schemaVersion: 1,
      recordType: "aurion_reconcile_runtime_network_contract",
      network: "echoes-of-aurion-internal",
    });
    expect(runner).toContain("aurion-reconcile-runtime-network.conf");
    expect(runner).toContain('!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(c.network)');
    expect(runner).toContain('docker network inspect "$docker_network"');
    expect(runner).toContain('--network "$docker_network"');
    expect(runner).not.toContain("areloria_arelorian-network");
    expect(runner).toContain('"$docker_network" == "echoes-of-aurion-internal"');
  });

  it("executes the embedded network-contract parser against the immutable contract", () => {
    const parser = runner.match(/docker_network="\$\(node --input-type=module -e '([^']*)' "\$network_contract"\)"/);
    expect(parser?.[1]).toBeTruthy();
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", parser![1], path.join(root, "deploy/aurion-reconcile-runtime-network.conf")],
      { encoding: "utf8" },
    );
    expect(output).toBe("echoes-of-aurion-internal");
  });

  it("only runs an already-present digest-pinned Node 22 image", () => {
    expect(imageContract.schemaVersion).toBe(1);
    expect(imageContract.recordType).toBe("aurion_reconcile_runtime_image_contract");
    expect(imageContract.nodeMajorVersion).toBe(22);
    expect(imageContract.imageTag).toContain("node:22");
    expect(imageContract.imageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(runner).toContain('pinned_image="${image_tag}@${image_digest}"');
    expect(runner).toContain("docker image inspect");
    expect(runner).toContain('grep -Fq "@${image_digest}"');
    expect(runner).toContain("--pull=never");
    expect(runner).not.toMatch(/docker run[\s\S]*?\bnode:22\b(?![.@])/);
  });

  it("uses an ephemeral hardened Docker boundary with no Docker socket or public port", () => {
    for (const token of [
      "--rm",
      "--read-only",
      "--user 0:0",
      "--tmpfs /tmp",
      "--cap-drop ALL",
      "--security-opt no-new-privileges",
      "source=${release},destination=/reconcile,readonly",
      "source=${env_file},destination=/reconcile/.env.production,readonly",
    ]) {
      expect(runner).toContain(token);
    }
    expect(runner).not.toContain("--privileged");
    expect(runner).not.toContain("--network host");
    expect(runner).not.toContain("/var/run/docker.sock");
    expect(runner).not.toMatch(/(?:^|\s)-p\s/);
  });

  it("does not pass the database credential through Docker environment flags", () => {
    const dockerBlock = runner.match(/docker run[\s\S]*?node \/reconcile\/bin\/reconcile\.cjs/);
    expect(dockerBlock).toBeTruthy();
    expect(dockerBlock?.[0]).not.toContain("DATABASE_URL");
    expect(dockerBlock?.[0]).toContain("AURION_RECONCILIATION_ENV_FILE");
    expect(dockerBlock?.[0]).toContain("AURION_RECONCILIATION_ROOT");
    expect(dockerBlock?.[0]).toContain("AURION_RECONCILIATION_SOURCE_SHA");
    expect(runner).toContain("2>/dev/null");
  });

  it("requires the installed root runner to be byte-identical to the verified artifact", () => {
    expect(runner).toContain('installed_runner=/usr/local/sbin/aurion-production-schema-reconcile');
    expect(runner).toContain('installed_verifier=/usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-reconcile-artifact.mjs');
    expect(runner).toContain('node "$installed_verifier" "$release" "$expected_sha"');
    expect(runner).toContain("unset NODE_OPTIONS");
    expect(runner).toContain('cmp -s "${release}/deploy/aurion-production-schema-reconcile" "$installed_runner"');
    expect(runner).toContain('cmp -s "${release}/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" "$installed_verifier"');
  });

  it("validates installer options and stages a root-owned release before publication", () => {
    const installer = read("deploy/install-aurion-production-schema-reconcile");
    expect(installer.indexOf('case "$enable_runner" in')).toBeLessThan(installer.indexOf('install -d -o root -g root -m 0755 "${base}/releases"'));
    expect(installer).toContain('stage="$(mktemp -d "${base}/releases/.${expected_sha}.staging.XXXXXX")"');
    expect(installer).toContain('validate_release "$stage"');
    expect(installer).toContain('mv -T "$stage" "$release"');
    expect(installer).toContain('cmp -s "${artifact_dir}/checksums.sha256" "${release}/checksums.sha256"');
    expect(installer).toContain('verifier_dir=/usr/local/lib/echoes-of-aurion');
    expect(installer).toContain('install -o root -g root -m 0755 "${release}/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" "$verifier_next"');
  });

  it("accepts only a closed, revision-bound artifact file set", () => {
    const artifact = makeArtifact();
    try {
      expect(() => verifyArtifact(artifact)).not.toThrow();

      fs.writeFileSync(path.join(artifact, "unlisted-but-checksum-free.txt"), "unexpected\n");
      expect(() => verifyArtifact(artifact)).toThrow();
      fs.rmSync(path.join(artifact, "unlisted-but-checksum-free.txt"));

      fs.symlinkSync("reconcile.cjs", path.join(artifact, "bin/untrusted-link"));
      expect(() => verifyArtifact(artifact)).toThrow();
      fs.unlinkSync(path.join(artifact, "bin/untrusted-link"));

      fs.appendFileSync(path.join(artifact, "checksums.sha256"), `${digest(path.join(artifact, "manifest.json"))}  manifest.json\n`);
      expect(() => verifyArtifact(artifact)).toThrow();
      refreshArtifactMetadata(artifact);

      fs.renameSync(
        path.join(artifact, "drizzle/0023_aurion_world_presence_epochs.sql"),
        path.join(artifact, "drizzle/0023_untrusted_replacement.sql"),
      );
      refreshArtifactMetadata(artifact);
      expect(() => verifyArtifact(artifact)).toThrow();
    } finally {
      fs.rmSync(artifact, { recursive: true, force: true });
    }
  });

  it("rejects a recomputed manifest whose semantic release contract changed", () => {
    const artifact = makeArtifact();
    try {
      const manifestPath = path.join(artifact, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.nodeTarget = "node23";
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const checksumFiles = listFiles(artifact).filter(relative => relative !== "checksums.sha256").sort();
      fs.writeFileSync(
        path.join(artifact, "checksums.sha256"),
        `${checksumFiles.map(relative => `${digest(path.join(artifact, relative))}  ${relative}`).join("\n")}\n`,
      );
      expect(() => verifyArtifact(artifact)).toThrow();
    } finally {
      fs.rmSync(artifact, { recursive: true, force: true });
    }
  });

  it("writes a sanitized Docker execution receipt for both valid and failed container starts", () => {
    expect(runner).toContain('mode:"docker"');
    expect(runner).toContain('failureStage:"EXECUTE_DOCKER"');
    expect(runner).toContain("DOCKER_EXECUTION_FAILED");
    expect(runner).toContain("DOCKER_RECEIPT_INVALID");
    expect(runner).toContain('retryable:failureClass==="DOCKER_EXECUTION_FAILED"');
    expect(runner).toContain("databaseCredentialReturned:false");
    expect(runner).toContain("rootFilesystemReadOnly:true");
    expect(runner).toContain("releaseMountedReadOnly:true");
    expect(runner).toContain("environmentMountedReadOnly:true");
  });
});
