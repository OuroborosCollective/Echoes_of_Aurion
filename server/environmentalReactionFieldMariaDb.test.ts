import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { merchantBootstrapMarkets, merchantInventoryStateHash, merchantMarketStateHash, merchantPolityStateHash, npcIdentity, type HubId } from "./wasdNpcCapsule";
import { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } from "./npcActionGatewayPersistence";
import { compileEnvironmentalReactionField } from "./environmentalReactionField";
import { resolveAndRecordNpc, resolveAndRecordWorld } from "./wasdAurionRuntime";

const suite = process.env.AURION_NPC_ACTION_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const homeHub: HubId = "observatory_threshold";
const merchantNpcId = npcIdentity(homeHub);
const neutralNpcId = "environmental-neutral-592";
const hubs = Object.keys(merchantBootstrapMarkets).sort() as HubId[];

function opportunities(tick: number, hub: HubId) {
  const specs = [
    ["safe_hub", "safe"], ["resource", "resource"], ["social", "social"],
    ["reputation", "reputation"], ["market", "market"], ["influence", "influence"],
  ] as const;
  return specs.map(([kind, suffix]) => ({
    id: `aim592-op:${tick}:${suffix}`,
    kind,
    regionId: hub,
    targetId: `aim592-target:${suffix}`,
    benefitBps: 8_000,
    riskBps: 0,
    distanceBps: 0,
    sourceReceiptId: `aim592-source:${tick}`,
    resolutionIndex: tick,
  }));
}

function npcRequest(npcId: string, resolutionIndex: number) {
  return {
    npcId,
    regionId: homeHub,
    resolutionIndex,
    needEvents: [],
    observationIds: [`aim592-observation:${resolutionIndex}`],
    memory: [],
    roleId: "merchant",
    economy: {
      currentHubId: homeHub,
      wealthCopper: 1200,
      hungerBps: 2000,
      fatigueBps: 1500,
      tradeProwessBps: 10_500,
      harvestYieldBps: 10_000,
    },
    opportunities: opportunities(resolutionIndex, homeHub),
  };
}

