import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const command = ["scripts/prepare-native-auth-test-schema.mjs"];
function guardRun(value: string | undefined, enabled: string): string {
  const env = { ...process.env, AURION_NATIVE_AUTH_E2E: enabled };
  if (value === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = value;
  const result = spawnSync(process.execPath, command, {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 10_000,
  });
  expect(result.status).not.toBe(0);
  return result.stderr + result.stdout;
}

describe("Native session schema can only be staged in an isolated test DB", () => {
  it("rejects missing explicit E2E opt-in before making a connection", () => {
    expect(guardRun("mysql://root:secret@127.0.0.1:3306/aurion_native_test", "0"))
      .toContain("NATIVE_AUTH_ISOLATED_FLAG_REQUIRED");
  });
  it("rejects remote or production database URLs before connection", () => {
    for (const url of [
      "mysql://root:secret@db.internal:3306/aurion_native_test",
      "mysql://root:secret@127.0.0.1:3306/aurion_production",
      "mysql://root:secret@127.0.0.1:3307/aurion_native_test",
      "mysql://root:secret@localhost:3306/aurion_native_test",
    ]) {
      expect(guardRun(url, "1")).toContain("NATIVE_AUTH_NON_ISOLATED_DATABASE_REJECTED");
    }
  });
  it("requires the canonical 0075 schema to be exactly journaled", () => {
    const config = readFileSync("drizzle.config.ts", "utf8");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(config).toContain('"./drizzle/nativeAuthSchema.ts"');
    expect(journal.entries.at(-1)).toMatchObject({ idx: 74, tag: "0075_aurion_native_auth_sessions" });
    expect(journal.entries.some((entry: { tag: string }) =>
      entry.tag === "0075_aurion_native_auth_sessions")).toBe(true);
  });
});
