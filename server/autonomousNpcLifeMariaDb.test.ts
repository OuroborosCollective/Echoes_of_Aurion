import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTONOMOUS_NPC_LIFE_NPC_ID, createAutonomousNpcLifeRuntime } from "./autonomousNpcLifeRuntime";
import { resolveAndRecordNpc, resolveAndRecordWorld } from "./wasdAurionRuntime";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { merchantBootstrapMarkets, merchantInventoryStateHash, merchantMarketStateHash, merchantPolityStateHash, type HubId } from "./wasdNpcCapsule";
import type { WorldSignal } from "./wasdAurionProtocol";

const suite = process.env.AURION_NPC_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const hubs = ["observatory_threshold","windhollow","emberfall","cinder_vault"] as const;

function opportunities(tick:number, hub:HubId) {
  return [
    ["safe_hub","safe"],["resource","resource"],["social","social"],
    ["reputation","reputation"],["market","market"],["influence","influence"],
  ].map(([kind,suffix])=>({
    id:`autonomous-op:${tick}:${suffix}`,kind,regionId:hub,targetId:`target:${suffix}`,
    benefitBps:8_000,riskBps:0,distanceBps:0,sourceReceiptId:`autonomous-source:${tick}`,resolutionIndex:tick,
  }));
}

async function seedConfirmedSource() {
  return resolveAndRecordNpc({
    npcId:AUTONOMOUS_NPC_LIFE_NPC_ID,
    regionId:AUTONOMOUS_NPC_LIFE_HOME_REGION,
    resolutionIndex:0,
    needEvents:[],
    observationIds:["autonomous-source:0"],
    memory:[],
    roleId:"merchant",
    economy:{currentHubId:AUTONOMOUS_NPC_LIFE_HOME_REGION,wealthCopper:1200,hungerBps:2000,fatigueBps:1500,tradeProwessBps:10500,harvestYieldBps:10000},
    opportunities:opportunities(0,AUTONOMOUS_NPC_LIFE_HOME_REGION),
  });
}

