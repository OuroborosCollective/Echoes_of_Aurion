#!/usr/bin/env python3
"""Bounded local Docker readback for an Aurion host. Never reads container env."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import subprocess

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
parser = argparse.ArgumentParser()
parser.add_argument("--app-container", default="echoes-of-aurion-aurion-1")
parser.add_argument("--db-container", default="echoes-of-aurion-mariadb-1")
args = parser.parse_args()
for value in (args.app_container, args.db_container):
    if not NAME_RE.fullmatch(value):
        raise SystemExit("invalid container name")


def inspect(name: str) -> dict:
    fmt = "{{json .}}"
    try:
        proc = subprocess.run(["docker", "inspect", "--format", fmt, name], capture_output=True, text=True, timeout=15)
    except FileNotFoundError:
        return {"name": name, "status": "UNVERIFIED", "errorClass": "DOCKER_CLI_ABSENT"}
    except subprocess.TimeoutExpired:
        return {"name": name, "status": "UNVERIFIED", "errorClass": "DOCKER_INSPECT_TIMEOUT"}
    if proc.returncode != 0:
        return {"name": name, "status": "UNVERIFIED", "errorClass": "DOCKER_INSPECT_FAILED", "stderrSha256": hashlib.sha256(proc.stderr.encode()).hexdigest()}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"name": name, "status": "UNVERIFIED", "errorClass": "DOCKER_INSPECT_JSON_INVALID"}
    state = data.get("State") or {}
    health = (state.get("Health") or {}).get("Status")
    running = state.get("Running") is True
    status = "IN_SYNC" if running and health in {None, "healthy"} else "OUT_OF_SYNC"
    networks = sorted(((data.get("NetworkSettings") or {}).get("Networks") or {}).keys())
    return {
        "name": name,
        "status": status,
        "running": running,
        "health": health,
        "imageId": data.get("Image"),
        "containerId": data.get("Id"),
        "networks": networks,
    }

items = [inspect(args.app_container), inspect(args.db_container)]
verdict = "OUT_OF_SYNC" if any(item["status"] == "OUT_OF_SYNC" for item in items) else ("UNVERIFIED" if any(item["status"] == "UNVERIFIED" for item in items) else "IN_SYNC")
print(json.dumps({
    "recordType": "aurion_local_docker_status",
    "schemaVersion": 1,
    "status": verdict,
    "containers": items,
    "environmentRead": False,
    "mutationPerformed": False,
    "productionGreenAsserted": False,
}, indent=2))
raise SystemExit(0 if verdict == "IN_SYNC" else 1)
