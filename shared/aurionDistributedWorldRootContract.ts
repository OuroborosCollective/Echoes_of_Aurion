import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_DISTRIBUTED_WORLD_ROOT_SCHEMA = "aurion.distributed.world.root.v1" as const;

export interface DistributedShardRoot {
  shardId: string;
  scopeKey: string;
  epoch: number;
  shardRootHash: string;
  receiptCount: number;
}

export interface DistributedWorldRoot {
  schema: typeof AURION_DISTRIBUTED_WORLD_ROOT_SCHEMA;
  worldId: string;
  epoch: number;
  shardRoots: DistributedShardRoot[];
  distributedWorldRootHash: string;
}

export function computeDistributedWorldRootHash(
  worldId: string,
  epoch: number,
  shardRoots: readonly DistributedShardRoot[]
): string {
  const sorted = [...shardRoots].sort((a, b) => a.shardId.localeCompare(b.shardId));
  const structure = {
    schema: AURION_DISTRIBUTED_WORLD_ROOT_SCHEMA,
    worldId,
    epoch,
    shardRoots: sorted.map(s => ({
      shardId: s.shardId,
      scopeKey: s.scopeKey,
      epoch: s.epoch,
      shardRootHash: s.shardRootHash,
      receiptCount: s.receiptCount,
    })),
  };
  return canonicalSha256(structure);
}

export function composeDistributedWorldRoot(params: {
  worldId: string;
  epoch: number;
  shardRoots: DistributedShardRoot[];
  expectedShardIds?: string[];
}): { status: "MATCH" | "UNPROVABLE"; distributedRoot?: DistributedWorldRoot; reason?: string } {
  if (params.expectedShardIds) {
    const presentShardIds = new Set(params.shardRoots.map(s => s.shardId));
    for (const expected of params.expectedShardIds) {
      if (!presentShardIds.has(expected)) {
        return {
          status: "UNPROVABLE",
          reason: `MISSING_SHARD_ROOT:${expected}`,
        };
      }
    }
  }

  const hash = computeDistributedWorldRootHash(params.worldId, params.epoch, params.shardRoots);
  const sortedRoots = [...params.shardRoots].sort((a, b) => a.shardId.localeCompare(b.shardId));

  return {
    status: "MATCH",
    distributedRoot: {
      schema: AURION_DISTRIBUTED_WORLD_ROOT_SCHEMA,
      worldId: params.worldId,
      epoch: params.epoch,
      shardRoots: sortedRoots,
      distributedWorldRootHash: hash,
    },
  };
}
