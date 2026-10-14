import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BoundedCausalArchivePacker,
  CAUSAL_ARCHIVE_PACKET_MAX_BYTES,
  packCausalArchivePayloads,
  type ArchiveReceiptPayload,
} from "./archivePacking";

const root = path.resolve(import.meta.dirname, "../..");
const source = (name: string) => fs.readFileSync(path.join(root, "server/causality", name), "utf8");

function payload(tick: number): ArchiveReceiptPayload {
  const hash = "f".repeat(64);
  return {
    id: `rcpt_${tick}`, worldId: "world", zoneId: "zone", tick,
    revision: "test-revision", rulesetVersion: "test-ruleset",
    receiptSchema: "aurion.causal.tick.v1",
    preStateHash: hash, inputHash: hash,
    inputJson: JSON.stringify(["🐺".repeat(tick % 29)]),
    stageReceiptsJson: null, transitionHash: hash, rngRootHash: hash,
    postStateHash: hash, previousReceiptHash: hash, receiptHash: hash,
  };
}

describe("causal archive bounded-memory contracts", () => {
  it("packs incremental receipts identically to the legacy full-array packing contract across page boundaries", () => {
    const receipts = Array.from({ length: 1100 }, (_, index) => payload(index + 1));
    const expected = packCausalArchivePayloads(receipts);
    const packer = new BoundedCausalArchivePacker();
    const actual: string[] = [];
    for (let i = 0; i < receipts.length; i += 64) {
      for (const receipt of receipts.slice(i, i + 64)) {
        const complete = packer.push(receipt);
        if (complete) actual.push(complete);
      }
    }
    const tail = packer.finish();
    if (tail) actual.push(tail);
    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThan(1);
    expect(actual.every(packet => Buffer.byteLength(packet, "utf8") <= CAUSAL_ARCHIVE_PACKET_MAX_BYTES)).toBe(true);
    expect(actual.flatMap(packet => JSON.parse(packet).map((entry: { tick: number }) => entry.tick)))
      .toEqual(Array.from({ length: receipts.length }, (_, index) => index + 1));
  });

  it("rejects one oversized UTF-8 receipt before allocating any archive packet", () => {
    const packer = new BoundedCausalArchivePacker();
    expect(() => packer.push({ ...payload(1), inputJson: "🐺".repeat(20_000) }))
      .toThrow("CAUSAL_ARCHIVE_RECEIPT_TOO_LARGE:1");
    expect(packer.finish()).toBeNull();
  });

  it("keyset-pages database archive receipts and does not load whole prefixes into Node heap", () => {
    const persistence = source("persistence.ts");
    const archive = persistence.slice(persistence.indexOf("async archiveOldReceipts("), persistence.indexOf("  async getArchiveStats("));
    expect(archive).toContain(".limit(ARCHIVE_RECEIPT_PAGE_SIZE)");
    expect(archive).not.toContain("const rows = await tx.select().from(aurionCausalTickReceipts)");
    expect(archive).not.toContain("rows.filter(row => row.tick > coveredUntil)");
    expect(archive).not.toContain("packCausalArchivePayloads(rows.filter");
    expect(archive).toContain("CAUSAL_ARCHIVE_SOURCE_COVERAGE_INCOMPLETE");
    expect(archive).toContain("CAUSAL_ARCHIVE_READBACK_MISMATCH");
  });

  it("pages only checkpoint identifiers and tick numbers and paces pending reconciliation", () => {
    const archiver = source("archivingService.ts");
    const reconciler = source("snapshotReconciliationService.ts");
    expect(archiver).toContain("selectDistinct({ zoneId: aurionCausalCheckpoints.zoneId })");
    expect(archiver).toContain(".limit(32)");
    expect(archiver).toContain("select({ tick: aurionCausalCheckpoints.tick })");
    expect(archiver).not.toContain("db.select().from(aurionCausalCheckpoints)");
    expect(reconciler).toContain("setTimeout(resolve, 10_000)");
  });
});
