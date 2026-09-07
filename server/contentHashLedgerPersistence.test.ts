import { describe, expect, it } from "vitest";
import { classifyContentHashAudit, normalizeContentHashLedger } from "./contentHashLedgerPersistence";

const base = {
  sourceRevision: "aurion-main-0041",
  sourcePath: "drizzle/0041_aurion_content_hash_ledger.sql",
  fileHash: "a".repeat(64),
  manifestHash: "b".repeat(64),
  migrationTag: "0041_aurion_content_hash_ledger",
  contentKind: "sql" as const,
  sourceSizeBytes: 2_048,
};

describe("AIM-237 content hash ledger", () => {
  it("binds exact source revision/path/file/manifest identity", () => {
    const result = normalizeContentHashLedger(base);
    expect(result.identityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalizeContentHashLedger({ ...base, sourcePath: "drizzle/schema.ts" }).identityHash).not.toBe(result.identityHash);
  });

  it("fails closed for missing evidence and detects drift", () => {
    expect(classifyContentHashAudit({ expectedFileHash: base.fileHash, actualFileHash: base.fileHash, expectedManifestHash: base.manifestHash, actualManifestHash: base.manifestHash })).toBe("VERIFIED");
    expect(classifyContentHashAudit({ expectedFileHash: base.fileHash, actualFileHash: "c".repeat(64), expectedManifestHash: base.manifestHash, actualManifestHash: base.manifestHash })).toBe("DRIFT");
    expect(classifyContentHashAudit({ expectedFileHash: base.fileHash, actualFileHash: null, expectedManifestHash: base.manifestHash, actualManifestHash: base.manifestHash })).toBe("UNREADABLE");
  });

  it("rejects malformed hashes, paths and migration tags", () => {
    expect(() => normalizeContentHashLedger({ ...base, fileHash: "invalid" })).toThrow();
    expect(() => normalizeContentHashLedger({ ...base, sourcePath: "" })).toThrow();
    expect(() => normalizeContentHashLedger({ ...base, migrationTag: "004" })).toThrow();
  });
});
