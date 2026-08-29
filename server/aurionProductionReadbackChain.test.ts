import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion post-deploy production schema readback", () => {
  const readback = read(".github/workflows/aurion-production-schema-readback.yml");
  const runner = read("deploy/aurion-production-schema-reconcile");
  const networkContract = JSON.parse(read("deploy/aurion-reconcile-runtime-network.conf"));

  it("accepts only a main deploy caller with an explicit immutable artifact identity", () => {
    expect(readback).toContain("workflow_call:");
    expect(readback).toContain("expected_sha:");
    expect(readback).toContain("upstream_run_id:");
    expect(readback).toContain('test "${GITHUB_REF}" = "refs/heads/main"');
    expect(readback).toContain('test "${GITHUB_SHA}" = "${EXPECTED_SHA}"');
    expect(readback).toContain('test "${GITHUB_RUN_ID}" = "${UPSTREAM_RUN_ID}"');
    expect(readback).not.toContain("workflow_run:");
    expect(readback).not.toContain("pull_request:");
    expect(readback).not.toContain("workflow_dispatch:");
  });

  it("binds the job environment directly to the upstream deployment identity", () => {
    expect(readback).toContain(
      "EXPECTED_SHA: ${{ inputs.expected_sha }}",
    );
    expect(readback).toContain(
      "UPSTREAM_RUN_ID: ${{ inputs.upstream_run_id }}",
    );
    expect(readback).not.toContain("EXPECTED_SHA: ${{ env.TARGET_SHA }}");
    expect(readback).not.toContain("TARGET_SHA:");
  });

  it("downloads and verifies the exact immutable artifact from the successful upstream run", () => {
    expect(readback).toContain("actions: read");
    expect(readback).toContain(
      "name: aurion-zone-runtime-${{ inputs.expected_sha }}",
    );
    expect(readback).toContain(
      "run-id: ${{ inputs.upstream_run_id }}",
    );
    expect(readback).toContain("github-token: ${{ github.token }}");
    expect(readback).toContain(
      'artifact="${GITHUB_WORKSPACE}/deployment-artifact/dist-production-reconcile"',
    );
    expect(readback).toContain('test -f "$artifact/checksums.sha256"');
    expect(readback).toContain(
      '(cd "$artifact" && sha256sum --strict -c checksums.sha256)',
    );
  });

  it("requires artifact, installed runner and receipt to share one revision without apply", () => {
    expect(readback).toContain(
      'installed_root="/opt/echoes-of-aurion-schema-reconcile/current"',
    );
    expect(readback).toContain('installed="${installed_root}/manifest.json"');
    expect(readback).toContain(
      "/usr/local/sbin/aurion-production-schema-reconcile",
    );
    expect(readback).toContain('cmp -s "$artifact/manifest.json" "$installed_root/manifest.json"');
    expect(readback).toContain('cmp -s "$artifact/checksums.sha256" "$installed_root/checksums.sha256"');
    expect(readback).toContain('cmp -s "$artifact/deploy/aurion-production-schema-reconcile" "$runner"');
    expect(readback).toContain('cmp -s "$artifact/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" "$verifier"');
    expect(readback).toContain('sudo -n "$runner" "$EXPECTED_SHA"');
    expect(readback).toContain(
      "aurion-production-schema-readback-${{ inputs.expected_sha }}",
    );
    expect(readback).not.toContain("actions/checkout");
    expect(readback).not.toContain("pnpm install");
    expect(readback).not.toContain("drizzle-kit migrate");
    expect(readback).not.toContain("postgres_migration_apply");
  });

  it("uses the sanitized fixed-runner receipt without broadening sudo", () => {
    expect(readback).toContain(
      "The fixed root runner persists a private root-owned receipt"
    );
    expect(readback).toContain('sudo -n "$runner" "$EXPECTED_SHA"');
    expect(readback).not.toContain("sudo stat");
    expect(readback).not.toContain("sudo cmp");
    expect(readback).not.toContain("sudo readlink");
    expect(readback).toContain("cleanup_transient_readback()");
    expect(readback).toContain("production-schema-readback.json");
    expect(readback).not.toContain("production-schema-readback.raw.json\n");
  });

  it("runs the reconciler in a Docker container on the private MariaDB network with hardened flags", () => {
    expect(networkContract.network).toBe("echoes-of-aurion-internal");
    expect(runner).toContain("aurion-reconcile-runtime-network.conf");
    expect(runner).toContain('docker network inspect "$docker_network"');
    expect(runner).toContain("--network");
    expect(runner).toContain('--network "$docker_network"');
    expect(runner).not.toContain("areloria_arelorian-network");
    expect(runner).toContain("--rm");
    expect(runner).toContain("--read-only");
    expect(runner).toContain("--user 0:0");
    expect(runner).toContain("--cap-drop ALL");
    expect(runner).toContain("--security-opt no-new-privileges");
    expect(runner).toContain("--tmpfs /tmp");
  });

  it("uses a digest-pinned image contract instead of an unbound node:22 tag", () => {
    expect(runner).toContain("aurion-reconcile-runtime-image.conf");
    expect(runner).toContain("pinned_image");
    expect(runner).toContain("image_digest");
    expect(runner).toContain("--pull=never");
    expect(runner).not.toMatch(/docker run[\s\S]*?\bnode:22\b[^.]/);
  });

  it("validates the runtime image identity before container execution", () => {
    expect(runner).toContain("docker image inspect");
    expect(runner).toContain("pinned runtime image has an invalid local image identity");
    expect(runner).not.toContain("RepoDigests");
  });

  it("binds the persisted receipt to the actual Docker execution contract", () => {
    expect(readback).toContain("EXPECTED_DOCKER_NETWORK");
    expect(readback).toContain("EXPECTED_IMAGE_DIGEST");
    expect(readback).toContain('execution?.mode!=="docker"');
    expect(readback).toContain("Docker execution receipt mismatch");
  });

  it("bind-mounts the release and environment as read-only and suppresses stderr", () => {
    expect(runner).toMatch(/--mount.*type=bind.*readonly/);
    expect(runner).toContain("2>/dev/null");
  });
});
