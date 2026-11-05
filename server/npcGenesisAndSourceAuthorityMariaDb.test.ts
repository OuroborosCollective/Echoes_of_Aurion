import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Switchable only to record a decision under a pin outside the documented lineage;
// every other test in this file runs under the real current pin.
const authorityState = vi.hoisted(() => ({ unknown: false, revision: "e".repeat(40), sha256: "f".repeat(64) }));
vi.mock("./aurion/npc/authority.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./aurion/npc/authority.js")>();
  const current = () => authorityState.unknown
    ? { sourceRevision: authorityState.revision, sourceSha256: authorityState.sha256 }
    : { sourceRevision: actual.npcCapsulePin.sourceRevision, sourceSha256: actual.npcCapsulePin.sourceSha256 };
  return {
    ...actual,
    npcAuthority: () => Object.freeze({ rulesetVersion: actual.WASD_NPC_MEMORY_RULESET, ...current() }),
    npcCapsulePin: { ...actual.npcCapsulePin, get sourceRevision() { return current().sourceRevision; }, get sourceSha256() { return current().sourceSha256; } },
  };
});

const { npcCapsulePin: pin } = await import("./aurion/npc/authority.js");
const { LIVING_HISTORY_HUBS, executeLivingHistoryCycle } = await import("./aurion/livingHistoryLoop");
const { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } = await import("./npcActionGatewayPersistence");
const { resolveAndRecordNpc } = await import("./wasdAurionRuntime");
const { merchantBootstrapMarkets, merchantInventoryStateHash, merchantMarketStateHash, merchantPolityStateHash, npcIdentity } = await import("./wasdNpcCapsule");
const { merchantGenesisRequest } = await import("./aurion/npc/merchantRules");

const suite = process.env.AURION_NPC_ACTION_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const npcIds = LIVING_HISTORY_HUBS.map(hub => npcIdentity(hub));

