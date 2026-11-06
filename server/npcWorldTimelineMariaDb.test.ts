import { createHash } from "node:crypto";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { npcCapsulePin as pin } from "./aurion/npc/authority.js";
import { LIVING_HISTORY_HUBS, executeLivingHistoryCycle } from "./aurion/livingHistoryLoop";
import { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } from "./npcActionGatewayPersistence";
import { resolveAndRecordNpc } from "./wasdAurionRuntime";
import { merchantBootstrapMarkets, merchantInventoryStateHash, merchantMarketStateHash, merchantPolityStateHash, npcIdentity } from "./wasdNpcCapsule";
import { merchantGenesisRequest } from "./aurion/npc/merchantRules";
import { useNpcSharedTableLock } from "./testSupport/npcSharedTableLock";

// Shares the append-only NPC memory/semantic-graph tables with other DB test files.
useNpcSharedTableLock();

// Production 2026-11-05: aurionWorldResolutions holds one row per region and index,
// but merchant actions reused their own per-NPC resolution index as the world index.
// ~23k main-merchant rows occupy indices across all four regions, so a small merchant
// collided at its own index (NPC_ACTION_WORLD_READBACK_MISMATCH / duplicate key) and
// re-failed on every retry. New actions take the next free index of the region timeline.
const suite = process.env.AURION_NPC_ACTION_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const hub = "windhollow" as const;
const npcId = npcIdentity(hub);
const worldRowId = (regionId: string, index: number) => `world_${createHash("sha256").update(`${regionId}\u001f${index}`).digest("hex").slice(0, 58)}`;

suite("merchant world reactions on the region timeline (real MariaDB)", () => {
  let pool: Pool;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
  });
  async function reset() {
    for (const table of [
      "aurionSemanticGraphIndexV2", "aurionSemanticGraphProvenanceV2", "aurionSemanticGraphEdgesV2", "aurionSemanticGraphNodesV2", "aurionSemanticGraphReceiptsV2",
      "aurionNpcControllerShadowReceipts", "aurionNpcControllerBindings",
      "aurionNpcActionMemoryLinks", "aurionNpcActionEffectReadbacks", "aurionNpcActionReceipts", "aurionNpcActionEpochSourceReceipts", "aurionNpcActionConsentReceipts", "aurionNpcActionLeases",
      "aurionSemanticRetrievalIndex", "aurionSemanticProvenance", "aurionSemanticNodes", "aurionSemanticMemoryReceipts",
      "aurionNpcMemoryReceiptsV4", "aurionWorldResolutions", "aurionPolityStates", "aurionNpcActionEpochStates",
    ]) await pool.query(`TRUNCATE TABLE ${table}`);
    const merchants = LIVING_HISTORY_HUBS.map(value => npcIdentity(value));
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?,?,?)", merchants);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?,?,?,?)", merchants);
    for (const hubId of LIVING_HISTORY_HUBS) {
      const market = merchantBootstrapMarkets[hubId], ownerId = `market:${hubId}`;
      const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
      const inventory = { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market, entries }) };
      const polityId = `polity:${hubId}`;
      await pool.query("INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId, true, 0, JSON.stringify(market), merchantMarketStateHash(market), JSON.stringify(inventory), inventory.stateHash, 0, polityId, 72, merchantPolityStateHash({ polityId, version: 0, stability: 72 }), pin.sourceRevision, pin.sourceSha256]);
    }
  }
  // Leave no merchant state behind for suites that expect a fresh NPC store.
  async function cleanup() {
    await reset();
  }
  beforeEach(reset);
  afterAll(async () => { if (pool) { await cleanup(); await pool.end(); } });

  it("acts in a region whose world timeline already holds another actor's row at the merchant's own index", async () => {
    await resolveAndRecordNpc(merchantGenesisRequest(hub));
    const source = (await readConfirmedMerchantActionSource(npcId))!;
    // Another actor's earlier world reaction occupies (windhollow, 1) and (windhollow, 7).
    for (const index of [1, 7]) {
      await pool.query("INSERT INTO aurionWorldResolutions (id,regionId,worldSeedDigest,ruleSetVersion,contentVersion,resolutionIndex,signalsJson,reactionJson,reactionHash) VALUES (?,?,?,?,?,?,?,?,?)",
        [worldRowId(hub, index), hub, "a".repeat(64), "aurion-wasd-rules-v1", "aurion-wasd-content-v1", index, "[]", "{}", createHash("sha256").update(`other-actor:${index}`).digest("hex")]);
    }
    const first = await executeConfirmedMerchantAction({ worldSeed: "world-timeline-test", homeHubId: hub, sourceDecisionReceiptId: source.receiptId });
    expect(first.status).toBe("committed");
    if (first.status !== "committed") throw new Error("ACTION_REQUIRED");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT r.successorWorldReceiptId, w.regionId, w.resolutionIndex FROM aurionNpcActionReceipts r JOIN aurionWorldResolutions w ON w.id=r.successorWorldReceiptId WHERE r.id=?", [first.actionReceiptId]);
    expect(rows[0]).toMatchObject({ regionId: first.resolution.market.hubId, resolutionIndex: first.resolution.market.hubId === hub ? 8 : 0 });
    // The idempotent replay reads the stored world reaction back unchanged.
    expect((await executeConfirmedMerchantAction({ worldSeed: "world-timeline-test", homeHubId: hub, sourceDecisionReceiptId: source.receiptId })).status).toBe("persisted");
    // The merchant keeps acting; every world row stays unique on the region timeline.
    for (let step = 0; step < 5; step++) {
      const next = (await readConfirmedMerchantActionSource(npcId))!;
      expect((await executeConfirmedMerchantAction({ worldSeed: "world-timeline-test", homeHubId: hub, sourceDecisionReceiptId: next.receiptId })).status).toBe("committed");
    }
    const [dupes] = await pool.query<RowDataPacket[]>("SELECT regionId, resolutionIndex, COUNT(*) AS n FROM aurionWorldResolutions GROUP BY regionId, resolutionIndex HAVING n > 1");
    expect(dupes).toEqual([]);
  }, 120_000);

  it("allocates region timeline indices without collisions while the live loop runs all merchants concurrently", async () => {
    // The loop executes every merchant lifecycle concurrently; the allocation must be a
    // locking read, or a waiting transaction reuses its stale snapshot's head index.
    const failures: string[] = [];
    let confirmed = 0;
    for (let cycle = 1; cycle <= 12; cycle++) {
      const result = await executeLivingHistoryCycle(cycle * 600, cycle);
      for (const entry of result.entries) {
        if (entry.status === "confirmed") confirmed += 1;
        else failures.push(`${cycle}:${entry.hubId}:${entry.failureCode}`);
      }
    }
    expect(failures).toEqual([]);
    expect(confirmed).toBe(12 * LIVING_HISTORY_HUBS.length);
    const [dupes] = await pool.query<RowDataPacket[]>("SELECT regionId, resolutionIndex, COUNT(*) AS n FROM aurionWorldResolutions GROUP BY regionId, resolutionIndex HAVING n > 1");
    expect(dupes).toEqual([]);
  }, 600_000);
});
