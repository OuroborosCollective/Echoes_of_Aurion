#!/usr/bin/env python3
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REPOSITORY = os.getenv("AURION_RECONCILER_REPOSITORY", "OuroborosCollective/Echoes_of_Aurion")
WORKFLOW = os.getenv("AURION_RECONCILER_WORKFLOW", "deploy-aurion-zone-runtime.yml")
BRANCH = os.getenv("AURION_RECONCILER_BRANCH", "main")
HEALTH_URL = os.getenv("AURION_RECONCILER_HEALTH_URL", "https://arelogic.space/healthz")
STATE_DIR = Path(os.getenv("AURION_RECONCILER_STATE_DIR", "/var/lib/aurion-revision-alignment"))
TOKEN_FILE = Path(os.getenv("AURION_RECONCILER_TOKEN_FILE", "/etc/aurion-revision-alignment/github.token"))
POLL_SECONDS = int(os.getenv("AURION_RECONCILER_POLL_SECONDS", "10"))
POLL_ATTEMPTS = int(os.getenv("AURION_RECONCILER_POLL_ATTEMPTS", "180"))

class ControllerError(RuntimeError):
    def __init__(self, stage: str, detail: str):
        self.stage = stage
        self.detail = detail[:500]
        super().__init__(self.detail)

def canonical_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def status(payload: dict, ok: bool) -> int:
    STATE_DIR.mkdir(mode=0o750, parents=True, exist_ok=True)
    body = {
        "schemaVersion": "aurion.revision-alignment-status.v1",
        "ok": ok,
        "updatedAtEpoch": int(time.time()),
        "secretValuesReturned": False,
        **payload,
    }
    body["evidenceSha256"] = canonical_hash(body)
    tmp = STATE_DIR / "status.json.tmp"
    tmp.write_text(json.dumps(body, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o640)
    tmp.replace(STATE_DIR / "status.json")
    print(json.dumps(body, sort_keys=True, separators=(",", ":")))
    return 0 if ok else 1

def token() -> str:
    try:
        st = TOKEN_FILE.stat()
    except OSError as exc:
        raise ControllerError("github_auth", "token file unavailable") from exc
    if not TOKEN_FILE.is_file() or st.st_uid != 0 or (st.st_mode & 0o777) != 0o600 or st.st_size < 20 or st.st_size > 4096:
        raise ControllerError("github_auth", "token file metadata invalid")
    value = TOKEN_FILE.read_text(encoding="utf-8").strip()
    if not value or "\n" in value or "\r" in value:
        raise ControllerError("github_auth", "token value invalid")
    return value

def github(path: str, method: str = "GET", body: object | None = None) -> object:
    request = urllib.request.Request(
        "https://api.github.com" + path,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + token(),
            "User-Agent": "aurion-revision-alignment-controller",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        data=None if body is None else json.dumps(body).encode(),
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raise ControllerError("github_api", f"HTTP_{exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ControllerError("github_api", type(exc).__name__) from exc

def main_sha() -> str:
    data = github(f"/repos/{REPOSITORY}/git/ref/heads/{urllib.parse.quote(BRANCH, safe='')}")
    sha = str((data.get("object") or {}).get("sha") or "").lower() if isinstance(data, dict) else ""
    if not SHA_RE.fullmatch(sha):
        raise ControllerError("main_revision", "GitHub main revision invalid")
    return sha

def health() -> dict:
    request = urllib.request.Request(HEALTH_URL, headers={"Accept": "application/json", "User-Agent": "aurion-revision-alignment-controller"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read())
    except Exception as exc:
        return {"reachable": False, "category": type(exc).__name__}
    if not isinstance(data, dict):
        return {"reachable": False, "category": "invalid_json"}
    return {
        "reachable": True,
        "status": str(data.get("status") or ""),
        "service": str(data.get("service") or ""),
        "revision": str(data.get("revision") or "").lower(),
    }

def exact_release_run(sha: str) -> dict | None:
    workflow = urllib.parse.quote(WORKFLOW, safe="")
    data = github(f"/repos/{REPOSITORY}/actions/workflows/{workflow}/runs?branch={urllib.parse.quote(BRANCH)}&per_page=50")
    runs = data.get("workflow_runs", []) if isinstance(data, dict) else []
    exact = [r for r in runs if isinstance(r, dict) and str(r.get("head_sha") or "").lower() == sha and r.get("event") in {"push", "workflow_dispatch"}]
    exact.sort(key=lambda r: (int(r.get("run_attempt") or 0), int(r.get("id") or 0)), reverse=True)
    return exact[0] if exact else None

def run_evidence(run: dict | None) -> dict:
    if not run:
        return {"runId": None, "runStatus": None, "conclusion": None, "headSha": None}
    return {"runId": int(run.get("id") or 0), "runStatus": str(run.get("status") or ""), "conclusion": run.get("conclusion"), "headSha": str(run.get("head_sha") or "").lower()}

def created_epoch(run: dict) -> float:
    raw = str(run.get("created_at") or "")
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return 0.0

def dispatch_and_wait(sha: str) -> dict:
    before = time.time()
    path = f"/repos/{REPOSITORY}/actions/workflows/{urllib.parse.quote(WORKFLOW, safe='')}/dispatches"
    github(path, method="POST", body={"ref": BRANCH})
    for _ in range(POLL_ATTEMPTS):
        run = exact_release_run(sha)
        if run and created_epoch(run) >= before - 30:
            evidence = run_evidence(run)
            if evidence["headSha"] != sha:
                raise ControllerError("release_gate", "dispatched run SHA mismatch")
            if evidence["runStatus"] == "completed":
                if evidence["conclusion"] != "success":
                    raise ControllerError("release_gate", "dispatched workflow failed")
                return evidence
        time.sleep(POLL_SECONDS)
    raise ControllerError("release_gate", "workflow did not reach a terminal state")

def run() -> int:
    lock_path = STATE_DIR / "controller.lock"
    STATE_DIR.mkdir(mode=0o750, parents=True, exist_ok=True)
    with lock_path.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return status({"state": "LOCKED", "action": "none"}, True)
        expected = main_sha()
        observed = health()
        if observed.get("reachable") and observed.get("status") == "ok" and observed.get("service") == "echoes-of-aurion" and observed.get("revision") == expected:
            run_info = exact_release_run(expected)
            if not run_info or run_info.get("status") != "completed" or run_info.get("conclusion") != "success":
                raise ControllerError("release_gate", "aligned revision has no successful exact release run")
            return status({"state": "ALIGNED", "action": "none", "expectedRevision": expected, "observedRevision": observed.get("revision"), "health": observed, "releaseRun": run_evidence(run_info)}, True)
        run_info = exact_release_run(expected)
        if not run_info or run_info.get("status") != "completed" or run_info.get("conclusion") != "success":
            raise ControllerError("release_gate", "no successful exact release run available")
        dispatched = dispatch_and_wait(expected) if os.getenv("AURION_RECONCILER_DISPATCH", "1") == "1" else run_evidence(run_info)
        final_health = health()
        if not (final_health.get("reachable") and final_health.get("status") == "ok" and final_health.get("service") == "echoes-of-aurion" and final_health.get("revision") == expected):
            raise ControllerError("public_readback", "public health revision did not align")
        return status({"state": "RECONCILED", "action": "workflow_dispatch", "expectedRevision": expected, "observedBefore": observed, "observedAfter": final_health, "releaseRun": dispatched}, True)

def entry() -> int:
    try:
        return run()
    except ControllerError as exc:
        return status({"state": "FAILED_CLOSED", "action": "none", "stage": exc.stage, "detail": exc.detail}, False)
    except Exception as exc:
        return status({"state": "FAILED_CLOSED", "action": "none", "stage": "unexpected", "detail": type(exc).__name__}, False)

if __name__ == "__main__":
    sys.exit(entry())
