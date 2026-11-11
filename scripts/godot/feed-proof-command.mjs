import { spawnSync } from "node:child_process";

/**
 * Bound a Linux CI command and its ordinary child process group. GNU timeout
 * sends TERM at the deadline and KILL after the grace period; foreground mode
 * is deliberately not used. No signal is sent to a game/VPS process.
 * https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html
 */
export function runBoundedFeedProofCommand(command, args, { env = process.env, timeoutSeconds = 180, graceSeconds = 5 } = {}) {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 180
    || !Number.isInteger(graceSeconds) || graceSeconds < 1 || graceSeconds > 5) {
    throw new RangeError("FEED_PROOF_DEADLINE_INVALID");
  }
  const result = spawnSync("timeout", ["--verbose", "--signal=TERM", "--kill-after=" + graceSeconds + "s", timeoutSeconds + "s", command, ...args], {
    env: { ...env, LC_ALL: "C" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024,
  });
  // Escalation kills the timeout group leader too, so Node can report null
  // status/SIGKILL rather than the shell's 137. A signal alone is not proof
  // of a timeout: require the supervisor's own deadline diagnostic.
  const deadlineSignal = /^timeout: sending signal (?:TERM|KILL) to command\b/m.test(result.stderr ?? "");
  const timedOut = result.error?.code === "ETIMEDOUT" || deadlineSignal
    && (result.status === 124 || result.status === 137 || result.signal === "SIGKILL");
  return timedOut ? { ...result, error: Object.assign(new Error("FEED_PROOF_COMMAND_TIMED_OUT"), { code: "ETIMEDOUT" }) } : result;
}
