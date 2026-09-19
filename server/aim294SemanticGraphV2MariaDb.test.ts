import { execFileSync } from "node:child_process";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aurionNpcMemoryReceiptsV4 } from "../drizzle/schema";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { getDb } from "./db";
import { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } from "./npcActionGatewayPersistence";
import { readNpcMultiMemoryForDecision, readPreviousNpcMultiMemory } from "./npcMultiMemoryPersistence";
import {
  appendNpcSemanticGraphV2,
  readConfirmedNpcSemanticGraphPacket,
  readVerifiedNpcSemanticGraphV2,
  rebuildSemanticGraphIndexV2,
} from "./wasdSemanticGraphV2Persistence";
import { resolveAndRecordNpc } from "./wasdAurionRuntime";
import {
  merchantBootstrapMarkets,
  merchantInventoryStateHash,
  merchantMarketStateHash,
  merchantPolityStateHash,
  npcHash,
  npcIdentity,
  type HubId,
} from "./wasdNpcCapsule";
import { decodeOwnedNpcSemanticGraphs } from "../shared/npcSemanticGraphReadmodel";

const suite=process.env.AURION_NPC_ACTION_E2E==="1"&&process.env.DATABASE_URL?describe:describe.skip;
const homeHub:HubId="observatory_threshold";
const npcId=npcIdentity(homeHub);
const hubs=Object.keys(merchantBootstrapMarkets).sort() as HubId[];

function opportunities(tick:number,hub:HubId){
  const specs=[["safe_hub","safe"],["resource","resource"],["social","social"],["reputation","reputation"],["market","market"],["influence","influence"]] as const;
  return specs.map(([kind,suffix])=>({id:`aim294-op:${tick}:${suffix}`,kind,regionId:hub,targetId:`aim294-target:${suffix}`,benefitBps:8_000,riskBps:0,distanceBps:0,sourceReceiptId:`aim294-evidence:${tick}`,resolutionIndex:tick}));
}
function sourceRequest(resolutionIndex:number){
  return {npcId,regionId:homeHub,resolutionIndex,needEvents:[],observationIds:[`aim294-source:${resolutionIndex}`],memory:[],roleId:"merchant",
    economy:{currentHubId:homeHub,wealthCopper:1200,hungerBps:2000,fatigueBps:1500,tradeProwessBps:10500,harvestYieldBps:10000},
    opportunities:opportunities(resolutionIndex,homeHub)};
}

