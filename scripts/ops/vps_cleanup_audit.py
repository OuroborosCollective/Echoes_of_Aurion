#!/usr/bin/env python3
"""Read-only, bounded VPS storage audit for Aurion/Sovereign maintenance.

No delete, prune, restart, or shell execution path exists here. Changes to the
VPS require the approved state-bound host command queue. This diagnostic is
intended for the existing protected self-hosted Aurion runner.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Callable

SCHEMA = "ouroboros.vps-storage-inventory.v1"
CHECK_DIRS = (
    "/var/lib/docker",
    "/var/log",
    "/var/cache",
    "/opt",
    "/home",
    "/tmp",
)
PROTECTED = (
    "Aurion production databases and named volumes",
    "Sovereign Studio runtime and MCP control plane",
    "all running/stopped containers and their referenced images",
    "all named Docker volumes, including MariaDB and authentication",
    "GitHub Actions self-hosted runner and immutable rollback images",
)
RESULT_MAX_BYTES = 64_000
Run = Callable[[list[str], int], tuple[int, str]]


def bounded_run(argv: list[str], timeout: int = 15) -> tuple[int, str]:
    """No shell, environment expansion, or unbounded process output."""
    if any(not isinstance(arg, str) or not arg for arg in argv):
        return (126, "")
    try:
        result = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env={"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return (124, "")
    output = result.stdout[:RESULT_MAX_BYTES]
    if len(result.stdout) > RESULT_MAX_BYTES:
        return (125, "")
    return (result.returncode, output)


def get_disk() -> dict[str, int]:
    s = os.statvfs("/")
    block = s.f_frsize
    total = s.f_blocks * block
    available = s.f_bavail * block
    used = total - s.f_bfree * block
    return {"totalBytes": total, "usedBytes": used,
            "availableBytes": available,
            "usedPpm": round(1_000_000 * used / total) if total else 0}


def directory_sizes(run: Run) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for item in CHECK_DIRS:
        target = Path(item)
        if not target.exists() or target.is_symlink() or not target.is_dir():
            records.append({"path": item, "present": False, "bytes": None})
            continue
        # Only first-level directory metadata: no file names, no symlink traversal.
        status, out = run(["du", "-x", "--max-depth=1", "-B1", "--", item], 45)
        by_path: dict[str, int] = {}
        valid = status == 0
        for line in out.splitlines():
            match = re.fullmatch(r"([0-9]+)\t([^\t\n]+)", line)
            if match is None or not (match.group(2) == item or match.group(2).startswith(item + "/")):
                valid = False
                break
            by_path[match.group(2)] = int(match.group(1))
        if not valid or item not in by_path or len(by_path) > 2048:
            errors.append("DIRECTORY_USAGE_UNAVAILABLE:" + item)
            records.append({"path": item, "present": True, "bytes": None, "largestChildren": []})
            continue
        children = [
            {"path": child, "bytes": size}
            for child, size in by_path.items()
            if child != item and child.count("/") == item.count("/") + 1
        ]
        children.sort(key=lambda row: (-row["bytes"], row["path"]))
        records.append({"path": item, "present": True, "bytes": by_path[item], "largestChildren": children[:12]})
    return sorted(records, key=lambda x: x["bytes"] or 0, reverse=True), errors


def docker_inventory(run: Run) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    status, out = run(["docker", "ps", "-a", "--format", "{{json .}}"], 20)
    containers: list[dict[str, Any]] = []
    if status == 0:
        for line in out.splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                errors.append("CONTAINER_INVENTORY_INVALID")
                containers = []
                break
            if not isinstance(item, dict):
                errors.append("CONTAINER_INVENTORY_INVALID")
                containers = []
                break
            containers.append(item)
    else:
        errors.append("CONTAINER_INVENTORY_UNAVAILABLE")
    state_counts: dict[str, int] = {}
    retired_candidates = 0
    for item in containers:
        state = str(item.get("State", "unknown")).lower()
        state_counts[state] = state_counts.get(state, 0) + 1
        name = str(item.get("Names", "")).lower()
        if state != "running" and ("n8n" in name or "filebrowser" in name):
            retired_candidates += 1
    st_vol, vol_out = run(["docker", "volume", "ls", "-q"], 20)
    if st_vol:
        errors.append("VOLUME_INVENTORY_UNAVAILABLE")
    st_img, img_out = run(["docker", "image", "ls", "-q", "--no-trunc"], 20)
    if st_img:
        errors.append("IMAGE_INVENTORY_UNAVAILABLE")
    st_df, df_out = run(["docker", "system", "df"], 20)
    if st_df:
        errors.append("DOCKER_DF_UNAVAILABLE")
    return ({
        "containerStates": state_counts,
        "containerCount": len(containers) if status == 0 else None,
        "protectedVolumeCount": len(set(vol_out.splitlines())) if st_vol == 0 else None,
        "imageCount": len(set(img_out.splitlines())) if st_img == 0 else None,
        "retiredStoppedContainerReviewCount": retired_candidates,
        "dockerDfOutputSha256": hashlib.sha256(df_out.encode()).hexdigest() if st_df == 0 else None,
    }, errors)


def service_inventory(run: Run) -> dict[str, str]:
    services = (
        "sovereign-chatgpt-broker.service",
        "sovereign-chatgpt-command-worker.service",
        "sovereign-toolchain-n8n-evidence.service",
        "actions.runner.OuroborosCollective-Echoes_of_Aurion.aurion-static-deployer.service",
    )
    ret: dict[str, str] = {}
    for unit in services:
        _, out = run(["systemctl", "is-active", unit], 8)
        state = out.strip()
        ret[unit] = state if state in {"active", "inactive", "failed", "activating", "deactivating"} else "unverified"
    return ret


def collect(run: Run = bounded_run) -> dict[str, Any]:
    dirs, dir_errors = directory_sizes(run)
    docker, docker_errors = docker_inventory(run)
    return {
        "schemaVersion": SCHEMA,
        "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "disk": get_disk(),
        "directoryUsage": dirs,
        "docker": docker,
        "services": service_inventory(run),
        "errors": dir_errors + docker_errors,
        "protected": list(PROTECTED),
        "deletionCandidates": [],
        "mutationPerformed": False,
        "deleteCapability": False,
        "secretValuesReturned": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit one bounded JSON report (default)")
    parser.parse_args()
    report = collect()
    print(json.dumps(report, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    return 0 if not report["errors"] else 2


if __name__ == "__main__":
    sys.exit(main())
