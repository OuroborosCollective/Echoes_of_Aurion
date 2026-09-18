import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_CAUSAL_TICK_SCHEMA_V1 = "aurion.causal.tick.v1" as const;
/** Backward-compatible alias: v1 semantics and hash payload are frozen. */
export const AURION_CAUSAL_TICK_SCHEMA = AURION_CAUSAL_TICK_SCHEMA_V1;
export const AURION_CAUSAL_TICK_SCHEMA_V2 = "aurion.causal.tick.v2" as const;

/**
 * B5 deliberately keeps live default at v1 until migration 0049 persists the
 * v2 stage envelope. B3 flips this constant only after schema/apply evidence.
 */
export const AURION_ACTIVE_CAUSAL_TICK_SCHEMA:
  | typeof AURION_CAUSAL_TICK_SCHEMA_V1
  | typeof AURION_CAUSAL_TICK_SCHEMA_V2 = AURION_CAUSAL_TICK_SCHEMA_V1;

export const AURION_ZONE_RULESET_VERSION = "aurion.zone.rules.v2" as const;

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
  stageName: AurionCausalStageName;
  stageOrdinal: number;
  stageInputIdentity: string;
  canonicalStateHash: string;
  transitionHash: string;
}

interface AurionCausalTickReceiptCommon {
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

export interface AurionCausalTickReceiptV1 extends AurionCausalTickReceiptCommon {
  schema: typeof AURION_CAUSAL_TICK_SCHEMA_V1;
}

export interface AurionCausalTickReceiptV2 extends AurionCausalTickReceiptCommon {
  schema: typeof AURION_CAUSAL_TICK_SCHEMA_V2;
  stages: readonly AurionCausalStageReceipt[];
}

export type AurionCausalTickReceipt = AurionCausalTickReceiptV1 | AurionCausalTickReceiptV2;
export type AurionCausalTickReceiptUnsignedV1 = Omit<AurionCausalTickReceiptV1, "receiptHash">;
export type AurionCausalTickReceiptUnsignedV2 = Omit<AurionCausalTickReceiptV2, "receiptHash">;
export type AurionCausalTickReceiptUnsigned =
  | AurionCausalTickReceiptUnsignedV1
  | AurionCausalTickReceiptUnsignedV2;

export function computeCausalStageReceipt(input: {
  stageName: AurionCausalStageName;
  stageOrdinal: number;
  tick: number;
  previousCanonicalStateHash: string;
  orderedIntentHash: string;
  canonicalStateHash: string;
}): AurionCausalStageReceipt {
  const stageInputIdentity = canonicalSha256({
    schema: "aurion.causal.stage-input.v2",
    tick: input.tick,
    stageName: input.stageName,
    stageOrdinal: input.stageOrdinal,
    previousCanonicalStateHash: input.previousCanonicalStateHash,
    orderedIntentHash: input.orderedIntentHash,
  });
  const transitionHash = canonicalSha256({
    schema: "aurion.causal.stage-transition.v2",
    tick: input.tick,
    stageName: input.stageName,
    stageOrdinal: input.stageOrdinal,
    stageInputIdentity,
    previousCanonicalStateHash: input.previousCanonicalStateHash,
    canonicalStateHash: input.canonicalStateHash,
  });
  return Object.freeze({
    stageName: input.stageName,
    stageOrdinal: input.stageOrdinal,
    stageInputIdentity,
    canonicalStateHash: input.canonicalStateHash,
    transitionHash,
  });
}

function commonReceiptPayload(receipt: AurionCausalTickReceiptUnsigned | AurionCausalTickReceipt) {
  return {
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
}

export function computeReceiptHash(
  receipt: AurionCausalTickReceiptUnsigned | AurionCausalTickReceipt
): string {
  const payload = commonReceiptPayload(receipt);

  // The v1 branch is intentionally byte-for-byte equivalent to the historical
  // canonical payload. Never add fields here.
  if (receipt.schema === AURION_CAUSAL_TICK_SCHEMA_V1) {
    return canonicalSha256(payload);
  }

  if (receipt.schema !== AURION_CAUSAL_TICK_SCHEMA_V2) {
    throw new Error("AURION_CAUSAL_RECEIPT_SCHEMA_UNSUPPORTED");
  }
  if (!Array.isArray(receipt.stages) || receipt.stages.length !== AURION_CAUSAL_STAGE_NAMES.length) {
    throw new Error("AURION_CAUSAL_V2_STAGE_SET_INVALID");
  }
  for (let index = 0; index < AURION_CAUSAL_STAGE_NAMES.length; index += 1) {
    const stage = receipt.stages[index];
    if (stage.stageName !== AURION_CAUSAL_STAGE_NAMES[index] || stage.stageOrdinal !== index + 1) {
      throw new Error("AURION_CAUSAL_V2_STAGE_ORDER_INVALID");
    }
  }
  return canonicalSha256({
    ...payload,
    stages: receipt.stages.map(stage => ({
      stageName: stage.stageName,
      stageOrdinal: stage.stageOrdinal,
      stageInputIdentity: stage.stageInputIdentity,
      canonicalStateHash: stage.canonicalStateHash,
      transitionHash: stage.transitionHash,
    })),
  });
}
