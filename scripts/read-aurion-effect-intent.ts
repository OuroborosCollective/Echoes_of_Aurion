#!/usr/bin/env tsx
import { globalAurionEffectJournal } from "../server/effects/aurionEffectJournal";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const effectId = argument("--effect-id");
if (!effectId || !/^sha256:[a-f0-9]{64}$/.test(effectId)) {
  console.error("Usage: pnpm exec tsx scripts/read-aurion-effect-intent.ts --effect-id <sha256:id>");
  process.exit(64);
}

const explanation = await globalAurionEffectJournal.explain(effectId);
if (!explanation) {
  console.error(JSON.stringify({ status: "UNPROVABLE", reason: "EFFECT_INTENT_NOT_FOUND", effectId }));
  process.exit(2);
}

console.log(JSON.stringify({
  schema: "aurion.effect-intent-readback.v1",
  effectId,
  authorityReceiptHash: explanation.intent.authorityReceiptHash,
  effectType: explanation.intent.effectType,
  subjectId: explanation.intent.subjectId,
  ordinal: explanation.intent.ordinal,
  payloadHash: explanation.intent.payloadHash,
  deliveryState: explanation.intent.deliveryState,
  attemptCount: explanation.intent.attemptCount,
  receiptChainValid: explanation.receiptChainValid,
  deliveryReceipts: explanation.receipts.map(receipt => ({
    attempt: receipt.attempt,
    deliveryState: receipt.deliveryState,
    deliveryReceiptHash: receipt.deliveryReceiptHash,
    previousDeliveryReceiptHash: receipt.previousDeliveryReceiptHash,
    providerReceiptHash: receipt.providerReceiptHash,
    errorCode: receipt.errorCode,
  })),
}, null, 2));

process.exit(explanation.receiptChainValid ? 0 : 1);
