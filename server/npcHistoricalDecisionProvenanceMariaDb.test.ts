import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Production regression (2026-11-03): the merchant's memory was recorded under the
// earlier NPC capsule pin 002e7c35. After the pin moved to the current revision, the
// next action re-read its historical source decision, stamped it with the current
// authority and collided with the recorded memory provenance of the same receipt:
// NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT. The NPC has not advanced since.
const authorityState = vi.hoisted(() => ({
  historical: false,
  revision: "002e7c35309816cd043295f47398e52fdb388694",
  sha256: "7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f",
}));
vi.mock("./aurion/npc/authority.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./aurion/npc/authority.js")>();
  const current = () => authorityState.historical
    ? { sourceRevision: authorityState.revision, sourceSha256: authorityState.sha256 }
    : { sourceRevision: actual.npcCapsulePin.sourceRevision, sourceSha256: actual.npcCapsulePin.sourceSha256 };
  return {
    ...actual,
    npcAuthority: () => Object.freeze({ rulesetVersion: actual.WASD_NPC_MEMORY_RULESET, ...current() }),
    npcCapsulePin: {
      ...actual.npcCapsulePin,
      get sourceRevision() { return current().sourceRevision; },
      get sourceSha256() { return current().sourceSha256; },
    },
  };
});

const { npcCapsulePin: pin } = await import("./aurion/npc/authority.js");
const { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } = await import("./npcActionGatewayPersistence");
const { resolveAndRecordNpc } = await import("./wasdAurionRuntime");
const { merchantBootstrapMarkets, merchantInventoryStateHash, merchantMarketStateHash, merchantPolityStateHash, npcIdentity } = await import("./wasdNpcCapsule");
type HubId = keyof typeof merchantBootstrapMarkets;

const suite = process.env.AURION_NPC_ACTION_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const homeHub: HubId = "observatory_threshold";
const npcId = npcIdentity(homeHub);
const hubs = Object.keys(merchantBootstrapMarkets).sort() as HubId[];

function sourceRequest(resolutionIndex: number) {
  const specs = [["safe_hub", "safe"], ["resource", "resource"], ["social", "social"], ["reputation", "reputation"], ["market", "market"], ["influence", "influence"]] as const;
  return {
    npcId, regionId: homeHub, resolutionIndex, needEvents: [], observationIds: [`historical-source:${resolutionIndex}`], memory: [], roleId: "merchant",
    economy: { currentHubId: homeHub, wealthCopper: 1200, hungerBps: 2000, fatigueBps: 1500, tradeProwessBps: 10500, harvestYieldBps: 10000 },
    opportunities: specs.map(([kind, suffix]) => ({ id: `historical-op:${resolutionIndex}:${suffix}`, kind, regionId: homeHub, targetId: `historical-target:${suffix}`, benefitBps: 8_000, riskBps: 0, distanceBps: 0, sourceReceiptId: `historical-evidence:${resolutionIndex}`, resolutionIndex })),
  };
}

suite("historical NPC decision provenance across a capsule pin change (real MariaDB)", () => {
  let pool: Pool;
  let isolated = false;

  async function resetEpochs() {
    await pool.query("TRUNCATE TABLE aurionNpcActionEpochStates");
    for (const hubId of hubs) {
      const market = merchantBootstrapMarkets[hubId], ownerId = `market:${hubId}`;
      const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
      const inventory = { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market, entries }) };
      const polityId = `polity:${hubId}`, polityStability = 72, polityVersion = 0;
      await pool.query(
        "INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId, true, 0, JSON.stringify(market), merchantMarketStateHash(market), JSON.stringify(inventory), inventory.stateHash, polityVersion, polityId, polityStability,
          merchantPolityStateHash({ polityId, version: polityVersion, stability: polityStability }), pin.sourceRevision, pin.sourceSha256],
      );
    }
  }
  async function truncateGraphV2() {
    for (const table of ["aurionSemanticGraphIndexV2", "aurionSemanticGraphProvenanceV2", "aurionSemanticGraphEdgesV2", "aurionSemanticGraphNodesV2", "aurionSemanticGraphReceiptsV2"]) await pool.query(`TRUNCATE TABLE ${table}`);
  }
  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    authorityState.historical = false;
    await truncateGraphV2();
    for (const table of [
      "aurionNpcActionMemoryLinks", "aurionNpcActionEffectReadbacks", "aurionNpcActionReceipts", "aurionNpcActionEpochSourceReceipts", "aurionNpcActionConsentReceipts", "aurionNpcActionLeases",
      "aurionSemanticRetrievalIndex", "aurionSemanticProvenance", "aurionSemanticNodes", "aurionSemanticMemoryReceipts",
      "aurionNpcMemoryReceiptsV4", "aurionWorldResolutions", "aurionPolityStates",
    ]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId=?", [npcId]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId=?", [npcId]);
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

  it("advances from a decision recorded under the previous pin and keeps its recorded provenance", async () => {
    // Record the source decision and its memory under the previous capsule pin.
    authorityState.historical = true;
    await resetEpochs();
    const seeded = await resolveAndRecordNpc(sourceRequest(0));
    expect(seeded.multiMemory?.lastResolutionIndex).toBe(0);
    const [memoryRows] = await pool.query<RowDataPacket[]>("SELECT sourceRevision FROM aurionNpcMemoryReceiptsV4 WHERE npcId=?", [npcId]);
    expect(memoryRows.map(row => row.sourceRevision)).toEqual([authorityState.revision]);
    // As in production: no graph V2 receipt exists from the previous pin.
    await truncateGraphV2();

    // The runtime now runs under the current pin and acts on that historical decision.
    authorityState.historical = false;
    await resetEpochs();
    const source = await readConfirmedMerchantActionSource(npcId);
    if (!source) throw new Error("HISTORICAL_SOURCE_FIXTURE_REQUIRED");
    const action = await executeConfirmedMerchantAction({ worldSeed: "historical-pin-world", homeHubId: homeHub, sourceDecisionReceiptId: source.receiptId });
    expect(action.status).toBe("committed");

    // The historical decision keeps the authority recorded with it; only new evidence carries the current pin.
    const [refs] = await pool.query<RowDataPacket[]>(
      "SELECT DISTINCT provenanceKind, provenanceId, sourceRevision FROM aurionSemanticGraphProvenanceV2 WHERE provenanceKind='decision_receipt' AND provenanceId=?",
      [source.receiptId],
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every(row => row.sourceRevision === authorityState.revision)).toBe(true);
  });
});
