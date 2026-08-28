import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion post-deploy production schema readback", () => {
  const readback = read(".github/workflows/aurion-production-schema-readback.yml");

  it("accepts only a successful main zone deployment event", () => {
    expect(readback).toContain('workflows: ["Deploy Aurion zone runtime"]');
    expect(readback).toContain("types: [completed]");
    expect(readback).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(readback).toContain(
      "github.event.workflow_run.head_branch == 'main'",
    );
    expect(readback).not.toContain("pull_request:");
    expect(readback).not.toContain("workflow_dispatch:");
  });

  it("binds the job environment directly to the upstream deployment identity", () => {
    expect(readback).toContain(
      "EXPECTED_SHA: ${{ github.event.workflow_run.head_sha }}",
    );
    expect(readback).toContain(
      "UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}",
    );
    expect(readback).not.toContain("EXPECTED_SHA: ${{ env.TARGET_SHA }}");
    expect(readback).not.toContain("TARGET_SHA:");
  });

  it("downloads the exact immutable artifact from the successful upstream run", () => {
    expect(readback).toContain("actions: read");
    expect(readback).toContain(
      "name: aurion-zone-runtime-${{ github.event.workflow_run.head_sha }}",
    );
    expect(readback).toContain(
      "run-id: ${{ github.event.workflow_run.id }}",
    );
    expect(readback).toContain("github-token: ${{ github.token }}");
    expect(readback).toContain("dist-production-reconcile/checksums.sha256");
  });

  it("requires artifact, installed runner and receipt to share one revision without apply", () => {
    expect(readback).toContain(
      "/opt/echoes-of-aurion-schema-reconcile/current/manifest.json",
    );
    expect(readback).toContain(
      "/usr/local/sbin/aurion-production-schema-reconcile",
    );
    expect(readback).toContain('sudo -n "$runner" "$EXPECTED_SHA"');
    expect(readback).toContain(
      "aurion-production-schema-readback-${{ github.event.workflow_run.head_sha }}",
    );
    expect(readback).not.toContain("actions/checkout");
    expect(readback).not.toContain("pnpm install");
    expect(readback).not.toContain("drizzle-kit migrate");
    expect(readback).not.toContain("postgres_migration_apply");
  });
});
