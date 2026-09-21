import {
  type ShardAuthorityScope,
  type ShardLease,
  createShardLease,
  scopeToKey,
} from "../../shared/aurionShardAuthorityContract";

export class ShardRegistry {
  private leasesByScope: Map<string, ShardLease> = new Map();
  private leasesByShard: Map<string, ShardLease[]> = new Map();

  clear(): void {
    this.leasesByScope.clear();
    this.leasesByShard.clear();
  }

  /**
   * Acquires or renews a shard lease for an authority scope.
   * Enforces strict invariant: authoritative shard owners(scope) <= 1.
   */
  async acquireLease(params: {
    worldId: string;
    shardId: string;
    authorityScope: ShardAuthorityScope;
    currentEpoch: number;
    leaseDurationEpochs?: number;
  }): Promise<{ accepted: boolean; lease?: ShardLease; reason?: string }> {
    const scopeKey = scopeToKey(params.authorityScope);
    const existing = this.leasesByScope.get(scopeKey);

    if (existing) {
      // Check if existing lease is still active and owned by a DIFFERENT shard
      if (existing.leaseExpiresEpoch > params.currentEpoch && existing.shardId !== params.shardId) {
        return {
          accepted: false,
          reason: `DUAL_OWNERSHIP_REJECTED: Scope ${scopeKey} currently leased to ${existing.shardId} until epoch ${existing.leaseExpiresEpoch}`,
        };
      }
    }

    const lease = createShardLease({
      worldId: params.worldId,
      shardId: params.shardId,
      authorityScope: params.authorityScope,
      leaseEpoch: params.currentEpoch,
      leaseDurationEpochs: params.leaseDurationEpochs,
      previousShardReceiptHash: existing?.shardAuthorityHash ?? null,
    });

    this.leasesByScope.set(scopeKey, Object.freeze(lease));

    const shardList = this.leasesByShard.get(params.shardId) ?? [];
    shardList.push(lease);
    this.leasesByShard.set(params.shardId, shardList);

    return { accepted: true, lease };
  }

  getLeaseForScope(scope: ShardAuthorityScope, currentEpoch: number): ShardLease | null {
    const scopeKey = scopeToKey(scope);
    const lease = this.leasesByScope.get(scopeKey);
    if (!lease) return null;
    if (lease.leaseExpiresEpoch <= currentEpoch) return null; // Expired
    return { ...lease };
  }

  getShardForZone(zoneId: string, currentEpoch: number): string | null {
    const lease = this.getLeaseForScope({ type: "zone", zoneId }, currentEpoch);
    return lease ? lease.shardId : null;
  }
}

export const globalShardRegistry = new ShardRegistry();
