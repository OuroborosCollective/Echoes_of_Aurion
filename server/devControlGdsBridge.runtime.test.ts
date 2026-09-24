import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeGdsStatus } from "./devControlGdsBridge";
import { GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION, GAME_DEVELOPMENT_STUDIO_VERSION } from "./gameDevelopmentStudioRuntime";

afterEach(() => vi.unstubAllEnvs());

describe("Aurion dev-control ↔ real Game Development Studio runtime", () => {
  it("runs the existing pinned GDS status boundary without forwarding provider credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AURION_GAME_DEV_REQUIRED", "true");
    vi.stubEnv("AURION_GAME_DEV_SOURCE_REVISION", GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-dev-gds-bridge-"));
    const executable = path.join(root, "game-dev-fixture.mjs");
    const audit = path.join(root, "audit.json");
    fs.writeFileSync(executable, [
      'import fs from "node:fs";',
      'import path from "node:path";',
      'const audit = path.resolve(new URL(".", import.meta.url).pathname, "audit.json");',
      'fs.writeFileSync(audit, JSON.stringify({ tripo: process.env.TRIPO_API_KEY ?? null, leonardo: process.env.LEONARDO_API_KEY ?? null }));',
      'const args = process.argv.slice(2);',
      'if (args[0] === "--version") { console.log("game-dev __VERSION__"); process.exit(0); }',
      'if (args[0] === "capabilities") { console.log(JSON.stringify({ schema: "game_dev.capabilities.v1" })); process.exit(0); }',
      'if (args[0] === "doctor") { console.log(JSON.stringify({ schema: "game_dev.doctor.v1" })); process.exit(0); }',
      'if (args[0] === "--help") { console.log("game-dev package build <model.glb>\\ngame-dev vendor admit <package>"); process.exit(0); }',
      'process.exit(9);'
    ].join("\\n").replace("__VERSION__", GAME_DEVELOPMENT_STUDIO_VERSION), "utf8");
    fs.chmodSync(executable, 0o755);
    vi.stubEnv("AURION_GAME_DEV_BIN", executable);
    vi.stubEnv("AURION_GAME_DEV_WORKSPACE", path.join(root, "workspace"));
    vi.stubEnv("TRIPO_API_KEY", "must-not-reach-child");
    vi.stubEnv("LEONARDO_API_KEY", "must-not-reach-child");

    try {
      await expect(executeGdsStatus("CONFIRM_DEV_GDS_STATUS")).resolves.toMatchObject({
        available: true,
        version: GAME_DEVELOPMENT_STUDIO_VERSION,
        sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
        providerCalls: false,
      });
      expect(JSON.parse(fs.readFileSync(audit, "utf8"))).toEqual({ tripo: null, leonardo: null });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});