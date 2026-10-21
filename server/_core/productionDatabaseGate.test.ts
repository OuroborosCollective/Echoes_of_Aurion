import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertProductionDatabaseConfigured, assertProductionDatabaseConnected } from "./productionDatabaseGate";

describe("Aurion production MariaDB authority gate", () => {
  it("refuses missing or invalid production MariaDB URLs", () => {
    for (const url of [undefined, "", " ", "postgres://localhost/aurion", "mysql://", "mariadb:///missing-host"]) {
      expect(() => assertProductionDatabaseConfigured("production", url)).toThrow("AURION_PRODUCTION_DATABASE_CONFIGURATION_REQUIRED");
    }
  });

  it("accepts valid MariaDB and MySQL URLs in production", () => {
    for (const url of ["mysql://user:pw@127.0.0.1:3306/aurion", "mariadb://user:pw@localhost/aurion"]) {
      expect(() => assertProductionDatabaseConfigured("production", url)).not.toThrow();
    }
  });

  it("preserves local development and test tooling with an absent DB", () => {
    expect(() => assertProductionDatabaseConfigured("development", undefined)).not.toThrow();
    expect(() => assertProductionDatabaseConfigured("test", undefined)).not.toThrow();
    expect(() => assertProductionDatabaseConnected("development", false)).not.toThrow();
  });

  it("terminates the real production entrypoint before listening when MariaDB is absent", () => {
    const entry = resolve("server/_core/index.ts");
    const result = spawnSync(process.execPath, ["--import", "tsx", entry], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "", AURION_GAME_DEV_REQUIRED: "false" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AURION_PRODUCTION_DATABASE_CONFIGURATION_REQUIRED");
    expect(result.stdout).not.toContain("Server running on");
  });

  it("refuses to report productive readiness after an unsuccessful real database probe", () => {
    expect(() => assertProductionDatabaseConnected("production", false)).toThrow("AURION_PRODUCTION_DATABASE_UNAVAILABLE");
    expect(() => assertProductionDatabaseConnected("production", true)).not.toThrow();
  });
});
