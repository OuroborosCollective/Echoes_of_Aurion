import { createHash } from "node:crypto";
import type { aurionCausalTickReceipts } from "../../drizzle/aurionCausalitySchema";

export const CAUSAL_ARCHIVE_PACKET_MAX_BYTES = 60 * 1024;
export function archiveReceiptPayload(row: typeof aurionCausalTickReceipts.$inferSelect) {
  return {
    id: row.id, worldId: row.worldId, zoneId: row.zoneId, tick: row.tick, revision: row.revision,
    rulesetVersion: row.rulesetVersion, receiptSchema: row.receiptSchema,
    preStateHash: row.preStateHash, inputHash: row.inputHash,
    inputJson: row.inputJson, stageReceiptsJson: row.stageReceiptsJson,
    transitionHash: row.transitionHash, rngRootHash: row.rngRootHash,
    postStateHash: row.postStateHash, previousReceiptHash: row.previousReceiptHash, receiptHash: row.receiptHash,
  };
}
export type ArchiveReceiptPayload = ReturnType<typeof archiveReceiptPayload>;
export function causalArchiveHash(payloadJson: string): string {
  return createHash("sha256").update(payloadJson, "utf8").digest("hex");
}
/** Stable order and UTF-8 bytes, including array brackets and separating commas. */
export function packCausalArchivePayloads(rows: readonly ArchiveReceiptPayload[]): string[] {
  const packets: string[] = [];
  let packet: string[] = [];
  let bytes = 2;
  for (const row of rows) {
    const json = JSON.stringify(row);
    const size = Buffer.byteLength(json, "utf8");
    if (size + 2 > CAUSAL_ARCHIVE_PACKET_MAX_BYTES) throw new Error(`CAUSAL_ARCHIVE_RECEIPT_TOO_LARGE:${row.tick}`);
    if (bytes + size + (packet.length ? 1 : 0) > CAUSAL_ARCHIVE_PACKET_MAX_BYTES) {
      packets.push(`[${packet.join(",")}]`);
      packet = [];
      bytes = 2;
    }
    bytes += size + (packet.length ? 1 : 0);
    packet.push(json);
  }
  if (packet.length) packets.push(`[${packet.join(",")}]`);
  return packets;
}
