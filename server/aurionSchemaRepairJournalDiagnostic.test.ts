import { describe, expect, it } from "vitest";
import { journalDiagnostic } from "../scripts/aurion-schema-repair-journal-diagnostic.mjs";

const revision = "a".repeat(40);
const image = "sha256:" + "b".repeat(64);
const hash = "c".repeat(64);
const history = [{ tag: "0068_aurion_item_manipulation_runtime", hash, when: 1700000000000 }];
function receipt(rows: unknown[]) {
  return { recordType: "aurion_production_schema_reconciliation", schemaVersion: 1, sourceRevision: revision,
    readOnly: true, databaseCredentialReturned: false, overallState: "PRESENT_SCHEMA_DRIFT",
    execution: { mode: "docker", network: "echoes-of-aurion-internal", imageDigest: image, containerExitStatus: 3,
      rootFilesystemReadOnly: true, releaseMountedReadOnly: true, environmentMountedReadOnly: true },
    drizzleJournal: [{ tableName: "__drizzle_migrations", rows }], privateDriverMessage: "PRIVATE_VALUE_SENTINEL" };
}
describe("bounded read-only migration journal diagnostics", () => {
  it("identifies mismatched timestamps and unknown/duplicate digests without granting schema authority", () => {
    const r = journalDiagnostic(receipt([
      { hash, createdAt: "1700000000001" },
      { hash, createdAt: "1700000000000" },
      { hash: "d".repeat(64), createdAt: "1700000000000" },
    ]), history, revision, image, 3);
    expect(r.readOnly).toBe(true);
    expect(r.schemaState).toBe("PRESENT_SCHEMA_DRIFT");
    expect(r.runnerStatus).toBe(3);
    expect(r.conflicts.map(c => c.reason)).toEqual(["TIMESTAMP_MISMATCH", "DUPLICATE_HASH", "UNRECOGNIZED_HASH"]);
    expect(r.conflicts[0]).toMatchObject({ migration: history[0].tag, expectedWhen: history[0].when });
    expect(JSON.stringify(r)).not.toContain("PRIVATE_VALUE_SENTINEL");
  });
  it("omits arbitrary malformed row values", () => {
    const r = journalDiagnostic(receipt([{ hash: "PRIVATE_VALUE_SENTINEL", createdAt: "1700000000000" },
      { hash, createdAt: "PRIVATE_VALUE_SENTINEL" }]), history, revision, image, 3);
    expect(r.invalidRowCount).toBe(2);
    expect(r.conflicts).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("PRIVATE_VALUE_SENTINEL");
  });
  it("rejects wrong revisions, runtime identities, credentials and execution status", () => {
    const base = receipt([]);
    for (const bad of [{ ...base, sourceRevision: "d".repeat(40) }, { ...base, readOnly: false },
      { ...base, databaseCredentialReturned: true }, { ...base, execution: { ...base.execution, imageDigest: "sha256:" + "e".repeat(64) } },
      { ...base, execution: { ...base.execution, environmentMountedReadOnly: false } }]) {
      expect(() => journalDiagnostic(bad, history, revision, image, 3)).toThrow("DIAGNOSTIC_READBACK_IDENTITY_INVALID");
    }
    expect(() => journalDiagnostic(base, history, revision, image, 0)).toThrow();
  });
  it("rejects ambiguous journals and invalid or conflicting source history", () => {
    const base = receipt([]);
    expect(() => journalDiagnostic({ ...base, drizzleJournal: [{ tableName: "users", rows: [] }] }, history, revision, image, 3)).toThrow("DIAGNOSTIC_JOURNAL_SCOPE_INVALID");
    expect(() => journalDiagnostic({ ...base, drizzleJournal: [...base.drizzleJournal, ...base.drizzleJournal] }, history, revision, image, 3)).toThrow();
    expect(() => journalDiagnostic(base, [...history, ...history], revision, image, 3)).toThrow("DIAGNOSTIC_SOURCE_HISTORY_INVALID");
  });
  it("records missing canonical migration identities without manufacturing journal rows", () => {
    const r = journalDiagnostic(receipt([]), history, revision, image, 3);
    expect(r.unrecordedSourceTags).toEqual([history[0].tag]);
    expect(r.rowCount).toBe(0);
    expect(r).not.toHaveProperty("journalInsertions");
  });
});
