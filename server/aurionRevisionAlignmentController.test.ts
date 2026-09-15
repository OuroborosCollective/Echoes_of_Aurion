import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion revision alignment controller contract", () => {
  const controllerScript = read("deploy/aurion-revision-alignment-controller.py");

  it("enforces exact 40-hex SHA revision regex", () => {
    expect(controllerScript).toContain('SHA_RE = re.compile(r"^[0-9a-f]{40}$")');
    expect(controllerScript).toContain('if not SHA_RE.fullmatch(sha):');
  });

  it("guards against duplicate dispatches for active workflow runs", () => {
    expect(controllerScript).toContain(
      'ACTIVE_RUN_STATES = {"queued", "in_progress", "waiting", "pending", "requested"}'
    );
    expect(controllerScript).toContain('if evidence["runStatus"] in ACTIVE_RUN_STATES:');
    expect(controllerScript).toContain('"state": "RELEASE_ACTIVE"');
  });

  it("enforces bounded retry budget with backoff", () => {
    expect(controllerScript).toContain('MAX_RETRY_ATTEMPTS = max(1, int(os.getenv("AURION_RECONCILER_MAX_RETRY_ATTEMPTS", "3")))');
    expect(controllerScript).toContain('if state["attempts"] >= MAX_RETRY_ATTEMPTS:');
    expect(controllerScript).toContain('raise ControllerError("release_retry", "bounded workflow retry budget exhausted")');
    expect(controllerScript).toContain('if now < state["nextRetryEpoch"]:');
    expect(controllerScript).toContain('"state": "RETRY_BACKOFF"');
  });

  it("fails closed on stale main revision", () => {
    expect(controllerScript).toContain('current_main = main_sha()');
    expect(controllerScript).toContain('if current_main != expected:');
    expect(controllerScript).toContain('raise ControllerError("stale_main", "main revision changed before workflow dispatch")');
    expect(controllerScript).toContain('if main_sha() != expected:');
    expect(controllerScript).toContain('raise ControllerError("stale_main", "main revision changed during workflow dispatch")');
  });

  it("produces ALIGNED state only on exact runtime revision and completed successful release", () => {
    expect(controllerScript).toContain('observed.get("revision") == expected');
    expect(controllerScript).toContain('if aligned(expected, observed):');
    expect(controllerScript).toContain(
      'if evidence["runStatus"] != "completed" or evidence["conclusion"] != "success" or evidence["headSha"] != expected:'
    );
    expect(controllerScript).toContain('"state": "ALIGNED"');
  });

  it("fails closed with non-zero status exit code on controller error", () => {
    expect(controllerScript).toContain('except ControllerError as exc:');
    expect(controllerScript).toContain('"state": "FAILED_CLOSED"');
    expect(controllerScript).toContain('return 0 if ok else 1');
  });
});