suite("NPC genesis and recorded source authority (real MariaDB)", () => {
  let pool: Pool;
  let isolated = false;

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    authorityState.unknown = false;
    for (const table of ["aurionNpcControllerShadowReceipts", "aurionNpcControllerBindings", 
      "aurionSemanticGraphIndexV2", "aurionSemanticGraphProvenanceV2", "aurionSemanticGraphEdgesV2", "aurionSemanticGraphNodesV2", "aurionSemanticGraphReceiptsV2",
      "aurionNpcGuildReceipts", "aurionNpcGuildMemberships", "aurionNpcGuildStates",
      "aurionNpcActionMemoryLinks", "aurionNpcActionEffectReadbacks", "aurionNpcActionReceipts", "aurionNpcActionEpochSourceReceipts", "aurionNpcActionConsentReceipts", "aurionNpcActionLeases",
      "aurionSemanticRetrievalIndex", "aurionSemanticProvenance", "aurionSemanticNodes", "aurionSemanticMemoryReceipts",
      "aurionNpcMemoryReceiptsV4", "aurionWorldResolutions", "aurionPolityStates", "aurionNpcActionEpochStates",
    ]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?,?,?)", npcIds);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?,?,?,?)", npcIds);
    for (const hubId of LIVING_HISTORY_HUBS) {
      const market = merchantBootstrapMarkets[hubId], ownerId = `market:${hubId}`;
      const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
      const inventory = { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market, entries }) };
      const polityId = `polity:${hubId}`;
      await pool.query(
        "INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId, true, 0, JSON.stringify(market), merchantMarketStateHash(market), JSON.stringify(inventory), inventory.stateHash, 0, polityId, 72,
          merchantPolityStateHash({ polityId, version: 0, stability: 72 }), pin.sourceRevision, pin.sourceSha256],
      );
    }
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(cleanup);
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });

  it("records one deterministic genesis decision for every never-started hub merchant, which acts in the next cycle", async () => {
    // Production since 2026-09: three hub merchants had no decision and were permanently skipped.
    const first = await executeLivingHistoryCycle(600, 1);
    expect(first.entries.map(entry => [entry.hubId, entry.status, entry.resolutionIndex, entry.action])).toEqual(
      LIVING_HISTORY_HUBS.map(hub => [hub, "confirmed", 0, null]));
    for (const npcId of npcIds) expect((await readConfirmedMerchantActionSource(npcId))?.resolutionIndex).toBe(0);

    const second = await executeLivingHistoryCycle(1200, 2);
    expect(second.entries.every(entry => entry.status === "confirmed" && entry.resolutionIndex === 1 && entry.action !== null && entry.actionReceiptId !== null)).toBe(true);
    const [decisions] = await pool.query<RowDataPacket[]>("SELECT npcId, COUNT(*) AS n FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?,?,?) GROUP BY npcId", npcIds);
    expect(decisions.map(row => Number(row.n))).toEqual([2, 2, 2, 2]);
  });

  it("never re-enters genesis for an NPC that already has recorded state", async () => {
    await resolveAndRecordNpc(merchantGenesisRequest("windhollow"));
    const [before] = await pool.query<RowDataPacket[]>("SELECT id FROM aurionNpcDecisionReceipts WHERE npcId=?", [npcIdentity("windhollow")]);
    await executeLivingHistoryCycle(600, 1);
    const [after] = await pool.query<RowDataPacket[]>("SELECT id, resolutionIndex FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex", [npcIdentity("windhollow")]);
    expect(after[0].id).toBe(before[0].id);
    expect(after.map(row => row.resolutionIndex)).toEqual([0, 1]);
  });

  it("rejects an action source whose decision was recorded under a pin outside the documented lineage", async () => {
    const npcId = npcIdentity("observatory_threshold");
    authorityState.unknown = true;
    await resolveAndRecordNpc(merchantGenesisRequest("observatory_threshold"));
    const [recorded] = await pool.query<RowDataPacket[]>("SELECT sourceRevision FROM aurionNpcMemoryReceiptsV4 WHERE npcId=?", [npcId]);
    expect(recorded.map(row => row.sourceRevision)).toEqual([authorityState.revision]);
    authorityState.unknown = false;
    const source = await readConfirmedMerchantActionSource(npcId);
    if (!source) throw new Error("GENESIS_SOURCE_REQUIRED");
    // The old check compared the decision's always-current stamp and could never fail here.
    await expect(executeConfirmedMerchantAction({ worldSeed: "source-authority-world", homeHubId: "observatory_threshold", sourceDecisionReceiptId: source.receiptId }))
      .rejects.toThrow("NPC_ACTION_SOURCE_CAPSULE_DRIFT");
    const [actions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionNpcActionReceipts WHERE npcId=?", [npcId]);
    expect(Number(actions[0].n)).toBe(0);
  });

  it("rejects an action source without its NPC memory record", async () => {
    const npcId = npcIdentity("observatory_threshold");
    await resolveAndRecordNpc(merchantGenesisRequest("observatory_threshold"));
    const source = await readConfirmedMerchantActionSource(npcId);
    if (!source) throw new Error("GENESIS_SOURCE_REQUIRED");
    // Memory rows are append-only; lift the delete guard only in this isolated test database.
    const [[trigger]] = await pool.query<RowDataPacket[]>("SHOW CREATE TRIGGER aurionNpcMemoryReceiptsV4_no_delete") as unknown as [RowDataPacket[]];
    const statement = String(trigger["SQL Original Statement"]);
    await pool.query("DROP TRIGGER aurionNpcMemoryReceiptsV4_no_delete");
    try { await pool.query("DELETE FROM aurionNpcMemoryReceiptsV4 WHERE sourceDecisionReceiptId=?", [source.receiptId]); }
    finally { await pool.query(statement); }
    await expect(executeConfirmedMerchantAction({ worldSeed: "source-authority-world", homeHubId: "observatory_threshold", sourceDecisionReceiptId: source.receiptId }))
      .rejects.toThrow("NPC_ACTION_SOURCE_MEMORY_RECORD_REQUIRED");
  });
});
