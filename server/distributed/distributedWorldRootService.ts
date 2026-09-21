import {
  type DistributedShardRoot,
  type DistributedWorldRoot,
  composeDistributedWorldRoot,
} from "../../shared/aurionDistributedWorldRootContract";

export class DistributedWorldRootService {
  private shardRootsByEpoch: Map<string, DistributedShardRoot[]> = new Map();
  private distributedRootsByEpoch: Map<string, DistributedWorldRoot> = new Map();

  clear(): void {
    this.shardRootsByEpoch.clear();
    this.distributedRootsByEpoch.clear();
  }

  async submitShardRoot(params: {
    worldId: string;
    shardId: string;
    scopeKey: string;
    epoch: number;
    shardRootHash: string;
    receiptCount: number;
  }): Promise<{ accepted: boolean }> {
    const key = `${params.worldId}::${params.epoch}`;
    const list = this.shardRootsByEpoch.get(key) ?? [];

    // Replace if same shard re-submits exact or append
    const filtered = list.filter(s => s.shardId !== params.shardId);
    filtered.push({
      shardId: params.shardId,
      scopeKey: params.scopeKey,
      epoch: params.epoch,
      shardRootHash: params.shardRootHash,
      receiptCount: params.receiptCount,
    });

    this.shardRootsByEpoch.set(key, filtered);
    return { accepted: true };
  }

  async buildDistributedWorldRoot(params: {
    worldId: string;
    epoch: number;
    expectedShardIds?: string[];
  }): Promise<{ status: "MATCH" | "UNPROVABLE"; distributedRoot?: DistributedWorldRoot; reason?: string }> {
    const key = `${params.worldId}::${params.epoch}`;
    const shardRoots = this.shardRootsByEpoch.get(key) ?? [];

    const result = composeDistributedWorldRoot({
      worldId: params.worldId,
      epoch: params.epoch,
      shardRoots,
      expectedShardIds: params.expectedShardIds,
    });

    if (result.status === "MATCH" && result.distributedRoot) {
      this.distributedRootsByEpoch.set(key, result.distributedRoot);
    }

    return result;
  }
}

export const globalDistributedWorldRootService = new DistributedWorldRootService();