suite("AIM-263 autonomous NPC life in isolated MariaDB", () => {
  let pool: Pool;
  let isolated = false;

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    for (const table of ["aurionNpcActionMemoryLinks","aurionNpcActionEffectReadbacks","aurionNpcActionReceipts","aurionNpcActionConsentReceipts","aurionNpcActionLeases","aurionSemanticRetrievalIndex","aurionSemanticProvenance","aurionSemanticNodes","aurionSemanticMemoryReceipts","aurionNpcMemoryReceiptsV4"]) {
      await pool.query(`TRUNCATE TABLE ${table}`);
    }
    await pool.query("TRUNCATE TABLE aurionNpcActionEpochStates");
    for (const hubId of hubs) {
      const market=merchantBootstrapMarkets[hubId];
      const ownerId=`market:${hubId}`;
      const entries=Object.entries(market.stock).map(([itemId,quantity])=>({itemId,quantity,capacity:1_000_000}));
      const inventory={ownerId,entries,stateHash:merchantInventoryStateHash({ownerId,market,entries})};
      const polityId=`polity:${hubId}`;
      await pool.query("INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId,true,0,JSON.stringify(market),merchantMarketStateHash(market),JSON.stringify(inventory),inventory.stateHash,0,polityId,72,merchantPolityStateHash({polityId,version:0,stability:72}),pin.sourceRevision,pin.sourceSha256]);
    }
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId=?",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId=?",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    await pool.query("DELETE FROM aurionWorldResolutions WHERE regionId IN (?,?,?,?) AND resolutionIndex BETWEEN 0 AND 20",hubs);
    await pool.query("DELETE FROM aurionPolityStates WHERE polityId IN (?,?,?,?)",hubs.map(hub => `polity:${hub}`));
  }

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (!rows[0].name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(cleanup);
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });

  it("continues from the exact confirmed receipt across runtime recreation instead of resetting the NPC", async () => {
    await seedConfirmedSource();
    const firstRuntime = createAutonomousNpcLifeRuntime({ enabled: true });
    await firstRuntime.resolveOnce({ tick: 600 });
    const first = firstRuntime.readback();
    expect(first).toMatchObject({ status: "confirmed", lastGatewayTick: 600, lastResolutionIndex: 1, worldRegionId: "observatory_threshold", npcReceiptSource: "created", worldReceiptSource: "created" });
    expect(first.decisionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.lifeStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.worldReactionHash).toMatch(/^[a-f0-9]{64}$/);

    const restartedRuntime = createAutonomousNpcLifeRuntime({ enabled: true });
    await restartedRuntime.resolveOnce({ tick: 600 });
    const second = restartedRuntime.readback();
    expect(second.status).toBe("confirmed");
    expect(second.lastResolutionIndex).toBe(2);
    expect(second.decisionHash).not.toBe(first.decisionHash);
    expect(typeof second.worldRegionId).toBe("string");
    expect(hubs).toContain(second.worldRegionId as (typeof hubs)[number]);

    const [receipts] = await pool.query<RowDataPacket[]>("SELECT resolutionIndex,observationIdsJson FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    expect(receipts).toHaveLength(3);
    expect(receipts.map(row => row.resolutionIndex)).toEqual([0,1,2]);
    expect(receipts.every(row => JSON.parse(row.observationIdsJson).version === "aurion-npc-decision.v3")).toBe(true);

    const [state] = await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex,memoryJson FROM aurionNpcStates WHERE npcId=?",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    expect(state[0].lastResolutionIndex).toBe(2);
    expect(JSON.parse(state[0].memoryJson).version).toBe("aurion-npc-memory.v2");
  });

  it("serializes queued gateway observations and rejects cadence/order violations", async () => {
    await seedConfirmedSource();
    const runtime = createAutonomousNpcLifeRuntime({ enabled: true });
    await expect(runtime.observe({ tick: 599 })).rejects.toThrow("NOT_ON_CADENCE");
    const one = runtime.observe({ tick: 600 });
    const two = runtime.observe({ tick: 1200 });
    await Promise.all([one,two]);
    expect(runtime.readback()).toMatchObject({ status: "confirmed", lastGatewayTick: 1200, lastResolutionIndex: 2 });
    await expect(runtime.observe({ tick: 1200 })).rejects.toThrow("OUT_OF_ORDER");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT resolutionIndex FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex",[AUTONOMOUS_NPC_LIFE_NPC_ID]);
    expect(rows.map(row => row.resolutionIndex)).toEqual([0,1,2]);
  });

  it("deduplicates concurrent world receipts by region/resolution and rejects a conflicting retry", async () => {
    const signal: WorldSignal = { id: "autonomous-world:signal", kind: "economy", regionId: "observatory_threshold", magnitude: .2, sourceReceiptId: "autonomous-world:receipt", resolutionIndex: 9 };
    const request = { worldSeed: "autonomous-world-test", regionId: "observatory_threshold", resolutionIndex: 9, signals: [signal] } as const;
    const results = await Promise.all([0,1,2,3].map(() => resolveAndRecordWorld(request)));
    expect(results.filter(result => result.source === "created")).toHaveLength(1);
    expect(new Set(results.map(result => result.reaction.deterministicHash)).size).toBe(1);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id,reactionHash FROM aurionWorldResolutions WHERE regionId=? AND resolutionIndex=?",[request.regionId,request.resolutionIndex]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^world_[a-f0-9]{58}$/);
    await expect(resolveAndRecordWorld({ ...request, signals: [{ ...signal, magnitude: .3 }] })).rejects.toThrow("INPUT_CONFLICT");
    const [after] = await pool.query<RowDataPacket[]>("SELECT reactionHash FROM aurionWorldResolutions WHERE regionId=? AND resolutionIndex=?",[request.regionId,request.resolutionIndex]);
    expect(after).toHaveLength(1);
    expect(after[0].reactionHash).toBe(rows[0].reactionHash);
  });
});
