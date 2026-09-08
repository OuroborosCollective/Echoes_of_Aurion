#!/usr/bin/env python3
"""Build a byte-reproducible .skill only after manifest verification succeeds."""
from __future__ import annotations

import argparse
import hashlib
import json
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_NAME = "aurion-migration-ops.skill"
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def verify_manifest() -> dict:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "verify_manifest.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("manifest verifier did not return JSON") from exc
    if proc.returncode != 0 or result.get("status") != "IN_SYNC":
        raise RuntimeError(f"manifest verification failed: {result.get('errors', [])}")
    return result


def write_deterministic_zip(archive: Path, files: list[Path]) -> None:
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as handle:
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            data = path.read_bytes()
            mode = path.stat().st_mode & 0o777
            info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = ((stat.S_IFREG | mode) & 0xFFFF) << 16
            handle.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify and optionally write a deterministic Aurion skill archive")
    parser.add_argument("--output", type=Path, help="write the verified archive to this path")
    args = parser.parse_args()
    manifest_result = verify_manifest()
    with tempfile.TemporaryDirectory(prefix="aurion-skill-package-") as tmp:
        archive = Path(tmp) / ARCHIVE_NAME
        files = sorted(
            path for path in ROOT.rglob("*")
            if path.is_file() and not path.is_symlink() and "__pycache__" not in path.parts and path.suffix not in {".pyc", ".pyo"}
        )
        write_deterministic_zip(archive, files)
        expected_names = [path.relative_to(ROOT).as_posix() for path in files]
        with zipfile.ZipFile(archive) as handle:
            names = handle.namelist()
            if names != expected_names:
                raise RuntimeError("archive entries are not deterministic")
            if any("__pycache__" in name or name.endswith((".pyc", ".pyo")) for name in names):
                raise RuntimeError("generated Python cache included in archive")
            if any(info.date_time != FIXED_ZIP_TIME for info in handle.infolist()):
                raise RuntimeError("archive contains non-normalized timestamps")
            bad = handle.testzip()
            if bad:
                raise RuntimeError(f"zip integrity failed at {bad}")
        archive_bytes = archive.read_bytes()
        result = {
            "recordType": "aurion_migration_ops_package_check",
            "schemaVersion": 2,
            "status": "IN_SYNC",
            "archiveName": ARCHIVE_NAME,
            "fileCount": len(files),
            "archiveBytes": len(archive_bytes),
            "archiveSha256": hashlib.sha256(archive_bytes).hexdigest(),
            "generatedFilesExcluded": True,
            "manifestGate": "IN_SYNC",
            "manifestVerificationSha256": hashlib.sha256(json.dumps(manifest_result, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
            "timestampsNormalized": True,
            "zipIntegrity": "OK",
        }
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_bytes(archive_bytes)
            result["output"] = str(args.output)
        print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(json.dumps({"recordType": "aurion_migration_ops_package_check", "schemaVersion": 2, "status": "OUT_OF_SYNC", "error": str(exc)}, indent=2))
        raise SystemExit(1)
