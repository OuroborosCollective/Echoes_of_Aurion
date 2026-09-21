import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_CROSS_SHARD_TRANSFER_SCHEMA = "aurion.cross.shard.transfer.v1" as const;

export type CrossShardTransferStatus =
  | "PREPARED"
  | "VERIFIED"
  | "ACCEPTED"
  | "FINALIZED"
  | "REJECTED"
  | "TIMEOUT";

export interface CrossShardTransferEnvelope {
  schema: typeof AURION_CROSS_SHARD_TRANSFER_SCHEMA;
  transferId: string;
  worldId: string;
  entityId: string;
  entityPayload: Record<string, unknown>;
  sourceShardId: string;
  targetShardId: string;
  transferEpoch: number;
  status: CrossShardTransferStatus;
  prepareReceiptHash: string;
  finalizeReceiptHash?: string;
  transferHash: string;
}

export function computeCrossShardTransferHash(
  envelope: Omit<CrossShardTransferEnvelope, "transferHash" | "schema">
): string {
  const structure = {
    schema: AURION_CROSS_SHARD_TRANSFER_SCHEMA,
    transferId: envelope.transferId,
    worldId: envelope.worldId,
    entityId: envelope.entityId,
    entityPayload: envelope.entityPayload,
    sourceShardId: envelope.sourceShardId,
    targetShardId: envelope.targetShardId,
    transferEpoch: envelope.transferEpoch,
    status: envelope.status,
    prepareReceiptHash: envelope.prepareReceiptHash,
    finalizeReceiptHash: envelope.finalizeReceiptHash ?? null,
  };
  return canonicalSha256(structure);
}

export function createCrossShardTransfer(params: {
  transferId: string;
  worldId: string;
  entityId: string;
  entityPayload: Record<string, unknown>;
  sourceShardId: string;
  targetShardId: string;
  transferEpoch: number;
  prepareReceiptHash: string;
}): CrossShardTransferEnvelope {
  const hash = computeCrossShardTransferHash({
    ...params,
    status: "PREPARED",
  });

  return {
    schema: AURION_CROSS_SHARD_TRANSFER_SCHEMA,
    ...params,
    status: "PREPARED",
    transferHash: hash,
  };
}
