import type { QuestReceipt } from "../../shared/aurionQuestContract";

export function findQuestReceiptReplay(
  receipts: Iterable<QuestReceipt>,
  instanceId: string,
  idempotencyKey: string,
): QuestReceipt | undefined {
  for (const receipt of receipts) {
    if (receipt.instanceId === instanceId && receipt.idempotencyKey === idempotencyKey) {
      return receipt;
    }
  }
  return undefined;
}

export function maxQuestReceiptSequence(
  receipts: Iterable<QuestReceipt>,
  instanceId: string,
): number {
  let maximum = 0;
  for (const receipt of receipts) {
    if (receipt.instanceId === instanceId) {
      maximum = Math.max(maximum, receipt.eventSequence);
    }
  }
  return maximum;
}
