import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion production schema apply workflow", () => {
  it("derives the late-migration contract from the canonical Drizzle journal", () => {
    const workflow = read(".github/workflows/aurion-production-schema-apply.yml");
    const journal = JSON.parse(read("drizzle/meta/_journal.json"));
    const tags = journal.entries
      .filter((entry: { idx: number }) => entry.idx >= 21)
      .sort((a: { idx: number }, b: { idx: number }) => a.idx - b.idx)
      .map((entry: { tag: string }) => entry.tag);

    expect(tags).toContain("0034_ax1_starter_equipment_receipts");
    expect(workflow).toContain('JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8"))');
    expect(workflow).toContain("entry.idx>=21");
    expect(workflow).toContain("new Set(tags).size!==tags.length");
    expect(workflow).not.toContain("const tags=[");
    expect(tags.length).toBeGreaterThan(13);
  });
});
