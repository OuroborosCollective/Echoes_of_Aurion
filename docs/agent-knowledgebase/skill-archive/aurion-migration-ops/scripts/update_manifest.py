#!/usr/bin/env python3
"""Rebuild manifest.json; this mutates expectations and therefore never self-asserts IN_SYNC."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
EXCLUDED = {"manifest.json"}


def main() -> None:
    files = {}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.is_symlink() or path.name in EXCLUDED or "__pycache__" in path.parts or path.suffix in {".pyc", ".pyo"}:
            continue
        data = path.read_bytes()
        files[path.relative_to(ROOT).as_posix()] = {
            "bytes": len(data),
            "mode": format(path.stat().st_mode & 0o777, "04o"),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    manifest = {
        "directSshSqlApplyEnabled": False,
        "files": files,
        "guardSchemaVersion": 4,
        "productionMutationPath": "canonical-aurion-control-plane-only",
        "autonomyMode": "AUTONOMOUS_UNTIL_REVOKED",
        "requiresPerActionOwnerPrompt": False,
        "recordType": "aurion_migration_ops_skill_manifest",
        "schemaVersion": 2,
        "skillVersion": "2.1.0",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "MANIFEST_UPDATED_PENDING_VERIFICATION",
        "payloadFiles": len(files),
        "manifest": str(MANIFEST),
        "nextAction": "RUN_VERIFY_MANIFEST_IN_SEPARATE_PROCESS",
    }, indent=2))


if __name__ == "__main__":
    main()
