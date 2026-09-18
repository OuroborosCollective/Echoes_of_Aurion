import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AURION_ACTIVE_CAUSAL_TICK_SCHEMA,
  AURION_CAUSAL_TICK_SCHEMA_V2,
} from "../shared/aurionCausalTickContract";

describe("Blocker 9 compliance repair for Blocker 3", () => {
  it("proves migration 0049 remains the active causal receipt-v2 schema boundary", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const manifest = JSON.parse(readFileSync("config/aurion-migration-wave-manifest.json", "utf8"));
    const sql = readFileSync("drizzle/0049_aurion_causal_receipt_v2.sql", "utf8");
    const drizzle = readFileSync("drizzle/aurionCausalitySchema.ts", "utf8");
    const persistence = readFileSync("server/causality/persistence.ts", "utf8");

    expect(journal.entries.find((entry: { tag: string }) => entry.tag === "0049_aurion_causal_receipt_v2")).toMatchObject({
      idx: 49,
      tag: "0049_aurion_causal_receipt_v2",
    });
    expect(journal.entries).toHaveLength(52);
    expect(journal.entries.at(-1)).toMatchObject({ idx: 51, tag: "0051_aurion_cross_zone_handover_v2" });
    expect(manifest.waveId).toBe("aurion-production-0021-0051");
    expect(manifest.migrations.some((migration: { tag: string }) => migration.tag === "0049_aurion_causal_receipt_v2")).toBe(true);
    expect(manifest.migrations.at(-1)?.tag).toBe("0051_aurion_cross_zone_handover_v2");

    expect(sql).toContain("ADD COLUMN `receiptSchema`");
    expect(sql).toContain("ADD COLUMN `stageReceiptsJson`");
    expect(drizzle).toContain('receiptSchema: varchar("receiptSchema"');
    expect(drizzle).toContain('stageReceiptsJson: text("stageReceiptsJson")');
    expect(persistence).toContain("CAUSAL_V2_STAGE_EVIDENCE_MISSING");
    expect(persistence).toContain("CAUSAL_PERSISTED_RECEIPT_HASH_MISMATCH");
    expect(AURION_ACTIVE_CAUSAL_TICK_SCHEMA).toBe(AURION_CAUSAL_TICK_SCHEMA_V2);
  });

  it("keeps 0048 immutable while 0049 is additive", () => {
    const base = readFileSync("drizzle/0048_aurion_causal_evidence.sql", "utf8");
    const next = readFileSync("drizzle/0049_aurion_causal_receipt_v2.sql", "utf8");
    expect(base).not.toContain("receiptSchema");
    expect(base).not.toContain("stageReceiptsJson");
    expect(next).not.toMatch(/DROP\s|TRUNCATE\s|DELETE\s/i);
  });
});
