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
    expect(workflow).toContain('run audit "${EXPECTED_MISSING_COUNT}"');
    expect(workflow).toContain('run apply "${EXPECTED_MISSING_COUNT}"');
    expect(workflow).toContain("run readback 0");
    expect(workflow).not.toContain("run --mode");

    const wrapper = readFileSync(
      "deploy/aurion-glb-normalization-backfill",
      "utf8",
    );
    expect(wrapper).toContain('(($# == 2)) || fail "GLB_BACKFILL_ARGUMENTS"');
    expect(wrapper).toContain('mode="$1"');
    expect(wrapper).toContain('expected="$2"');
    expect(workflow).toContain("if: ${{ inputs.mode == 'apply' }}");
  });
});
