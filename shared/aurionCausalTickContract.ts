import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_CAUSAL_TICK_SCHEMA_V1 = "aurion.causal.tick.v1" as const;
export const AURION_CAUSAL_TICK_SCHEMA_V2 = "aurion.causal.tick.v2" as const;
export const AURION_CAUSAL_TICK_SCHEMA = AURION_CAUSAL_TICK_SCHEMA_V1;
export const AURION_ZONE_RULESET_VERSION = "aurion.zone.rules.v1" as const;

export const AURION_CAUSAL_STAGE_NAMES = [
  "MEMBERSHIP_REVIVAL",
  "MOVEMENT",
  "PLAYER_ACTION",
  "RESOURCE",
  "MOB_FSM",
  "MOB_COMBAT",
  "REGENERATION",
] as const;

export type AurionCausalStageName = (typeof AURION_CAUSAL_STAGE_NAMES)[number];

export interface AurionCausalStageReceipt {
  stageOrdinal: number;
  stageName: AurionCausalStageName | string;
  stageInputIdentity: string;
  canonicalStateHash: string;
  transitionHash: string;
}

export interface AurionCausalTickReceiptV1 {
  schema: typeof AURION_CAUSAL_TICK_SCHEMA_V1;
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

export type AurionCausalTickReceiptUnsignedV1 = Omit<AurionCausalTickReceiptV1, "receiptHash">;

export interface AurionCausalTickReceiptV2 {
  schema: typeof AURION_CAUSAL_TICK_SCHEMA_V2;
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
  stages: readonly AurionCausalStageReceipt[];
  receiptHash: string;
}

export type AurionCausalTickReceiptUnsignedV2 = Omit<AurionCausalTickReceiptV2, "receiptHash">;

export type AurionCausalTickReceipt = AurionCausalTickReceiptV1 | AurionCausalTickReceiptV2;

export function computeReceiptHash(
  receipt:
    | Omit<AurionCausalTickReceiptV1, "receiptHash">
    | Omit<AurionCausalTickReceiptV2, "receiptHash">
    | Record<string, unknown>
): string {
  const { receiptHash: _ignored, ...payload } = receipt as Record<string, unknown>;
  return canonicalSha256(payload);
}
