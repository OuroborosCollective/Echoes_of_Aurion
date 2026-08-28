import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion production schema readback chain", () => {
  const readback = read(".github/workflows/aurion-production-schema-readback.yml");

  it("starts from a successful main zone promotion and binds its exact head sha", () => {
    expect(readback).toContain('workflows: ["Deploy Aurion zone runtime"]');
    expect(readback).toContain("types: [completed]");
    expect(readback).toContain(
      "TARGET_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}",
    );
    expect(readback).toContain("ref: ${{ env.TARGET_SHA }}");
    expect(readback).toContain('event.workflow_run?.head_branch!=="main"');
    expect(readback).toContain(
      'event.workflow_run?.head_sha!==process.env.TARGET_SHA',
    );
  });

  it("allows production access only after the successful deploy event or explicit main dispatch", () => {
    expect(readback).toContain("github.event_name == 'workflow_run'");
    expect(readback).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(readback).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(readback).toContain("github.event_name == 'workflow_dispatch'");
    expect(readback).not.toContain("github.event_name != 'pull_request'");
  });

  it("keeps artifact, installed runner and receipt on the same revision without apply", () => {
    expect(readback).toContain("AURION_RELEASE_SHA: ${{ env.TARGET_SHA }}");
    expect(readback).toContain(
      "aurion-production-reconcile-${{ env.TARGET_SHA }}",
    );
    expect(readback).toContain(
      "aurion-production-schema-readback-${{ env.TARGET_SHA }}",
    );
    expect(readback).toContain(
      'sudo -n "$runner" "$EXPECTED_SHA"',
    );
    expect(readback).not.toContain("drizzle-kit migrate");
    expect(readback).not.toContain("postgres_migration_apply");
  });
});
