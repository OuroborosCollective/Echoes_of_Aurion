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
from pathlib import Path

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REPOSITORY = os.getenv("AURION_RECONCILER_REPOSITORY", "OuroborosCollective/Echoes_of_Aurion")
WORKFLOW = os.getenv("AURION_RECONCILER_WORKFLOW", "deploy-aurion-zone-runtime.yml")
BRANCH = os.getenv("AURION_RECONCILER_BRANCH", "main")
HEALTH_URL = os.getenv("AURION_RECONCILER_HEALTH_URL", "https://arelogic.space/healthz")
STATE_DIR = Path(os.getenv("AURION_RECONCILER_STATE_DIR", "/var/lib/aurion-revision-alignment"))
TOKEN_FILE = Path(os.getenv("AURION_RECONCILER_TOKEN_FILE", "/etc/aurion-revision-alignment/github.token"))
MAX_RETRY_ATTEMPTS = max(1, int(os.getenv("AURION_RECONCILER_MAX_RETRY_ATTEMPTS", "3")))
RETRY_BACKOFF_SECONDS = max(0, int(os.getenv("AURION_RECONCILER_RETRY_BACKOFF_SECONDS", "300")))
DISPATCH_ENABLED = os.getenv("AURION_RECONCILER_DISPATCH", "1") == "1"
ACTIVE_RUN_STATES = {"queued", "in_progress", "waiting", "pending", "requested"}


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
        "schemaVersion": "aurion.revision-alignment-status.v2",
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
    request = urllib.request.Request(
        HEALTH_URL,
        headers={"Accept": "application/json", "User-Agent": "aurion-revision-alignment-controller"},
    )
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
    data = github(
        f"/repos/{REPOSITORY}/actions/workflows/{workflow}/runs?branch={urllib.parse.quote(BRANCH)}&per_page=50"
    )
    runs = data.get("workflow_runs", []) if isinstance(data, dict) else []
    exact = [
        run
        for run in runs
        if isinstance(run, dict)
        and str(run.get("head_sha") or "").lower() == sha
        and run.get("event") in {"push", "workflow_dispatch"}
    ]
    exact.sort(key=lambda run: (int(run.get("run_attempt") or 0), int(run.get("id") or 0)), reverse=True)
    return exact[0] if exact else None


def run_evidence(run: dict | None) -> dict:
    if not run:
        return {"runId": None, "runStatus": None, "conclusion": None, "headSha": None, "event": None}
    return {
        "runId": int(run.get("id") or 0),
        "runStatus": str(run.get("status") or ""),
        "conclusion": run.get("conclusion"),
        "headSha": str(run.get("head_sha") or "").lower(),
        "event": str(run.get("event") or ""),
    }


def retry_state_path() -> Path:
    return STATE_DIR / "retry-state.json"


def retry_state(sha: str) -> dict:
    path = retry_state_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raw = {}
    except (OSError, json.JSONDecodeError) as exc:
        raise ControllerError("retry_state", "retry state unreadable") from exc
    if not isinstance(raw, dict) or raw.get("revision") != sha:
        return {
            "schemaVersion": "aurion.revision-alignment-retry.v1",
            "revision": sha,
            "attempts": 0,
            "lastDispatchEpoch": 0,
            "nextRetryEpoch": 0,
            "lastObservedRunId": None,
            "lastObservedConclusion": None,
        }
    attempts = raw.get("attempts")
    next_retry = raw.get("nextRetryEpoch")
    if not isinstance(attempts, int) or attempts < 0 or not isinstance(next_retry, int) or next_retry < 0:
        raise ControllerError("retry_state", "retry state invalid")
    return raw


def write_retry_state(value: dict) -> None:
    STATE_DIR.mkdir(mode=0o750, parents=True, exist_ok=True)
    tmp = STATE_DIR / "retry-state.json.tmp"
    tmp.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o640)
    tmp.replace(retry_state_path())


def clear_retry_state() -> None:
    try:
        retry_state_path().unlink()
    except FileNotFoundError:
        pass


def aligned(expected: str, observed: dict) -> bool:
    return bool(
        observed.get("reachable")
        and observed.get("status") == "ok"
        and observed.get("service") == "echoes-of-aurion"
        and observed.get("revision") == expected
    )


