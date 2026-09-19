import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } from "./npcActionGatewayPersistence";
import { resolveAndRecordNpc } from "./wasdAurionRuntime";
import {
  merchantBootstrapMarkets,
  merchantInventoryStateHash,
  merchantMarketStateHash,
  merchantPolityStateHash,
  npcIdentity,
  type HubId,
} from "./wasdNpcCapsule";

const suite=process.env.AURION_NPC_ACTION_E2E==="1"&&process.env.DATABASE_URL?describe:describe.skip;
const homeHub:HubId="observatory_threshold";
const npcId=npcIdentity(homeHub);
const hubs=Object.keys(merchantBootstrapMarkets).sort() as HubId[];

function opportunities(tick:number, hub:HubId) {
  return [
    ["safe_hub","safe"],["resource","resource"],["social","social"],
    ["reputation","reputation"],["market","market"],["influence","influence"],
  ].map(([kind,suffix])=>({
    id:`db-op:${tick}:${suffix}`,kind,regionId:hub,targetId:`target:${suffix}`,
    benefitBps:8_000,riskBps:0,distanceBps:0,sourceReceiptId:`db-evidence:${tick}`,resolutionIndex:tick,
  }));
}

function sourceRequest(resolutionIndex:number) {
  return {
    npcId,regionId:homeHub,resolutionIndex,
    needEvents:[],observationIds:[`aim293-source:${resolutionIndex}`],memory:[],roleId:"merchant",
    economy:{currentHubId:homeHub,wealthCopper:1200,hungerBps:2000,fatigueBps:1500,tradeProwessBps:10500,harvestYieldBps:10000},
    opportunities:opportunities(resolutionIndex,homeHub),
  };
}

