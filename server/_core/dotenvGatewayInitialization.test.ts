import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("gateway startup configuration", () => {
  it("loads dotenv before constructing the entrypoint's gateway observer", () => {
    const directory = mkdtempSync(join(tmpdir(), "aurion-gateway-env-"));
    const dotenvPath = join(directory, ".env");
    writeFileSync(dotenvPath, "AURION_GATEWAY_OBSERVE_ONLY=true\n");
    const entry = pathToFileURL(resolve("server/_core/index.ts")).href;
    const observer = pathToFileURL(resolve("server/defensiveGatewayObserver.ts")).href;
    // Load the actual application entrypoint in a disposable process, then
    // inspect the actual singleton's operational output. This is not a live
    // deployment or a synthetic simulation/runtime receipt.
    const script = `await import(${JSON.stringify(entry)});\n` +
      `const { defensiveGatewayObserver } = await import(${JSON.stringify(observer)});\n` +
      `defensiveGatewayObserver.originDenied("http"); defensiveGatewayObserver.flush(); process.exit(0);`;
    const env = { ...process.env, NODE_ENV: "test", DOTENV_CONFIG_PATH: dotenvPath, DATABASE_URL: "", AURION_GAME_DEV_REQUIRED: "false" };
    delete env.AURION_GATEWAY_OBSERVE_ONLY;
    try {
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
        cwd: process.cwd(), encoding: "utf8", env, timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const prefix = "[Aurion Gateway Observation] ";
      const line = result.stdout.split("\n").find(value => value.startsWith(prefix));
      expect(line, "DOTENV_GATEWAY_NOT_ENABLED").toBeDefined();
      expect(JSON.parse(line!.slice(prefix.length)).deniedOrigins.http).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 25_000);
});
