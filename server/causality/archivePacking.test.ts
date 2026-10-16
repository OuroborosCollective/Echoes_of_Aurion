import { describe, expect, it } from "vitest";
import { CAUSAL_ARCHIVE_PACKET_MAX_BYTES, packCausalArchivePayloads, type ArchiveReceiptPayload } from "./archivePacking";

describe("causal archive UTF-8 packet boundaries", () => {
  it("counts multibyte text and preserves every payload in source order", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ tick: i + 1, inputJson: "⚙️🐺".repeat(2000) } as ArchiveReceiptPayload));
    const first = packCausalArchivePayloads(rows);
    expect(first.length).toBeGreaterThan(1);
    expect(first.every(packet => Buffer.byteLength(packet, "utf8") <= CAUSAL_ARCHIVE_PACKET_MAX_BYTES)).toBe(true);
    expect(first.flatMap(packet => JSON.parse(packet))).toEqual(rows);
    expect(packCausalArchivePayloads(rows)).toEqual(first);
  });
  it("rejects one oversized payload instead of truncating it", () => {
    expect(() => packCausalArchivePayloads([{ tick: 3, inputJson: "🐺".repeat(16000) } as ArchiveReceiptPayload]))
      .toThrow("CAUSAL_ARCHIVE_RECEIPT_TOO_LARGE:3");
  });
});
