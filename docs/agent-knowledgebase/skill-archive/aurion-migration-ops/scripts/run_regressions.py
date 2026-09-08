#!/usr/bin/env python3
"""Run guard regressions, manifest verification, and emit a machine-readable receipt."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = os.environ.copy()
env["PYTHONDONTWRITEBYTECODE"] = "1"

def file_hashes(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()

test_files = [*(path for path in root.glob("tests/**/*") if path.is_file()), *(path for path in root.glob("scripts/*") if path.is_file())]
test_definition_sha256 = file_hashes(test_files)
proc = subprocess.run(
    [sys.executable, "-m", "unittest", "discover", "-s", str(root / "tests"), "-v"],
    cwd=root,
    env=env,
    capture_output=True,
    text=True,
    timeout=120,
)
manifest_proc = subprocess.run(
    [sys.executable, str(root / "scripts" / "verify_manifest.py")],
    cwd=root,
    env=env,
    capture_output=True,
    text=True,
    timeout=30,
)
combined = (proc.stdout + proc.stderr).encode()
case_count = sum(
    1 for line in (proc.stdout + proc.stderr).splitlines()
    if " ... " in line and (line.endswith("ok") or line.endswith("FAIL") or line.endswith("ERROR"))
)
status_ok = proc.returncode == 0 and manifest_proc.returncode == 0
receipt = {
    "recordType": "aurion_migration_ops_regression_receipt",
    "schemaVersion": 2,
    "status": "IN_SYNC" if status_ok else "OUT_OF_SYNC",
    "exitCode": proc.returncode,
    "manifestVerificationExitCode": manifest_proc.returncode,
    "testCaseCount": case_count,
    "outputSha256": hashlib.sha256(combined).hexdigest(),
    "outputBytes": len(combined),
    "testDefinitionSha256": test_definition_sha256,
    "runnerPython": sys.version.split()[0],
    "mockProductionEvidenceUsed": False,
    "productionTruthAsserted": False,
    "mutationPerformed": False,
}
print(json.dumps(receipt, indent=2))
raise SystemExit(0 if status_ok else (proc.returncode or manifest_proc.returncode or 1))
