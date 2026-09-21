import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { type DistributedWorldRoot } from "../../shared/aurionDistributedWorldRootContract";
import { DistributedWorldRootService } from "./distributedWorldRootService";
import { ShardRegistry } from "./shardRegistry";
import { CrossShardHandoverService } from "./crossShardHandoverService";

export interface DistributedReplayInput {
  worldId: string;
  epochs: number[];
  shards: {
    shardId: string;
    zoneId: string;
    epochRoots: Record<number, string>;
  }[];
  transfers: {
    transferId: string;
    entityId: string;
    sourceShardId: string;
    targetShardId: string;
    epoch: number;
    prepareReceipt: string;
    finalizeReceipt: string;
  }[];
}

export interface DistributedReplayOutput {
  worldId: string;
  reconstructedRoots: Record<number, DistributedWorldRoot>;
  replayDigest: string;
  status: "HEALTHY" | "PARTITIONED" | "UNPROVABLE";
  reason?: string;
}

export class DistributedReplayService {
  /**
   * Deterministically reconstructs distributed world state across epochs from authoritative inputs.
   */
  async replayDistributedHistory(input: DistributedReplayInput): Promise<DistributedReplayOutput> {
    const rootService = new DistributedWorldRootService();
    const shardRegistry = new ShardRegistry();
    const handoverService = new CrossShardHandoverService(shardRegistry);

    const reconstructedRoots: Record<number, DistributedWorldRoot> = {};
    const expectedShardIds = input.shards.map(s => s.shardId).sort();

    // 1. Establish Shard Leases
    for (const shard of input.shards) {
      await shardRegistry.acquireLease({
        worldId: input.worldId,
        shardId: shard.shardId,
        authorityScope: { type: "zone", zoneId: shard.zoneId },
        currentEpoch: input.epochs[0] ?? 0,
      });
    }

    // 2. Replay Epochs
    for (const epoch of input.epochs) {
      // Ingest shard roots for this epoch
      for (const shard of input.shards) {
        const rootHash = shard.epochRoots[epoch];
        if (!rootHash) {
          return {
            worldId: input.worldId,
            reconstructedRoots,
            replayDigest: "",
            status: "UNPROVABLE",
            reason: `MISSING_EPOCH_ROOT:${shard.shardId}:epoch_${epoch}`,
          };
        }

        await rootService.submitShardRoot({
          worldId: input.worldId,
          shardId: shard.shardId,
          scopeKey: `zone:${shard.zoneId}`,
          epoch,
          shardRootHash: rootHash,
          receiptCount: 1,
        });
      }

      // Replay any transfers happening at this epoch
      const epochTransfers = input.transfers.filter(t => t.epoch === epoch);
      for (const t of epochTransfers) {
        await handoverService.prepareTransfer({
          transferId: t.transferId,
          worldId: input.worldId,
          entityId: t.entityId,
          entityPayload: { entityId: t.entityId },
          sourceShardId: t.sourceShardId,
          targetShardId: t.targetShardId,
          transferEpoch: t.epoch,
          prepareReceiptHash: t.prepareReceipt,
        });

        await handoverService.targetAcceptTransfer(t.transferId, epoch);
        await handoverService.sourceFinalizeTransfer(t.transferId, t.finalizeReceipt);
      }

      // Build composite distributed world root
      const composite = await rootService.buildDistributedWorldRoot({
        worldId: input.worldId,
        epoch,
        expectedShardIds,
      });

      if (composite.status !== "MATCH" || !composite.distributedRoot) {
        return {
          worldId: input.worldId,
          reconstructedRoots,
          replayDigest: "",
          status: "UNPROVABLE",
          reason: composite.reason,
        };
      }

      reconstructedRoots[epoch] = composite.distributedRoot;
    }

    const replayDigest = canonicalSha256(
      Object.entries(reconstructedRoots).map(([ep, r]) => ({
        epoch: Number(ep),
        rootHash: r.distributedWorldRootHash,
      }))
    );

    return {
      worldId: input.worldId,
      reconstructedRoots,
      replayDigest,
      status: "HEALTHY",
    };
  }
}

export const globalDistributedReplayService = new DistributedReplayService();
