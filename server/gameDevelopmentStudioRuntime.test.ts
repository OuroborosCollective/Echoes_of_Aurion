import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { issueGlbAgentSession } from "./glbAgentSession";
import {
  GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
  GAME_DEVELOPMENT_STUDIO_VERSION,
  authenticateGameDevelopmentStudioBearer,
  buildGameDevAssetArgs,
  resolveGameDevelopmentStudioRuntimeReadback,
} from "./gameDevelopmentStudioRuntime";

const original = {
  bin: process.env.AURION_GAME_DEV_BIN,
  required: process.env.AURION_GAME_DEV_REQUIRED,
  source: process.env.AURION_GAME_DEV_SOURCE_REVISION,
  workspace: process.env.AURION_GAME_DEV_WORKSPACE,
  tripo: process.env.TRIPO_API_KEY,
  leonardo: process.env.LEONARDO_API_KEY,
  jwt: process.env.JWT_SECRET,
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries({
    AURION_GAME_DEV_BIN: original.bin,
    AURION_GAME_DEV_REQUIRED: original.required,
    AURION_GAME_DEV_SOURCE_REVISION: original.source,
    AURION_GAME_DEV_WORKSPACE: original.workspace,
    TRIPO_API_KEY: original.tripo,
    LEONARDO_API_KEY: original.leonardo,
    JWT_SECRET: original.jwt,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("live Game Development Studio runtime boundary", () => {
  it("builds only the fixed inspect/validate command shape with absolute server-owned paths", () => {
    expect(buildGameDevAssetArgs("inspect", "/tmp/model.glb", "/tmp/result")).toEqual([
      "asset", "inspect", "/tmp/model.glb", "--output-dir", "/tmp/result", "--json",
    ]);
    expect(buildGameDevAssetArgs("validate", "/tmp/model.glb", "/tmp/result")).toEqual([
      "asset", "validate", "/tmp/model.glb", "--output-dir", "/tmp/result", "--json",
    ]);
    expect(() => buildGameDevAssetArgs("inspect", "relative.glb", "/tmp/result")).toThrow("GAME_DEV_ABSOLUTE_PATH_REQUIRED");
  });

  it("accepts the same bounded one-hour GLB agent session for approved-asset validation", async () => {
    const secret = "aurion-game-dev-test-secret-000000000000000000000000";
    process.env.JWT_SECRET = secret;
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 1210, role: "admin" } as Awaited<ReturnType<typeof db.getUserById>>);
    const session = await issueGlbAgentSession(1210, secret);
    const request = {
      header: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${session.token}` : undefined,
    } as any;

    await expect(authenticateGameDevelopmentStudioBearer(request)).resolves.toEqual({ id: 1210 });
  });

  it("fails closed when a bounded GLB agent session no longer maps to an admin", async () => {
    const secret = "aurion-game-dev-test-secret-111111111111111111111111";
    process.env.JWT_SECRET = secret;
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 1210, role: "user" } as Awaited<ReturnType<typeof db.getUserById>>);
    const session = await issueGlbAgentSession(1210, secret);
    const request = {
      header: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${session.token}` : undefined,
    } as any;

    await expect(authenticateGameDevelopmentStudioBearer(request)).resolves.toBeNull();
  });

  it("proves the pinned runtime can report ready without inheriting provider credentials", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-game-dev-runtime-test-"));
    const executable = path.join(root, "game-dev-fixture.mjs");
    const audit = path.join(root, "env-audit.jsonl");
    fs.writeFileSync(executable, `#!/usr/bin/env node\nimport fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(audit)}, JSON.stringify({tripo:process.env.TRIPO_API_KEY??null,leonardo:process.env.LEONARDO_API_KEY??null})+"\\n");\nconst args=process.argv.slice(2);\nif(args[0]==="--version"){console.log("game-dev ${GAME_DEVELOPMENT_STUDIO_VERSION}");process.exit(0);}\nif(args[0]==="capabilities"){console.log(JSON.stringify({schema:"game_dev.capabilities.v1"}));process.exit(0);}\nif(args[0]==="doctor"){console.log(JSON.stringify({schema:"game_dev.doctor.v1"}));process.exit(0);}\nprocess.exit(9);\n`, "utf8");
    fs.chmodSync(executable, 0o755);
    process.env.AURION_GAME_DEV_BIN = executable;
    process.env.AURION_GAME_DEV_REQUIRED = "true";
    process.env.AURION_GAME_DEV_SOURCE_REVISION = GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION;
    process.env.AURION_GAME_DEV_WORKSPACE = path.join(root, "workspace");
    process.env.TRIPO_API_KEY = "must-not-reach-child";
    process.env.LEONARDO_API_KEY = "must-not-reach-child";
    try {
      const readback = await resolveGameDevelopmentStudioRuntimeReadback();
      expect(readback).toMatchObject({
        available: true,
        required: true,
        version: GAME_DEVELOPMENT_STUDIO_VERSION,
        sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
        capabilitiesSchema: "game_dev.capabilities.v1",
        doctorSchema: "game_dev.doctor.v1",
        providerCalls: false,
        boundary: "human-confirmed-package-vendor-live-admission",
        error: null,
      });
      const auditRows = fs.readFileSync(audit, "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(auditRows).toHaveLength(3);
      expect(auditRows).toEqual(Array(3).fill({ tripo: null, leonardo: null }));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed on a mismatched staged source revision", async () => {
    process.env.AURION_GAME_DEV_REQUIRED = "true";
    process.env.AURION_GAME_DEV_SOURCE_REVISION = "0".repeat(40);
    const readback = await resolveGameDevelopmentStudioRuntimeReadback();
    expect(readback.available).toBe(false);
    expect(readback.required).toBe(true);
    expect(readback.error).toBe("GAME_DEV_SOURCE_REVISION_MISMATCH");
  });
});