suite("AIM-592 environmental reaction field MariaDB integration", () => {
  let pool: Pool;
  let isolated = false;

  async function resetEpochs() {
    await pool.query("TRUNCATE TABLE aurionNpcActionEpochStates");
    for (const hubId of hubs) {
      const market = merchantBootstrapMarkets[hubId];
      const ownerId = `market:${hubId}`;
      const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
      const inventory = { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market, entries }) };
      const polityId = `polity:${hubId}`;
      const polityStability = 72;
      const polityVersion = 0;
      await pool.query(
        "INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId, true, 0, JSON.stringify(market), merchantMarketStateHash(market), JSON.stringify(inventory), inventory.stateHash, polityVersion, polityId, polityStability, merchantPolityStateHash({ polityId, version: polityVersion, stability: polityStability }), pin.sourceRevision, pin.sourceSha256],
      );
    }
  }

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    for (const table of [
      "aurionNpcActionMemoryLinks", "aurionNpcActionEffectReadbacks", "aurionNpcActionReceipts",
      "aurionNpcActionEpochSourceReceipts", "aurionNpcActionConsentReceipts", "aurionNpcActionLeases",
      "aurionSemanticGraphIndexV2", "aurionSemanticGraphProvenanceV2", "aurionSemanticGraphEdgesV2",
      "aurionSemanticGraphNodesV2", "aurionSemanticGraphReceiptsV2", "aurionSemanticRetrievalIndex",
      "aurionSemanticProvenance", "aurionSemanticNodes", "aurionSemanticMemoryReceipts", "aurionNpcMemoryReceiptsV4",
      "aurionWorldResolutions", "aurionPolityStates",
    ]) {
      await pool.query(`TRUNCATE TABLE ${table}`);
    }
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?)", [merchantNpcId, neutralNpcId]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?,?)", [merchantNpcId, neutralNpcId]);
    await resetEpochs();
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

  it("moves a real NPC into safety-seeking behavior and then commits through the existing gateway", async () => {
    await resolveAndRecordNpc(npcRequest(merchantNpcId, 0));
    await resolveAndRecordNpc(npcRequest(neutralNpcId, 0));

    const world = await resolveAndRecordWorld({
      worldSeed: "aim592-db-world",
      regionId: homeHub,
      resolutionIndex: 1,
      signals: [
        { id: "aim592-war", kind: "war", regionId: homeHub, magnitude: 1, sourceReceiptId: "aim592-world-receipt", resolutionIndex: 1 },
      ],
    });
    const field = compileEnvironmentalReactionField(world.reaction);
    expect(field.sourceStateHash).toBe(world.reaction.deterministicHash);
    expect(field.hazardQ16).toBe(65_536);

    const neutral = await resolveAndRecordNpc(npcRequest(neutralNpcId, 1));
    const fielded = await resolveAndRecordNpc(npcRequest(merchantNpcId, 1), field);
    expect(neutral.decision.goal).not.toBe("seek_safety");
    expect(fielded.decision.goal).toBe("seek_safety");
    expect(fielded.decision.decisionHash).not.toBe(neutral.decision.decisionHash);

    const source = await readConfirmedMerchantActionSource(merchantNpcId);
    expect(source?.resolutionIndex).toBe(1);
    const [fieldedReceipts] = await pool.query<RowDataPacket[]>("SELECT id,decisionHash FROM aurionNpcDecisionReceipts WHERE npcId=? AND resolutionIndex=1",[merchantNpcId]);
    expect(fieldedReceipts).toHaveLength(1);
    expect(source?.receiptId).toBe(fieldedReceipts[0].id);
    expect(fieldedReceipts[0].decisionHash).toBe(fielded.decision.decisionHash);

    const action = await executeConfirmedMerchantAction({
      worldSeed: "aim592-db-world",
      homeHubId: homeHub,
      sourceDecisionReceiptId: source!.receiptId,
    });
    expect(action.status).toBe("committed");
    if (action.status !== "committed") return;

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT sourceDecisionReceiptId,sourceGoal,sourceGoalHash FROM aurionNpcActionReceipts WHERE id=?",
      [action.actionReceiptId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceDecisionReceiptId).toBe(fieldedReceipts[0].id);
    expect(rows[0].sourceGoal).toBe("seek_safety");
    expect(rows[0].sourceGoalHash).toMatch(/^[a-f0-9]{64}$/);

    const [readbacks] = await pool.query<RowDataPacket[]>(
      "SELECT id,effectsHash,sourceRevision FROM aurionNpcActionEffectReadbacks WHERE actionReceiptId=?",
      [action.actionReceiptId],
    );
    const [links] = await pool.query<RowDataPacket[]>(
      "SELECT effectReadbackId,memoryReceiptId FROM aurionNpcActionMemoryLinks WHERE actionReceiptId=?",
      [action.actionReceiptId],
    );
    expect(readbacks).toHaveLength(1);
    expect(readbacks[0].effectsHash).toBe(action.effectReadbackHash);
    expect(readbacks[0].sourceRevision).toBe(pin.sourceRevision);
    expect(links).toHaveLength(1);
    expect(links[0].effectReadbackId).toBe(readbacks[0].id);
    expect(links[0].memoryReceiptId).toMatch(/^npm4_/);
  });

  it("keeps the same field stable across retries and ignores presentation-only divergence", async () => {
    const world = await resolveAndRecordWorld({
      worldSeed: "aim592-db-world",
      regionId: homeHub,
      resolutionIndex: 1,
      signals: [
        { id: "aim592-hazard", kind: "hazard", regionId: homeHub, magnitude: 0.9, sourceReceiptId: "aim592-world-receipt", resolutionIndex: 1 },
      ],
    });
    const first = compileEnvironmentalReactionField(world.reaction);
    const second = compileEnvironmentalReactionField({ ...world.reaction, presentation: { renderer: "different" } } as typeof world.reaction & { presentation: unknown });
    expect(first.fieldHash).toBe(second.fieldHash);
    const replay = await resolveAndRecordWorld({
      worldSeed: "aim592-db-world",
      regionId: homeHub,
      resolutionIndex: 1,
      signals: [
        { id: "aim592-hazard", kind: "hazard", regionId: homeHub, magnitude: 0.9, sourceReceiptId: "aim592-world-receipt", resolutionIndex: 1 },
      ],
    });
    expect(replay.reaction.deterministicHash).toBe(world.reaction.deterministicHash);
    expect(compileEnvironmentalReactionField(replay.reaction).fieldHash).toBe(first.fieldHash);
  });
});
