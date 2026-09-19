#!/usr/bin/env tsx
import { globalCrossZoneSyncService } from "../server/causality/crossZoneSynchronizationService";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const transferId = argument("--transfer");
if (!transferId || !/^xfer2_[a-f0-9]{56}$/.test(transferId)) {
  console.error("Usage: pnpm exec tsx scripts/read-aurion-cross-zone-transfer.ts --transfer <xfer2-id>");
  process.exit(64);
}

const explanation = await globalCrossZoneSyncService.explainTransfer(transferId);
if (!explanation) {
  console.error(JSON.stringify({ status: "UNPROVABLE", reason: "CROSS_ZONE_TRANSFER_NOT_FOUND", transferId }));
  process.exit(2);
}

console.log(JSON.stringify({
  schema: "aurion.cross-zone-handover-readback.v1",
  transferId,
  status: explanation.transfer.status,
  owner: explanation.owner,
  chainValid: explanation.chainValid,
  ownerInvariantValid: explanation.ownerInvariantValid,
  resumableAction: explanation.resumableAction,
  receiptHashes: explanation.receipts.map(receipt => ({
    status: receipt.status,
    transferReceiptHash: receipt.transferReceiptHash,
    previousTransferReceiptHash: receipt.previousTransferReceiptHash,
  })),
}, null, 2));

process.exit(explanation.chainValid && explanation.ownerInvariantValid ? 0 : 1);
