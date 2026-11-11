import { describe, expect, it } from "vitest";
import { CAUSAL_ARCHIVE_PACKET_MAX_BYTES, CAUSAL_ARCHIVE_SINGLE_RECEIPT_MAX_BYTES, packCausalArchivePayloads, type ArchiveReceiptPayload } from "./archivePacking";

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
    expect(() => packCausalArchivePayloads([{ tick: 3, inputJson: "🐺".repeat(CAUSAL_ARCHIVE_SINGLE_RECEIPT_MAX_BYTES / 4) } as ArchiveReceiptPayload]))
      .toThrow("CAUSAL_ARCHIVE_RECEIPT_TOO_LARGE:3");
  });
});

it("keeps a large collision receipt as a lossless bounded singleton", () => {
 const ids=Array.from({length:20000},(_,i)=>`aurion-world-assets.v1:${i}:-999999:11`);
 const row={tick:1,stageReceiptsJson:JSON.stringify([{hiddenShippedPlacementIds:ids}])} as ArchiveReceiptPayload;
 const packets=packCausalArchivePayloads([row]);
 expect(Buffer.byteLength(packets[0])).toBeGreaterThan(65535);
 expect(Buffer.byteLength(packets[0])).toBeLessThan(CAUSAL_ARCHIVE_SINGLE_RECEIPT_MAX_BYTES);
 expect(JSON.parse(packets[0])).toEqual([row]);
});
