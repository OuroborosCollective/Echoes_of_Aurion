import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Run the actual Aurion gateway in a child process: an unhandled server-side
 * WebSocket 'error' must fail this test, never kill the Vitest worker.
 */
function runIngressProbe(scenario: "oversize" | "unknown-upgrade", receipt: string): void {
  const probe = resolve("scripts/tests/zone-gateway-ingress-probe.mjs");
  const result = spawnSync(process.execPath, ["--import", "tsx", probe, scenario], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 12_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "" },
  });
  const diagnostic = `scenario=${scenario}, status=${result.status}, signal=${result.signal}\n${result.stdout}\n${result.stderr}`;
  expect(result.error, diagnostic).toBeUndefined();
  expect(result.status, diagnostic).toBe(0);
  expect(result.stdout, diagnostic).toContain(receipt);
}

describe("Aurion zone WebSocket ingress (real child-process boundary)", () => {
  it("survives a pre-ticket frame above the 2048-byte budget and closes that peer with 1009", () => {
    runIngressProbe("oversize", "ZONE_INGRESS_OVERSIZE_SURVIVED");
  });

  it("closes unknown WebSocket upgrade paths instead of leaving open TCP sockets", () => {
    runIngressProbe("unknown-upgrade", "ZONE_INGRESS_UNKNOWN_UPGRADE_CLOSED");
  });
});
