#!/usr/bin/env python3
"""Verify the skill manifest against payload bytes, modes and generated-file policy."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "manifest.json"
FORBIDDEN_SUFFIXES = {".pyc", ".pyo"}
FORBIDDEN_DIRS = {"__pycache__"}


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    listed = set(manifest.get("files", {}))
    errors: list[str] = []
    for name, expected in manifest.get("files", {}).items():
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            errors.append(f"missing-or-nonregular:{name}")
            continue
        data = path.read_bytes()
        if len(data) != expected["bytes"]:
            errors.append(f"bytes:{name}:{len(data)}!={expected['bytes']}")
        observed = hashlib.sha256(data).hexdigest()
        if observed != expected["sha256"]:
            errors.append(f"sha256:{name}:{observed}!={expected['sha256']}")
        observed_mode = format(path.stat().st_mode & 0o777, "04o")
        expected_mode = expected.get("mode")
        if expected_mode is not None and observed_mode != expected_mode:
            errors.append(f"mode:{name}:{observed_mode}!={expected_mode}")
    actual = set()
    for path in ROOT.rglob("*"):
        if not path.is_file() or path == MANIFEST_PATH:
            continue
        relative = path.relative_to(ROOT)
        if any(part in FORBIDDEN_DIRS for part in relative.parts) or path.suffix in FORBIDDEN_SUFFIXES:
            errors.append(f"generated-file:{relative}")
            continue
        if path.is_symlink():
            errors.append(f"symlink:{relative}")
            continue
        actual.add(relative.as_posix())
    for name in sorted(actual - listed):
        errors.append(f"unlisted:{name}")
    for name in sorted(listed - actual):
        errors.append(f"manifest-payload-mismatch:{name}")
    result = {
        "recordType": "aurion_migration_ops_manifest_verification",
        "schemaVersion": 2,
        "status": "IN_SYNC" if not errors else "OUT_OF_SYNC",
        "manifestFiles": len(listed),
        "payloadFiles": len(actual),
        "modesVerified": True,
        "symlinksAllowed": False,
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
