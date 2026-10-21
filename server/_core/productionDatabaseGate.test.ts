import { describe, expect, it } from "vitest";
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

  it("refuses to report productive readiness after an unsuccessful real database probe", () => {
    expect(() => assertProductionDatabaseConnected("production", false)).toThrow("AURION_PRODUCTION_DATABASE_UNAVAILABLE");
    expect(() => assertProductionDatabaseConnected("production", true)).not.toThrow();
  });
});