def dispatch_release(expected: str, observed: dict, previous_run: dict | None, reason: str) -> int:
    if not DISPATCH_ENABLED:
        return status(
            {
                "state": "DRIFT_OBSERVED",
                "action": "none",
                "reason": reason,
                "expectedRevision": expected,
                "observedRevision": observed.get("revision"),
                "health": observed,
                "releaseRun": run_evidence(previous_run),
            },
            False,
        )

    current_main = main_sha()
    if current_main != expected:
        raise ControllerError("stale_main", "main revision changed before workflow dispatch")

    state = retry_state(expected)
    now = int(time.time())
    if state["attempts"] >= MAX_RETRY_ATTEMPTS:
        raise ControllerError("release_retry", "bounded workflow retry budget exhausted")
    if now < state["nextRetryEpoch"]:
        return status(
            {
                "state": "RETRY_BACKOFF",
                "action": "none",
                "reason": reason,
                "expectedRevision": expected,
                "observedRevision": observed.get("revision"),
                "health": observed,
                "releaseRun": run_evidence(previous_run),
                "attempt": state["attempts"],
                "maxAttempts": MAX_RETRY_ATTEMPTS,
                "nextRetryEpoch": state["nextRetryEpoch"],
            },
            True,
        )

    workflow = urllib.parse.quote(WORKFLOW, safe="")
    github(f"/repos/{REPOSITORY}/actions/workflows/{workflow}/dispatches", method="POST", body={"ref": BRANCH})
    state.update(
        {
            "attempts": state["attempts"] + 1,
            "lastDispatchEpoch": now,
            "nextRetryEpoch": now + RETRY_BACKOFF_SECONDS,
            "lastObservedRunId": run_evidence(previous_run)["runId"],
            "lastObservedConclusion": run_evidence(previous_run)["conclusion"],
        }
    )
    write_retry_state(state)

    if main_sha() != expected:
        raise ControllerError("stale_main", "main revision changed during workflow dispatch")

    return status(
        {
            "state": "DISPATCHED",
            "action": "workflow_dispatch",
            "reason": reason,
            "expectedRevision": expected,
            "observedRevision": observed.get("revision"),
            "health": observed,
            "releaseRun": run_evidence(previous_run),
            "attempt": state["attempts"],
            "maxAttempts": MAX_RETRY_ATTEMPTS,
            "nextRetryEpoch": state["nextRetryEpoch"],
        },
        True,
    )


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
        run_info = exact_release_run(expected)
        evidence = run_evidence(run_info)

        if aligned(expected, observed):
            if evidence["runStatus"] != "completed" or evidence["conclusion"] != "success" or evidence["headSha"] != expected:
                raise ControllerError("release_gate", "aligned revision has no successful exact release run")
            clear_retry_state()
            return status(
                {
                    "state": "ALIGNED",
                    "action": "none",
                    "expectedRevision": expected,
                    "observedRevision": observed.get("revision"),
                    "health": observed,
                    "releaseRun": evidence,
                },
                True,
            )

        if evidence["headSha"] not in {None, expected}:
            raise ControllerError("release_gate", "release run SHA mismatch")

        if evidence["runStatus"] in ACTIVE_RUN_STATES:
            state = retry_state(expected)
            if evidence["runId"]:
                state["lastObservedRunId"] = evidence["runId"]
                state["lastObservedConclusion"] = evidence["conclusion"]
                write_retry_state(state)
            return status(
                {
                    "state": "RELEASE_ACTIVE",
                    "action": "none",
                    "expectedRevision": expected,
                    "observedRevision": observed.get("revision"),
                    "health": observed,
                    "releaseRun": evidence,
                    "attempt": state["attempts"],
                    "maxAttempts": MAX_RETRY_ATTEMPTS,
                },
                True,
            )

        if not run_info:
            return dispatch_release(expected, observed, None, "missing_exact_release")

        if evidence["runStatus"] != "completed":
            raise ControllerError("release_gate", "exact release run has unknown state")

        if evidence["conclusion"] == "success":
            return dispatch_release(expected, observed, run_info, "runtime_drift_after_success")

        return dispatch_release(expected, observed, run_info, "failed_exact_release")


def entry() -> int:
    try:
        return run()
    except ControllerError as exc:
        return status({"state": "FAILED_CLOSED", "action": "none", "stage": exc.stage, "detail": exc.detail}, False)
    except Exception as exc:
        return status({"state": "FAILED_CLOSED", "action": "none", "stage": "unexpected", "detail": type(exc).__name__}, False)


if __name__ == "__main__":
    sys.exit(entry())
