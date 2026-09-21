import { describe, it, expect, beforeEach } from "vitest";
import { ShardRegistry } from "./shardRegistry";
import { CrossShardHandoverService } from "./crossShardHandoverService";
import { DistributedWorldRootService } from "./distributedWorldRootService";
import { DistributedReplayService, type DistributedReplayInput } from "./distributedReplayService";

describe("Aurion Distributed World & Shard Causality (Steps 42-45)", () => {
  let shardRegistry: ShardRegistry;
  let handoverService: CrossShardHandoverService;
  let rootService: DistributedWorldRootService;
  let replayService: DistributedReplayService;

  const WORLD_ID = "echoes-of-aurion-global";

  beforeEach(() => {
    shardRegistry = new ShardRegistry();
    handoverService = new CrossShardHandoverService(shardRegistry);
    rootService = new DistributedWorldRootService();
    replayService = new DistributedReplayService();
  });

  it("Step 42: Enforces single-owner invariant: authoritative shard owners(scope) <= 1", async () => {
    // Shard 1 claims zone:ember_mine
    const lease1 = await shardRegistry.acquireLease({
      worldId: WORLD_ID,
      shardId: "shard_eu_1",
      authorityScope: { type: "zone", zoneId: "ember_mine" },
      currentEpoch: 100,
      leaseDurationEpochs: 50,
    });
    expect(lease1.accepted).toBe(true);

    // Shard 2 attempts to claim SAME zone while lease 1 is active -> REJECTED
    const lease2 = await shardRegistry.acquireLease({
      worldId: WORLD_ID,
      shardId: "shard_us_1",
      authorityScope: { type: "zone", zoneId: "ember_mine" },
      currentEpoch: 120,
      leaseDurationEpochs: 50,
    });
    expect(lease2.accepted).toBe(false);
    expect(lease2.reason).toContain("DUAL_OWNERSHIP_REJECTED");
  });

  it("Step 43: Executes 3-step Cross-Shard Handover deterministically", async () => {
    // Step 1: Prepare
    const prep = await handoverService.prepareTransfer({
      transferId: "tx_player_100",
      worldId: WORLD_ID,
      entityId: "player_lyra",
      entityPayload: { hp: 100, pos: { x: 50, y: 0, z: 50 } },
      sourceShardId: "shard_1",
      targetShardId: "shard_2",
      transferEpoch: 100,
      prepareReceiptHash: "sha256:r_prep_100",
    });
    expect(prep.accepted).toBe(true);
    expect(prep.envelope.status).toBe("PREPARED");

    // Step 2: Target Accepts
    const accept = await handoverService.targetAcceptTransfer("tx_player_100", 101);
    expect(accept.accepted).toBe(true);
    expect(accept.envelope.status).toBe("ACCEPTED");

    // Step 3: Source Finalizes
    const finalize = await handoverService.sourceFinalizeTransfer("tx_player_100", "sha256:r_fin_102");
    expect(finalize.accepted).toBe(true);
    expect(finalize.envelope.status).toBe("FINALIZED");
    expect(finalize.envelope.finalizeReceiptHash).toBe("sha256:r_fin_102");
  });

  it("Step 44: Distributed World Root composition and UNPROVABLE on missing shard", async () => {
    await rootService.submitShardRoot({
      worldId: WORLD_ID,
      shardId: "shard_1",
      scopeKey: "zone:zone_a",
      epoch: 50,
      shardRootHash: "sha256:root_shard_1_hash",
      receiptCount: 10,
    });

    // Requesting composite root with expected shards [shard_1, shard_2] when shard_2 is missing
    const res = await rootService.buildDistributedWorldRoot({
      worldId: WORLD_ID,
      epoch: 50,
      expectedShardIds: ["shard_1", "shard_2"],
    });

    expect(res.status).toBe("UNPROVABLE");
    expect(res.reason).toBe("MISSING_SHARD_ROOT:shard_2");

    // Provide shard_2
    await rootService.submitShardRoot({
      worldId: WORLD_ID,
      shardId: "shard_2",
      scopeKey: "zone:zone_b",
      epoch: 50,
      shardRootHash: "sha256:root_shard_2_hash",
      receiptCount: 8,
    });

    const successRes = await rootService.buildDistributedWorldRoot({
      worldId: WORLD_ID,
      epoch: 50,
      expectedShardIds: ["shard_1", "shard_2"],
    });

    expect(successRes.status).toBe("MATCH");
    expect(successRes.distributedRoot?.distributedWorldRootHash).toBeDefined();
    expect(successRes.distributedRoot?.shardRoots.length).toBe(2);
  });

  it("Step 45: Distributed Replay reconstructs identical distributed root digests", async () => {
    const input: DistributedReplayInput = {
      worldId: WORLD_ID,
      epochs: [1, 2, 3],
      shards: [
        {
          shardId: "shard_alpha",
          zoneId: "zone_alpha",
          epochRoots: {
            1: "sha256:alpha_root_1",
            2: "sha256:alpha_root_2",
            3: "sha256:alpha_root_3",
          },
        },
        {
          shardId: "shard_beta",
          zoneId: "zone_beta",
          epochRoots: {
            1: "sha256:beta_root_1",
            2: "sha256:beta_root_2",
            3: "sha256:beta_root_3",
          },
        },
      ],
      transfers: [
        {
          transferId: "tx_1_to_2",
          entityId: "player_hero",
          sourceShardId: "shard_alpha",
          targetShardId: "shard_beta",
          epoch: 2,
          prepareReceipt: "sha256:r_prep_2",
          finalizeReceipt: "sha256:r_fin_2",
        },
      ],
    };

    const run1 = await replayService.replayDistributedHistory(input);
    const run2 = await replayService.replayDistributedHistory(input);

    expect(run1.status).toBe("HEALTHY");
    expect(run1.replayDigest).toBe(run2.replayDigest);
    expect(Object.keys(run1.reconstructedRoots).length).toBe(3);
  });
});
