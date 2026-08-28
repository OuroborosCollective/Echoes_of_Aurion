#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
workflow = root / ".github/workflows/aurion-production-schema-readback.yml"
test_file = root / "server/aurionProductionReadbackChain.test.ts"

workflow_source = workflow.read_text(encoding="utf-8")
old = "      EXPECTED_SHA: ${{ env.TARGET_SHA }}"
new = "      EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}"
if workflow_source.count(old) != 1:
    raise SystemExit(f"expected one invalid job env reference, found {workflow_source.count(old)}")
workflow.write_text(workflow_source.replace(old, new, 1), encoding="utf-8")

test_source = test_file.read_text(encoding="utf-8")
anchor = '''    expect(readback).toContain(
      'sudo -n "$runner" "$EXPECTED_SHA"',
    );
'''
replacement = '''    expect(readback).toContain(
      'sudo -n "$runner" "$EXPECTED_SHA"',
    );
    expect(readback).toContain(
      "EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}",
    );
    expect(readback).not.toContain("EXPECTED_SHA: ${{ env.TARGET_SHA }}");
'''
if test_source.count(anchor) != 1:
    raise SystemExit(f"expected one test anchor, found {test_source.count(anchor)}")
test_file.write_text(test_source.replace(anchor, replacement, 1), encoding="utf-8")

(root / ".github/workflows/apply-readback-target-context-fix.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
