import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_CAUSAL_TICK_SCHEMA = "aurion.causal.tick.v1" as const;
export const AURION_ZONE_RULESET_VERSION = "aurion.zone.rules.v2" as const;

export interface AurionCausalTickReceipt {
  schema: typeof AURION_CAUSAL_TICK_SCHEMA;
  worldId: string;
  zoneId: string;
  tick: number;
  sourceRevision: string;
  rulesetVersion: string;
  previousReceiptHash: string | null;
  preStateHash: string;
  orderedIntentHash: string;
  transitionHash: string;
  rngRootHash: string;
  postStateHash: string;
  receiptHash: string;
}

export function computeReceiptHash(
  receipt: Omit<AurionCausalTickReceipt, "receiptHash">
): string {
  const payload = {
    schema: receipt.schema,
    worldId: receipt.worldId,
    zoneId: receipt.zoneId,
    tick: receipt.tick,
    sourceRevision: receipt.sourceRevision,
    rulesetVersion: receipt.rulesetVersion,
    previousReceiptHash: receipt.previousReceiptHash,
    preStateHash: receipt.preStateHash,
    orderedIntentHash: receipt.orderedIntentHash,
    transitionHash: receipt.transitionHash,
    rngRootHash: receipt.rngRootHash,
    postStateHash: receipt.postStateHash,
  };
  return canonicalSha256(payload);
}