suite("Wave 2 Step 27 AIM-294 real MariaDB semantic graph v2",()=>{
  let pool:Pool;
  let isolated=false;

  async function resetEpochs(){
    await pool.query("TRUNCATE TABLE aurionNpcActionEpochStates");
    for(const hubId of hubs){
      const market=merchantBootstrapMarkets[hubId],ownerId=`market:${hubId}`;
      const entries=Object.entries(market.stock).map(([itemId,quantity])=>({itemId,quantity,capacity:1_000_000}));
      const inventory={ownerId,entries,stateHash:merchantInventoryStateHash({ownerId,market,entries})};
      const polityId=`polity:${hubId}`,polityStability=72,polityVersion=0;
      await pool.query(
        "INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId,true,0,JSON.stringify(market),merchantMarketStateHash(market),JSON.stringify(inventory),inventory.stateHash,polityVersion,polityId,polityStability,merchantPolityStateHash({polityId,version:polityVersion,stability:polityStability}),pin.sourceRevision,pin.sourceSha256],
      );
    }
  }
  async function truncateGraphV2(){
    for(const table of ["aurionSemanticGraphIndexV2","aurionSemanticGraphProvenanceV2","aurionSemanticGraphEdgesV2","aurionSemanticGraphNodesV2","aurionSemanticGraphReceiptsV2"]) await pool.query(`TRUNCATE TABLE ${table}`);
  }
  async function cleanup(){
    if(!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await truncateGraphV2();
    for(const table of [
      "aurionNpcActionMemoryLinks","aurionNpcActionEffectReadbacks","aurionNpcActionReceipts","aurionNpcActionConsentReceipts","aurionNpcActionLeases",
      "aurionSemanticRetrievalIndex","aurionSemanticProvenance","aurionSemanticNodes","aurionSemanticMemoryReceipts",
      "aurionNpcMemoryReceiptsV4","aurionWorldResolutions","aurionPolityStates",
    ]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId=?",[npcId]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId=?",[npcId]);
    await resetEpochs();
  }
  async function seedSource(){
    const result=await resolveAndRecordNpc(sourceRequest(0));
    expect(result.multiMemory?.lastResolutionIndex).toBe(0);
    const source=await readConfirmedMerchantActionSource(npcId);
    if(!source) throw new Error("AIM294_SOURCE_FIXTURE_REQUIRED");
    return source;
  }
  async function graphCounts(){
    const result:Record<string,number>={};
    for(const table of ["aurionSemanticGraphReceiptsV2","aurionSemanticGraphNodesV2","aurionSemanticGraphEdgesV2","aurionSemanticGraphProvenanceV2","aurionSemanticGraphIndexV2"]){
      const [rows]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table}`);
      result[table]=Number(rows[0]?.n??0);
    }
    return result;
  }
  async function confirmedAt(index:number){
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
    return db.transaction(async tx=>{
      const confirmed=await readPreviousNpcMultiMemory(tx,npcId,index);
      if(!confirmed)throw new Error("AIM294_MEMORY_REQUIRED");
      return confirmed;
    });
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

  it("persists one exact merged-source graph with full node/edge provenance readback",async()=>{
    await seedSource();
    const [receipts]=await pool.query<RowDataPacket[]>("SELECT * FROM aurionSemanticGraphReceiptsV2 WHERE npcId=?",[npcId]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({generation:0,sourceRevision:pin.sourceRevision,sourceSha256:pin.sourceSha256,capsuleManifestSha256:pin.manifestSha256});
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
    const confirmed=await db.transaction(tx=>readVerifiedNpcSemanticGraphV2(tx,npcId));
    expect(confirmed?.graph.graphHash).toBe(receipts[0].graphHash);
    expect(confirmed?.graph.edges.some(edge=>edge.kind==="performed_action")).toBe(false);
    const [nodes]=await pool.query<RowDataPacket[]>("SELECT id FROM aurionSemanticGraphNodesV2 WHERE graphReceiptId=?",[receipts[0].id]);
    const [edges]=await pool.query<RowDataPacket[]>("SELECT id FROM aurionSemanticGraphEdgesV2 WHERE graphReceiptId=?",[receipts[0].id]);
    for(const element of [...nodes.map(row=>["node",row.id] as const),...edges.map(row=>["edge",row.id] as const)]){
      const [provenance]=await pool.query<RowDataPacket[]>("SELECT provenanceKind,sourceRevision FROM aurionSemanticGraphProvenanceV2 WHERE graphReceiptId=? AND elementType=? AND elementId=?",[receipts[0].id,element[0],element[1]]);
      expect(provenance.length).toBeGreaterThan(0);
      expect(provenance.every(row=>row.sourceRevision===pin.sourceRevision)).toBe(true);
    }
  });

  it("creates performed_action only after the confirmed AIM-293 ActionReceipt EffectReadback MemoryLink chain",async()=>{
    const source=await seedSource();
    const before=decodeOwnedNpcSemanticGraphs(await readConfirmedNpcSemanticGraphPacket(7),7);
    const beforeGraph=before.graphs.find(graph=>graph.npcId===npcId);
    expect(beforeGraph?.relations.some(edge=>edge.kind==="performed_action")).toBe(false);
    expect(beforeGraph?.generation).toBe(0);
    const action=await executeConfirmedMerchantAction({worldSeed:"aim294-db-world",homeHubId:homeHub,sourceDecisionReceiptId:source.receiptId});
    expect(action.status).toBe("committed");
    if(action.status!=="committed"&&action.status!=="persisted") return;
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
    const confirmed=await db.transaction(tx=>readVerifiedNpcSemanticGraphV2(tx,npcId));
    expect(confirmed?.graph.generation).toBe(1);
    expect(confirmed?.graph.previousGraphHash).toBe(beforeGraph?.graphHash);
    expect(confirmed?.row.previousGraphHash).toBe(beforeGraph?.graphHash);
    expect(confirmed?.graph.edges.filter(edge=>edge.kind==="performed_action")).toHaveLength(1);
    const performed=confirmed?.graph.edges.find(edge=>edge.kind==="performed_action");
    expect(performed?.provenance.map(value=>value.kind)).toEqual(expect.arrayContaining(["decision_receipt","action_receipt","effect_readback","memory_link"]));
    const packet=decodeOwnedNpcSemanticGraphs(await readConfirmedNpcSemanticGraphPacket(7),7);
    const projected=packet.graphs.find(graph=>graph.npcId===npcId);
    expect(projected?.provenanceStatus).toBe("VERIFIED");
    expect(JSON.stringify(projected)).not.toContain("provenanceId");
    expect(JSON.stringify(projected)).not.toContain("actionReceiptId");
  });

  for(const failureInjection of ["after_receipt","after_node","after_edge","after_provenance","before_readback"] as const){
    it(`rolls back every V2 graph subwrite on ${failureInjection}`,async()=>{
      await seedSource();
      const memory=await confirmedAt(0);
      await truncateGraphV2();
      const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
      await expect(db.transaction(tx=>appendNpcSemanticGraphV2(tx,memory,{failureInjection}))).rejects.toThrow("AIM294_FORCED");
      expect(await graphCounts()).toEqual({
        aurionSemanticGraphReceiptsV2:0,aurionSemanticGraphNodesV2:0,aurionSemanticGraphEdgesV2:0,aurionSemanticGraphProvenanceV2:0,aurionSemanticGraphIndexV2:0,
      });
    });
  }

  it("is idempotent for an identical generation and fails closed on a conflicting duplicate",async()=>{
    await seedSource();
    const memory=await confirmedAt(0);
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
    const first=await db.transaction(tx=>appendNpcSemanticGraphV2(tx,memory));
    const second=await db.transaction(tx=>appendNpcSemanticGraphV2(tx,memory));
    expect(second.row.id).toBe(first.row.id);
    expect((await graphCounts()).aurionSemanticGraphReceiptsV2).toBe(1);

    await truncateGraphV2();
    await pool.query(
      "INSERT INTO aurionSemanticGraphReceiptsV2 (id,npcId,generation,graphVersion,retrievalVersion,memoryReceiptId,sourceRevision,sourceSha256,capsuleManifestSha256,previousGraphHash,graphHash,graphJson,receiptHash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["smg2_"+"1".repeat(59),npcId,0,"wasd-npc-semantic-graph.v2","wasd-npc-semantic-retrieval.v1","npm4_"+"9".repeat(58),pin.sourceRevision,pin.sourceSha256,pin.manifestSha256,null,"0".repeat(64),"{}","0".repeat(64)],
    );
    await expect(db.transaction(tx=>appendNpcSemanticGraphV2(tx,memory))).rejects.toThrow("CONFLICTING_DUPLICATE");
  });

  it("rejects a generation rewind and a structurally stored fake graph",async()=>{
    await seedSource();
    await resolveAndRecordNpc(sourceRequest(1));
    const oldMemory=await (async()=>{
      const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
      return db.transaction(async tx=>{
        const row=(await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.resolutionIndex,0)).limit(1))[0];
        if(!row)throw new Error("OLD_MEMORY_ROW_REQUIRED");
        const value=await readNpcMultiMemoryForDecision(tx,row.sourceDecisionReceiptId);
        if(!value)throw new Error("OLD_MEMORY_REQUIRED");
        return value;
      });
    })();
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
    await expect(db.transaction(tx=>appendNpcSemanticGraphV2(tx,oldMemory))).rejects.toThrow("GENERATION_REGRESSION");

    await truncateGraphV2();
    const core={version:"aurion-semantic-graph-receipt.v2",id:"smg2_"+"2".repeat(59),npcId,generation:1,graphVersion:"wasd-npc-semantic-graph.v2",retrievalVersion:"wasd-npc-semantic-retrieval.v1",memoryReceiptId:(await confirmedAt(1)).row.id,sourceRevision:pin.sourceRevision,sourceSha256:pin.sourceSha256,capsuleManifestSha256:pin.manifestSha256,previousGraphHash:null,graphHash:"3".repeat(64)};
    await pool.query(
      "INSERT INTO aurionSemanticGraphReceiptsV2 (id,npcId,generation,graphVersion,retrievalVersion,memoryReceiptId,sourceRevision,sourceSha256,capsuleManifestSha256,previousGraphHash,graphHash,graphJson,receiptHash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [core.id,core.npcId,core.generation,core.graphVersion,core.retrievalVersion,core.memoryReceiptId,core.sourceRevision,core.sourceSha256,core.capsuleManifestSha256,core.previousGraphHash,core.graphHash,"{}",npcHash(core)],
    );
    await expect(db.transaction(tx=>readVerifiedNpcSemanticGraphV2(tx,npcId))).rejects.toThrow(/NPC_SEMANTIC_GRAPH_/);
  });

  it("fails closed when a persisted successor loses its canonical predecessor row",async()=>{
    await seedSource();
    await resolveAndRecordNpc(sourceRequest(1));
    const [rows]=await pool.query<RowDataPacket[]>("SELECT * FROM aurionSemanticGraphReceiptsV2 WHERE npcId=? ORDER BY generation",[npcId]);
    expect(rows.map(row=>row.generation)).toEqual([0,1]);
    expect(rows[1].previousGraphHash).toBe(rows[0].graphHash);

    const successor={...rows[1]};
    delete successor.createdAt;
    await truncateGraphV2();
    await pool.query(
      "INSERT INTO aurionSemanticGraphReceiptsV2 (id,npcId,generation,graphVersion,retrievalVersion,memoryReceiptId,sourceRevision,sourceSha256,capsuleManifestSha256,previousGraphHash,graphHash,graphJson,receiptHash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [successor.id,successor.npcId,successor.generation,successor.graphVersion,successor.retrievalVersion,successor.memoryReceiptId,successor.sourceRevision,successor.sourceSha256,successor.capsuleManifestSha256,successor.previousGraphHash,successor.graphHash,successor.graphJson,successor.receiptHash],
    );
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");
    await expect(db.transaction(tx=>readVerifiedNpcSemanticGraphV2(tx,npcId))).rejects.toThrow("NPC_SEMANTIC_GRAPH_V2_PREDECESSOR_MISMATCH");
  });

  it("rebuilds the readmodel index without changing WASD retrieval bytes or result hash, including after process restart",async()=>{
    await seedSource();
    await resolveAndRecordNpc(sourceRequest(1));
    const before=decodeOwnedNpcSemanticGraphs(await readConfirmedNpcSemanticGraphPacket(7),7);
    const beforeGraph=before.graphs.find(graph=>graph.npcId===npcId);
    expect(beforeGraph?.generation).toBe(1);
    const [chain]=await pool.query<RowDataPacket[]>("SELECT id,generation,graphHash,previousGraphHash FROM aurionSemanticGraphReceiptsV2 WHERE npcId=? ORDER BY generation",[npcId]);
    expect(chain).toHaveLength(2);
    expect(chain[1].previousGraphHash).toBe(chain[0].graphHash);
    const db=await getDb();if(!db)throw new Error("DB_REQUIRED");

    // The index is a rebuildable projection, never graph authority: lose it completely,
    // still verify the canonical graph, then reconstruct exact index rows.
    await pool.query("DELETE FROM aurionSemanticGraphIndexV2 WHERE graphReceiptId=?",[chain[1].id]);
    const graphWithoutIndex=await db.transaction(tx=>readVerifiedNpcSemanticGraphV2(tx,npcId));
    expect(graphWithoutIndex?.graph.graphHash).toBe(beforeGraph?.graphHash);
    const rebuilt=await db.transaction(tx=>rebuildSemanticGraphIndexV2(tx,npcId));
    expect(rebuilt?.resultHash).toBe(beforeGraph?.sourceResultHash);
    const [rebuiltRows]=await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionSemanticGraphIndexV2 WHERE graphReceiptId=?",[chain[1].id]);
    expect(Number(rebuiltRows[0]?.n??0)).toBe(rebuilt?.indexCount);
    const after=decodeOwnedNpcSemanticGraphs(await readConfirmedNpcSemanticGraphPacket(7),7);
    expect(after).toEqual(before);

    const output=execFileSync(process.execPath,["--import","tsx","--input-type=module","-e",
      'import {readConfirmedNpcSemanticGraphPacket} from "./server/wasdSemanticGraphV2Persistence.ts";const p=await readConfirmedNpcSemanticGraphPacket(7);process.stdout.write(JSON.stringify(p));process.exit(0);'
    ],{cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:30000});
    expect(decodeOwnedNpcSemanticGraphs(JSON.parse(output),7)).toEqual(before);
  });
});
