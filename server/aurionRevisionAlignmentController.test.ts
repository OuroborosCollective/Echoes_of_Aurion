import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const controllerPath = path.join(root, "deploy/aurion-revision-alignment-controller.py");
const controller = fs.readFileSync(controllerPath, "utf8");

describe("Aurion revision alignment controller", () => {
  it("keeps the reconciler fail-closed but able to self-heal missing and failed releases", () => {
    expect(controller).toContain('MAX_RETRY_ATTEMPTS = max(1');
    expect(controller).toContain('RETRY_BACKOFF_SECONDS = max(0');
    expect(controller).toContain('ACTIVE_RUN_STATES = {"queued", "in_progress", "waiting", "pending", "requested"}');
    expect(controller).toContain('return dispatch_release(expected, observed, None, "missing_exact_release")');
    expect(controller).toContain('return dispatch_release(expected, observed, run_info, "failed_exact_release")');
    expect(controller).toContain('return dispatch_release(expected, observed, run_info, "runtime_drift_after_success")');
    expect(controller).toContain('raise ControllerError("release_retry", "bounded workflow retry budget exhausted")');
    expect(controller).toContain('raise ControllerError("stale_main", "main revision changed before workflow dispatch")');
    expect(controller).toContain('raise ControllerError("stale_main", "main revision changed during workflow dispatch")');
    expect(controller).not.toContain("no successful exact release run available");
  });

  it("compiles and proves dispatch, duplicate suppression, retry bounds, stale-main rejection and aligned no-op", () => {
    const harness = String.raw`
import importlib.util
import pathlib
import tempfile

controller_path = pathlib.Path(${JSON.stringify(controllerPath)})
spec = importlib.util.spec_from_file_location("aurion_revision_alignment_controller", controller_path)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

SHA = "a" * 40
OTHER = "b" * 40
DRIFT = {"reachable": True, "status": "ok", "service": "echoes-of-aurion", "revision": "c" * 40}
ALIGNED = {"reachable": True, "status": "ok", "service": "echoes-of-aurion", "revision": SHA}


def reset():
    module.STATE_DIR = pathlib.Path(tempfile.mkdtemp(prefix="aurion-reconciler-test-"))
    module.MAX_RETRY_ATTEMPTS = 2
    module.RETRY_BACKOFF_SECONDS = 0
    module.DISPATCH_ENABLED = True
    events = []
    calls = []
    module.status = lambda payload, ok: events.append((payload, ok)) or (0 if ok else 1)
    module.github = lambda path, method="GET", body=None: calls.append((path, method, body)) or {}
    return events, calls


def release(status, conclusion=None, run_id=41, event="push"):
    return {"id": run_id, "status": status, "conclusion": conclusion, "head_sha": SHA, "event": event, "run_attempt": 1}

# No exact release exists: exactly one bounded dispatch is allowed.
events, calls = reset()
module.main_sha = lambda: SHA
module.health = lambda: DRIFT
module.exact_release_run = lambda _sha: None
assert module.entry() == 0
assert events[-1][0]["state"] == "DISPATCHED"
assert events[-1][0]["reason"] == "missing_exact_release"
assert events[-1][0]["attempt"] == 1
assert sum(1 for _path, method, _body in calls if method == "POST") == 1

# An active exact run suppresses duplicate dispatches.
events, calls = reset()
module.main_sha = lambda: SHA
module.health = lambda: DRIFT
module.exact_release_run = lambda _sha: release("in_progress")
assert module.entry() == 0
assert events[-1][0]["state"] == "RELEASE_ACTIVE"
assert sum(1 for _path, method, _body in calls if method == "POST") == 0

# Exact public runtime + successful exact run is the only aligned terminal state.
events, calls = reset()
module.main_sha = lambda: SHA
module.health = lambda: ALIGNED
module.exact_release_run = lambda _sha: release("completed", "success")
assert module.entry() == 0
assert events[-1][0]["state"] == "ALIGNED"
assert events[-1][0]["action"] == "none"
assert sum(1 for _path, method, _body in calls if method == "POST") == 0

# Failed releases receive only the configured retry budget.
events, calls = reset()
module.main_sha = lambda: SHA
module.health = lambda: DRIFT
module.exact_release_run = lambda _sha: release("completed", "failure")
module.write_retry_state({
    "schemaVersion": "aurion.revision-alignment-retry.v1",
    "revision": SHA,
    "attempts": 2,
    "lastDispatchEpoch": 1,
    "nextRetryEpoch": 0,
    "lastObservedRunId": 41,
    "lastObservedConclusion": "failure",
})
assert module.entry() == 1
assert events[-1][0]["state"] == "FAILED_CLOSED"
assert events[-1][0]["stage"] == "release_retry"
assert sum(1 for _path, method, _body in calls if method == "POST") == 0

# A moving main ref invalidates the target before mutation and dispatches nothing.
events, calls = reset()
main_values = iter([SHA, OTHER])
module.main_sha = lambda: next(main_values)
module.health = lambda: DRIFT
module.exact_release_run = lambda _sha: None
assert module.entry() == 1
assert events[-1][0]["state"] == "FAILED_CLOSED"
assert events[-1][0]["stage"] == "stale_main"
assert sum(1 for _path, method, _body in calls if method == "POST") == 0
`;

    const syntax = spawnSync("python3", ["-c", `compile(open(${JSON.stringify(controllerPath)}).read(), ${JSON.stringify(controllerPath)}, "exec")`], {
      cwd: root,
      encoding: "utf8",
    });
    expect(syntax.status, syntax.stderr).toBe(0);

    const result = spawnSync("python3", ["-c", harness], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
