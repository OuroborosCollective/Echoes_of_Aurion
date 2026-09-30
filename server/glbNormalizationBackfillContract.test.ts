import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBackfillArgs } from "../scripts/backfill-glb-normalization";

describe("GLB normalization backfill utility", () => {
  it("defaults to a read-only audit with the observed bounded repair count", () => {
    expect(parseBackfillArgs([])).toEqual({
      mode: "audit",
      expectedMissingCount: 86,
    });
  });

  it("requires an explicit, non-negative expected count", () => {
    expect(
      parseBackfillArgs([
        "--mode",
        "apply",
        "--expected-missing-count",
        "86",
      ]),
    ).toEqual({
      mode: "apply",
      expectedMissingCount: 86,
    });
    expect(() =>
      parseBackfillArgs(["--expected-missing-count", "-1"]),
    ).toThrow("GLB_NORMALIZATION_BACKFILL_COUNT_INVALID");
  });

  it("keeps the production workflow explicitly gated and volume-bound", () => {
    const workflow = readFileSync(
      ".github/workflows/aurion-glb-normalization-backfill.yml",
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("aurion-static");
    expect(workflow).toContain("AURION_GLB_STORAGE_DIR=/var/lib/aurion/glb");
    expect(workflow).toContain(
      "echoes-of-aurion-glb-assets:/var/lib/aurion/glb",
    );
    expect(workflow).toContain("--mode audit");
    expect(workflow).toContain("--mode apply");
    expect(workflow).toContain("if: ${{ inputs.mode == 'apply' }}");
  });
});
