import { createHash } from "node:crypto";
import mysql, { type Connection } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { treasureClasses, playerProfiles } from "../../drizzle/schema";
import {
  buyMarketListing,
  createLootDrop,
  createMarketListing,
  getDb,
  grantProgress,
  recordValidatedExpeditionResult,
  resolveAndRecordGlobalWorldEpoch,
  sellItemToSystem,
} from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "../causality/tickRecorder";
import { auditEconomicLedger } from "./economicInvariantService";
import { readEconomicEvents, readResourceBalance } from "./economicLedgerPersistence";
import { readAssetLineage } from "./ownershipLedger";
import { reconcileEconomicLedger } from "./economicReconciliationService";

const enabled=Boolean(process.env.DATABASE_URL)&&process.env.NODE_ENV==="test"&&process.env.AURION_WAVE3_ECONOMIC_E2E==="1";
const suite=enabled?describe:describe.skip;
const WORLD_ID="echoes-of-aurion-global";
const sellerUserId=9_353_701;
const buyerUserId=9_353_702;

function digest(value:string){return createHash("sha256").update(value,"utf8").digest("hex");}
async function nextSqlSecond(){await new Promise(resolve=>setTimeout(resolve,1_100));}

suite("Wave 3 Steps 35-37 economic ledger, lineage and invariant audit",()=>{
  it("reconciles real points and item mutations without replay payment or duplicate ownership",async()=>{
    const releaseSha=process.env.AURION_RELEASE_SHA;
    expect(releaseSha).toMatch(/^[a-f0-9]{40}$/);
    const databaseUrl=process.env.DATABASE_URL!;
    const target=new URL(databaseUrl);
    expect(target.hostname).toBe("127.0.0.1");
    expect(target.pathname.endsWith("_test")).toBe(true);

    const db=await getDb(); expect(db).not.toBeNull(); if(!db)return;
    await db.insert(treasureClasses).values({
      id:"wave3_economic_tc",classKey:"wave3_economic_normal",minLevel:1,maxLevel:10,
      entriesJson:JSON.stringify(["aurion_spear"]),active:1,
    }).onDuplicateKeyUpdate({set:{active:1,entriesJson:JSON.stringify(["aurion_spear"])}});
    const accepted=await recordValidatedExpeditionResult({
      userId:sellerUserId,expeditionKey:"wave3:economic:expedition",seedDigest:digest("wave3-economic-seed"),
      resultDigest:digest("wave3-economic-result"),confirmedByUserId:sellerUserId,idempotencyKey:"wave3:economic:result:0001",
    });
    const drop=await createLootDrop({
      userId:sellerUserId,expeditionKey:"wave3:economic:expedition",treasureClass:"wave3_economic_normal",
      qualityRoll:9_999,affixRoll:0,magicFind:0,itemLevel:1,seedDigest:digest("wave3-economic-seed"),
      resultReceiptId:accepted.receipt.id,idempotencyKey:"wave3:economic:drop:0001",
    });
    expect(drop).toMatchObject({applied:true,quality:"normal"});
    const points=await grantProgress({
      userId:buyerUserId,kind:"points",delta:1_000,source:"wave3:economic:funding",
      reason:"Wave 3 economic evidence funding",idempotencyKey:"wave3:economic:points:0001",
    });
    expect(points.applied).toBe(true);

    const beforeRoot=await reconcileEconomicLedger(WORLD_ID);
    expect(beforeRoot).toMatchObject({status:"UNPROVABLE",sourceCount:2,materializedCount:0,gameplayMutationAuthority:"none"});

    const zone=new AuthoritativeMovementZone("observatory_threshold");
    zone.sourceRevisionOverride=releaseSha!;
    await nextSqlSecond();
    zone.tick();
    await globalTickRecorder.flushPersistence();
    expect(await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId:sellerUserId,idempotencyKey:"wave3:economic:epoch:1",now:new Date("2026-01-01T00:00:01.000Z"),
    })).toMatchObject({source:"created",plan:{epoch:1}});

    const first=await reconcileEconomicLedger(WORLD_ID);
    expect(first).toMatchObject({status:"MATCH",sourceCount:2,materializedCount:2,unprovableCount:0,contradictionCount:0});
    const createdLineage=await readAssetLineage(WORLD_ID,`item:legacy:${drop.itemId}`);
    expect(createdLineage).toMatchObject({status:"MATCH",currentOwnerId:`user:${sellerUserId}`});
    expect(createdLineage.steps.map(step=>step.transitionKind)).toEqual(["create"]);

    const listing=await createMarketListing({itemId:drop.itemId,sellerUserId,askingPrice:100});
    const purchase=await buyMarketListing({listingId:listing.id,buyerUserId,idempotencyKey:"wave3:economic:market:0001"});
    expect(purchase).toMatchObject({applied:true,receipt:{itemId:drop.itemId,sellerUserId,buyerUserId,aurionTransferred:100}});
    const purchaseReplay=await buyMarketListing({listingId:listing.id,buyerUserId,idempotencyKey:"wave3:economic:market:0001"});
    expect(purchaseReplay).toMatchObject({applied:false,receipt:{id:purchase.receipt.id}});

    await nextSqlSecond();
    zone.tick();
    await globalTickRecorder.flushPersistence();
    expect(await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId:sellerUserId,idempotencyKey:"wave3:economic:epoch:2",now:new Date("2026-01-01T00:00:02.000Z"),
    })).toMatchObject({source:"created",plan:{epoch:2}});
    const second=await reconcileEconomicLedger(WORLD_ID);
    expect(second).toMatchObject({status:"MATCH",sourceCount:3,materializedCount:3});
    const transferredLineage=await readAssetLineage(WORLD_ID,`item:legacy:${drop.itemId}`);
    expect(transferredLineage).toMatchObject({status:"MATCH",currentOwnerId:`user:${buyerUserId}`});
    expect(transferredLineage.steps.map(step=>step.transitionKind)).toEqual(["create","transfer"]);

    const sale=await sellItemToSystem({itemId:drop.itemId,sellerUserId:buyerUserId});
    expect(sale.aurionGranted).toBeGreaterThan(0);
    await expect(sellItemToSystem({itemId:drop.itemId,sellerUserId:buyerUserId})).rejects.toThrow();

    await nextSqlSecond();
    zone.tick();
    await globalTickRecorder.flushPersistence();
    expect(await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId:sellerUserId,idempotencyKey:"wave3:economic:epoch:3",now:new Date("2026-01-01T00:00:03.000Z"),
    })).toMatchObject({source:"created",plan:{epoch:3}});
    const third=await reconcileEconomicLedger(WORLD_ID);
    expect(third).toMatchObject({status:"MATCH",sourceCount:4,materializedCount:4,unprovableCount:0,contradictionCount:0});

    const finalLineage=await readAssetLineage(WORLD_ID,`item:legacy:${drop.itemId}`);
    expect(finalLineage).toMatchObject({status:"MATCH",currentOwnerId:null});
    expect(finalLineage.steps.map(step=>step.transitionKind)).toEqual(["create","transfer","consume"]);

    const audit=await auditEconomicLedger(WORLD_ID);
    expect(audit).toMatchObject({status:"MATCH",eventCount:4,resourceSupplyDeltas:{aurion_points:"0"}});
    expect(audit.violations).toEqual([]);
    expect(audit.gaps).toEqual([]);
    expect(await readResourceBalance(WORLD_ID,"aurion_points",`user:${buyerUserId}`)).toBe(String(900+sale.aurionGranted));

    const beforeReplay=await readEconomicEvents(WORLD_ID);
    const replay=await reconcileEconomicLedger(WORLD_ID);
    const afterReplay=await readEconomicEvents(WORLD_ID);
    expect(replay).toMatchObject({status:"MATCH",sourceCount:4,materializedCount:4});
    expect(afterReplay.map(event=>event.eventHash)).toEqual(beforeReplay.map(event=>event.eventHash));
    expect((await db.select().from(playerProfiles).where(eq(playerProfiles.userId,buyerUserId)).limit(1))[0]?.aurionPoints).toBe(900+sale.aurionGranted);

    let raw:Connection|undefined;
    try{
      raw=await mysql.createConnection(databaseUrl);
      for(const sql of [
        "UPDATE aurionEconomicEvents SET sourceId='tampered' WHERE eventId=?",
        "DELETE FROM aurionEconomicEvents WHERE eventId=?",
      ]){
        let rejected="";
        try{await raw.query(sql,[beforeReplay[0]!.eventId]);}
        catch(error){rejected=String((error as {sqlMessage?:unknown}).sqlMessage??(error as Error).message);}
        expect(rejected).toContain("AURION_ECONOMIC_LEDGER_APPEND_ONLY");
      }
    }finally{await raw?.end();}

    console.info("WAVE3_ECONOMIC_RECEIPT",JSON.stringify({
      sourceCount:third.sourceCount,eventCount:audit.eventCount,auditHash:audit.auditHash,reconciliationHash:third.reconciliationHash,
      assetId:`item:legacy:${drop.itemId}`,lineage:finalLineage.steps.map(step=>step.transitionKind),
    }));
  },120_000);
});
