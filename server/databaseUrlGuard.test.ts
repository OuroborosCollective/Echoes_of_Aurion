import { describe, expect, it } from "vitest";
import { isConfiguredDatabaseUrl, getDb, canConnectToDatabase } from "./db";
import { createAutonomousNpcLifeRuntime } from "./autonomousNpcLifeRuntime";

describe("Database URL Guard and Protocol Validation", () => {
  it("rejects non-mysql protocols including HTTP/HTTPS URLs", () => {
    expect(isConfiguredDatabaseUrl(undefined)).toBe(false);
    expect(isConfiguredDatabaseUrl("")).toBe(false);
    expect(isConfiguredDatabaseUrl("   ")).toBe(false);
    expect(isConfiguredDatabaseUrl("http://46.202.154.25:3306")).toBe(false);
    expect(isConfiguredDatabaseUrl("https://arelogic.space")).toBe(false);
    expect(isConfiguredDatabaseUrl("postgres://localhost:5432/aurion")).toBe(false);
    expect(isConfiguredDatabaseUrl("ftp://mariadb:3306")).toBe(false);
    expect(isConfiguredDatabaseUrl("invalid-uri")).toBe(false);
  });

  it("accepts valid mysql and mariadb protocol connection strings", () => {
    expect(isConfiguredDatabaseUrl("mysql://aurion_user:secret@mariadb:3306/aurion_db")).toBe(true);
    expect(isConfiguredDatabaseUrl("mysql://root@127.0.0.1:3306/aurion_test")).toBe(true);
    expect(isConfiguredDatabaseUrl("mariadb://user:pass@localhost:3306/aurion")).toBe(true);
  });

  it("returns null from getDb() when DATABASE_URL is an invalid HTTP URL without throwing", async () => {
    const originalEnv = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "http://46.202.154.25:3306";
      const db = await getDb();
      expect(db).toBeNull();
    } finally {
      process.env.DATABASE_URL = originalEnv;
    }
  });

  it("disables autonomous NPC life runtime when DATABASE_URL is an invalid protocol", () => {
    const originalEnv = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "http://46.202.154.25:3306";
      const runtime = createAutonomousNpcLifeRuntime();
      expect(runtime.enabled).toBe(false);
      expect(runtime.readback().status).toBe("disabled");
    } finally {
      process.env.DATABASE_URL = originalEnv;
    }
  });

  it("returns false from canConnectToDatabase when database is unreachable without unhandled exceptions", async () => {
    const originalEnv = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "http://46.202.154.25:3306";
      const connectedHttp = await canConnectToDatabase(100);
      expect(connectedHttp).toBe(false);

      process.env.DATABASE_URL = "mysql://user:pass@unresolvable-fake-host-987654.local:3306/db";
      const connectedUnresolvable = await canConnectToDatabase(100);
      expect(connectedUnresolvable).toBe(false);
    } finally {
      process.env.DATABASE_URL = originalEnv;
    }
  });
});
