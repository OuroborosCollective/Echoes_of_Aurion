import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_SHARD_LEASE_SCHEMA = "aurion.shard.lease.v1" as const;

export type ShardAuthorityScope =
  | { type: "zone"; zoneId: string }
  | { type: "entityRange"; minEntityId: string; maxEntityId: string };

export interface ShardLease {
  schema: typeof AURION_SHARD_LEASE_SCHEMA;
  worldId: string;
  shardId: string;
  authorityScope: ShardAuthorityScope;
  leaseEpoch: number;
  leaseExpiresEpoch: number;
  previousShardReceiptHash: string | null;
  shardAuthorityHash: string;
}

export function computeShardAuthorityHash(
  lease: Omit<ShardLease, "shardAuthorityHash" | "schema">
): string {
  const structure = {
    schema: AURION_SHARD_LEASE_SCHEMA,
    worldId: lease.worldId,
    shardId: lease.shardId,
    authorityScope: lease.authorityScope,
    leaseEpoch: lease.leaseEpoch,
    leaseExpiresEpoch: lease.leaseExpiresEpoch,
    previousShardReceiptHash: lease.previousShardReceiptHash,
  };
  return canonicalSha256(structure);
}

export function createShardLease(params: {
  worldId: string;
  shardId: string;
  authorityScope: ShardAuthorityScope;
  leaseEpoch: number;
  leaseDurationEpochs?: number;
  previousShardReceiptHash?: string | null;
}): ShardLease {
  const leaseDuration = params.leaseDurationEpochs ?? 100;
  const leaseExpiresEpoch = params.leaseEpoch + leaseDuration;
  const previousShardReceiptHash = params.previousShardReceiptHash ?? null;

  const hash = computeShardAuthorityHash({
    worldId: params.worldId,
    shardId: params.shardId,
    authorityScope: params.authorityScope,
    leaseEpoch: params.leaseEpoch,
    leaseExpiresEpoch,
    previousShardReceiptHash,
  });

  return {
    schema: AURION_SHARD_LEASE_SCHEMA,
    worldId: params.worldId,
    shardId: params.shardId,
    authorityScope: params.authorityScope,
    leaseEpoch: params.leaseEpoch,
    leaseExpiresEpoch,
    previousShardReceiptHash,
    shardAuthorityHash: hash,
  };
}

export function scopeToKey(scope: ShardAuthorityScope): string {
  if (scope.type === "zone") {
    return `zone:${scope.zoneId}`;
  }
  return `range:${scope.minEntityId}..${scope.maxEntityId}`;
}
