import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectDrizzleMigrationChain } from "../scripts/drizzleMigrationChain";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture(input: Readonly<{ sqlTags: readonly string[]; journalTags: readonly string[] }>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-drizzle-chain-"));
  roots.push(root);
  const drizzle = path.join(root, "drizzle");
  const meta = path.join(drizzle, "meta");
  fs.mkdirSync(meta, { recursive: true });
  for (const tag of input.sqlTags) {
    fs.writeFileSync(path.join(drizzle, `${tag}.sql`), `-- ${tag}\n`);
  }
  fs.writeFileSync(
    path.join(meta, "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "mysql",
      entries: input.journalTags.map((tag, idx) => ({ idx, version: "5", when: idx + 1, tag, breakpoints: true })),
    })
  );
  return root;
}

describe("drizzle migration chain inspector", () => {
  it("accepts a one-to-one deterministic SQL/journal chain", () => {
    const result = inspectDrizzleMigrationChain(
      fixture({ sqlTags: ["0000_alpha", "0001_beta"], journalTags: ["0000_alpha", "0001_beta"] })
    );
    expect(result.ok).toBe(true);
    expect(result.unjournaledSqlTags).toEqual([]);
    expect(result.missingSqlTags).toEqual([]);
  });

  it("rejects an SQL migration that the Drizzle journal would ignore", () => {
    const result = inspectDrizzleMigrationChain(
      fixture({ sqlTags: ["0000_alpha", "0001_beta", "0002_gamma"], journalTags: ["0000_alpha", "0001_beta"] })
    );
    expect(result.ok).toBe(false);
    expect(result.unjournaledSqlTags).toEqual(["0002_gamma"]);
  });

  it("rejects a journal entry without its SQL file", () => {
    const result = inspectDrizzleMigrationChain(
      fixture({ sqlTags: ["0000_alpha"], journalTags: ["0000_alpha", "0001_missing"] })
    );
    expect(result.ok).toBe(false);
    expect(result.missingSqlTags).toEqual(["0001_missing"]);
  });

  it("rejects ambiguous numeric migration prefixes", () => {
    const result = inspectDrizzleMigrationChain(
      fixture({ sqlTags: ["0000_alpha", "0000_beta"], journalTags: ["0000_alpha", "0000_beta"] })
    );
    expect(result.ok).toBe(false);
    expect(result.duplicateNumericPrefixes).toEqual(["0000"]);
  });
});