suite("Wave 2 Step 26 AIM-293 actual MariaDB host transaction",()=>{
  let pool:Pool;
  let isolated=false;

  async function resetEpochs() {
    await pool.query("TRUNCATE TABLE aurionNpcActionEpochStates");
    for(const hubId of hubs){
      const market=merchantBootstrapMarkets[hubId];
      const ownerId=`market:${hubId}`;
      const entries=Object.entries(market.stock).map(([itemId,quantity])=>({itemId,quantity,capacity:1_000_000}));
      const inventory={ownerId,entries,stateHash:merchantInventoryStateHash({ownerId,market,entries})};
      const polityId=`polity:${hubId}`;
      const polityStability=72;
      const polityVersion=0;
      await pool.query(
        "INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId,true,0,JSON.stringify(market),merchantMarketStateHash(market),JSON.stringify(inventory),inventory.stateHash,polityVersion,polityId,polityStability,merchantPolityStateHash({polityId,version:polityVersion,stability:polityStability}),pin.sourceRevision,pin.sourceSha256],
      );
    }
  }

  async function cleanup() {
    if(!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    for(const table of [
      "aurionNpcActionMemoryLinks","aurionNpcActionEffectReadbacks","aurionNpcActionReceipts",
      "aurionNpcActionConsentReceipts","aurionNpcActionLeases",
      "aurionSemanticRetrievalIndex","aurionSemanticProvenance","aurionSemanticNodes","aurionSemanticMemoryReceipts",
      "aurionNpcMemoryReceiptsV4","aurionWorldResolutions","aurionPolityStates",
    ]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId=?",[npcId]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId=?",[npcId]);
    await resetEpochs();
  }

  async function seedSource() {
    const result=await resolveAndRecordNpc(sourceRequest(0));
    expect(result.multiMemory?.lastResolutionIndex).toBe(0);
    const source=await readConfirmedMerchantActionSource(npcId);
    if(!source) throw new Error("SOURCE_FIXTURE_REQUIRED");
    expect(source.resolutionIndex).toBe(0);
    return source;
  }

  async function counts() {
    const names=[
      "aurionNpcActionReceipts","aurionNpcActionEffectReadbacks","aurionNpcActionMemoryLinks",
      "aurionNpcActionConsentReceipts","aurionNpcActionLeases","aurionNpcMemoryReceiptsV4",
    ];
    const out:Record<string,number>={};
    for(const name of names){
      const [rows]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${name}`);
      out[name]=Number(rows[0]?.n??0);
    }
    return out;
  }

  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);
    if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool=createPool(process.env.DATABASE_URL!);
    const [rows]=await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if(rows[0]?.name!==url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated=true;
  });
  beforeEach(cleanup);
  afterAll(async()=>{if(pool){if(isolated)await cleanup();await pool.end();}});

  it("commits action, effects, real readback and only then the successor memory link",async()=>{
    const source=await seedSource();
    const result=await executeConfirmedMerchantAction({worldSeed:"aim293-db-world",homeHubId:homeHub,sourceDecisionReceiptId:source.receiptId});
    expect(result.status).toBe("committed");
    if(result.status!=="committed"&&result.status!=="persisted") return;
    expect(result.npc.decision.resolutionIndex).toBe(1);
    expect(result.npc.multiMemory.lastResolutionIndex).toBe(1);
    expect(result.effectReadbackHash).toMatch(/^[a-f0-9]{64}$/);

    const [actions]=await pool.query<RowDataPacket[]>("SELECT * FROM aurionNpcActionReceipts WHERE id=?",[result.actionReceiptId]);
    const [readbacks]=await pool.query<RowDataPacket[]>("SELECT * FROM aurionNpcActionEffectReadbacks WHERE actionReceiptId=?",[result.actionReceiptId]);
    const [links]=await pool.query<RowDataPacket[]>("SELECT * FROM aurionNpcActionMemoryLinks WHERE actionReceiptId=?",[result.actionReceiptId]);
    expect(actions).toHaveLength(1);expect(readbacks).toHaveLength(1);expect(links).toHaveLength(1);
    expect(readbacks[0].effectsHash).toBe(actions[0].effectsHash);
    expect(readbacks[0].sourceRevision).toBe(pin.sourceRevision);
    expect(links[0].effectReadbackId).toBe(readbacks[0].id);
    expect(links[0].memoryReceiptId).toMatch(/^npm4_/);
    const [memory]=await pool.query<RowDataPacket[]>("SELECT resolutionIndex FROM aurionNpcMemoryReceiptsV4 WHERE id=?",[links[0].memoryReceiptId]);
    expect(memory.map(row=>row.resolutionIndex)).toEqual([1]);
  });

  it("editorial deny is idempotent and produces zero gameplay effects",async()=>{
    const source=await seedSource();
    const input={worldSeed:"aim293-db-world",homeHubId:homeHub,sourceDecisionReceiptId:source.receiptId,consent:{verdict:"DENY" as const,policyVersion:"editorial-test-v1"}};
    const first=await executeConfirmedMerchantAction(input);
    const retry=await executeConfirmedMerchantAction(input);
    expect(first).toEqual(retry);
    expect(first.status).toBe("denied");
    const value=await counts();
    expect(value.aurionNpcActionReceipts).toBe(0);
    expect(value.aurionNpcActionEffectReadbacks).toBe(0);
    expect(value.aurionNpcActionMemoryLinks).toBe(0);
    expect(value.aurionNpcActionLeases).toBe(0);
    expect(value.aurionNpcActionConsentReceipts).toBe(1);
    expect(value.aurionNpcMemoryReceiptsV4).toBe(1);
    const [state]=await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex FROM aurionNpcStates WHERE npcId=?",[npcId]);
    expect(state[0].lastResolutionIndex).toBe(0);
    const [epoch]=await pool.query<RowDataPacket[]>("SELECT marketVersion FROM aurionNpcActionEpochStates WHERE hubId=?",[homeHub]);
    expect(epoch[0].marketVersion).toBe(0);
    await expect(executeConfirmedMerchantAction({...input,consent:{verdict:"ALLOW",policyVersion:"editorial-test-v1"}})).rejects.toThrow("CONSENT_CONFLICT");
  });

  for(const failureInjection of ["after_epoch_effect","before_effect_readback","before_memory_commit"] as const){
    it(`rolls back the entire action transaction on ${failureInjection}`,async()=>{
      const source=await seedSource();
      await expect(executeConfirmedMerchantAction({worldSeed:"aim293-db-world",homeHubId:homeHub,sourceDecisionReceiptId:source.receiptId,failureInjection})).rejects.toThrow("AIM293_FORCED");
      const value=await counts();
      expect(value.aurionNpcActionReceipts).toBe(0);
      expect(value.aurionNpcActionEffectReadbacks).toBe(0);
      expect(value.aurionNpcActionMemoryLinks).toBe(0);
      expect(value.aurionNpcActionConsentReceipts).toBe(0);
      expect(value.aurionNpcActionLeases).toBe(0);
      expect(value.aurionNpcMemoryReceiptsV4).toBe(1);
      const [state]=await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex FROM aurionNpcStates WHERE npcId=?",[npcId]);
      expect(state[0].lastResolutionIndex).toBe(0);
      const [decision]=await pool.query<RowDataPacket[]>("SELECT resolutionIndex FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex",[npcId]);
      expect(decision.map(row=>row.resolutionIndex)).toEqual([0]);
      const [epoch]=await pool.query<RowDataPacket[]>("SELECT DISTINCT marketVersion FROM aurionNpcActionEpochStates");
      expect(epoch.map(row=>row.marketVersion)).toEqual([0]);
    });
  }

  it("serializes concurrent retries to one committed receipt and exact persisted readbacks",async()=>{
    const source=await seedSource();
    const input={worldSeed:"aim293-db-world",homeHubId:homeHub,sourceDecisionReceiptId:source.receiptId} as const;
    const results=await Promise.all([0,1,2,3].map(()=>executeConfirmedMerchantAction(input)));
    expect(results.filter(result=>result.status==="committed")).toHaveLength(1);
    expect(results.filter(result=>result.status==="persisted")).toHaveLength(3);
    const ids=results.flatMap(result=>result.status==="committed"||result.status==="persisted"?[result.actionReceiptId]:[]);
    expect(new Set(ids).size).toBe(1);
    const value=await counts();
    expect(value.aurionNpcActionReceipts).toBe(1);
    expect(value.aurionNpcActionEffectReadbacks).toBe(1);
    expect(value.aurionNpcActionMemoryLinks).toBe(1);
    expect(value.aurionNpcMemoryReceiptsV4).toBe(2);
  });

  it("fails closed on persisted source/capsule drift before action mutation",async()=>{
    const source=await seedSource();
    await pool.query("UPDATE aurionNpcActionEpochStates SET sourceRevision=REPEAT('0',40) WHERE hubId=?",[homeHub]);
    await expect(executeConfirmedMerchantAction({worldSeed:"aim293-db-world",homeHubId:homeHub,sourceDecisionReceiptId:source.receiptId})).rejects.toThrow("SOURCE_DRIFT");
    const value=await counts();
    expect(value.aurionNpcActionReceipts).toBe(0);
    expect(value.aurionNpcActionEffectReadbacks).toBe(0);
    expect(value.aurionNpcActionMemoryLinks).toBe(0);
    expect(value.aurionNpcMemoryReceiptsV4).toBe(1);
  });
});
