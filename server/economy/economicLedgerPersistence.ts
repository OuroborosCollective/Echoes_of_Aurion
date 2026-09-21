import { and, asc, eq } from "drizzle-orm";
import {
  aurionEconomicAssetTransitions,
  aurionEconomicEvents,
  aurionEconomicLedgerCoordinator,
  aurionEconomicResourceDeltas,
} from "../../drizzle/aurionCausalitySchema";
import {
  itemInstances, lootDropReceipts, aurionItemInstancesV2, aurionLootDropReceiptsV2, aurionTradeCraftingReceipts,
  marketTransactionReceipts, progressionLedger, systemSaleReceipts,
} from "../../drizzle/schema";
import { canonicalJson } from "../../shared/aurionCanonicalHash";
import { createEconomicEvent, type AurionEconomicEvent, type AurionEconomicSourceKind } from "../../shared/aurionEconomicEventContract";
import { getDb } from "../db";
import { readTemporalEventById } from "../history/aurionTemporalEventPersistence";
import { parseStoredDeterministicLootResult } from "../aurionVisualItemAdapter";
import { normalizeTradeCraftingReceipt } from "../tradeCraftingReceiptPersistence";
import {
  lootV1SourceEvidenceHash, lootV2SourceEvidenceHash, marketTransactionSourceEvidenceHash,
  progressionPointsSourceEvidenceHash, systemSaleSourceEvidenceHash, tradeCraftingSourceEvidenceHash,
} from "./economicSourceEvidence";

type Database=NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx=Parameters<Parameters<Database["transaction"]>[0]>[0];

function eventId(hash:string){return `economic:${hash.slice("sha256:".length,72)}`;}

async function deriveTradeCrafting(tx:Tx,sourceId:string){
  const row=(await tx.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.id,sourceId)).limit(1))[0];
  if(!row) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  const resourceDeltas=JSON.parse(row.resourceDeltasJson) as Array<{resourceId:string;quantityExact:string}>;
  const normalized=normalizeTradeCraftingReceipt({
    userId:row.userId,characterId:row.characterId,operationKind:row.operationKind,operationId:row.operationId,sourceReceiptId:row.sourceReceiptId,
    worldRevision:row.worldRevision,marketContext:row.marketContext,professionContext:row.professionContext,resourceDeltas,resultJson:row.resultJson,
    resultHash:row.resultHash,idempotencyKey:row.idempotencyKey,
  });
  if(normalized.receiptHash!==row.receiptHash) throw new Error("ECONOMIC_SOURCE_RECEIPT_HASH_MISMATCH");
  return Object.freeze({
    eventType:"economic_transition" as const,
    sourceEvidenceHash:tradeCraftingSourceEvidenceHash(normalized),
    resourceDeltas:Object.freeze(normalized.resourceDeltas.map(delta=>Object.freeze({
      resourceId:delta.resourceId,accountId:`character:${row.characterId}`,deltaExact:delta.quantityExact,
    }))),
    assetTransitions:Object.freeze([]),
  });
}

async function deriveLootV1(tx:Tx,sourceId:string){
  const receipt=(await tx.select().from(lootDropReceipts).where(eq(lootDropReceipts.id,sourceId)).limit(1))[0];
  if(!receipt) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  const item=(await tx.select().from(itemInstances).where(eq(itemInstances.lootReceiptId,receipt.id)).limit(1))[0];
  if(!item) throw new Error("ECONOMIC_LOOT_V1_ITEM_MISSING");
  if(item.sourceKind!=="loot"||item.quality!==receipt.quality) throw new Error("ECONOMIC_LOOT_V1_RECEIPT_MISMATCH");
  return Object.freeze({
    eventType:"economic_transition" as const,
    sourceEvidenceHash:lootV1SourceEvidenceHash(receipt,item),
    resourceDeltas:Object.freeze([]),
    assetTransitions:Object.freeze([{
      assetId:`item:legacy:${item.id}`,
      transitionKind:"create" as const,
      fromOwnerId:null,
      toOwnerId:`user:${receipt.userId}`,
    }]),
  });
}

async function deriveLootV2(tx:Tx,sourceId:string){
  const receipt=(await tx.select().from(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.id,sourceId)).limit(1))[0];
  if(!receipt) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  const item=(await tx.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.lootReceiptId,receipt.id)).limit(1))[0];
  if(!item) throw new Error("ECONOMIC_LOOT_ITEM_MISSING");
  const resolved=parseStoredDeterministicLootResult(receipt.resolvedJson);
  if(
    receipt.itemDefinitionId!==resolved.itemDefinitionId||receipt.category!==resolved.category||receipt.quality!==resolved.quality||
    receipt.itemLevelExact!==resolved.itemLevelExact||(receipt.setId??null)!==(resolved.setId??null)||receipt.contextHash!==resolved.contextHash||
    receipt.deterministicHash!==resolved.deterministicHash||item.baseItemDefinitionId!==resolved.itemDefinitionId||item.category!==resolved.category||
    item.quality!==resolved.quality||item.itemLevelExact!==resolved.itemLevelExact||(item.setId??null)!==(resolved.setId??null)||
    item.deterministicHash!==resolved.deterministicHash||item.itemPower!==resolved.itemPower
  ) throw new Error("ECONOMIC_LOOT_RECEIPT_MISMATCH");

  return Object.freeze({
    eventType:"economic_transition" as const,
    sourceEvidenceHash:lootV2SourceEvidenceHash(receipt,item),
    resourceDeltas:Object.freeze([]),
    assetTransitions:Object.freeze([{assetId:`item:aurion_v2:${item.id}`,transitionKind:"create" as const,fromOwnerId:null,toOwnerId:`user:${receipt.userId}`}]),
  });
}

async function deriveMarketTransaction(tx:Tx,sourceId:string){
  const row=(await tx.select().from(marketTransactionReceipts).where(eq(marketTransactionReceipts.id,sourceId)).limit(1))[0];
  if(!row) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  if(!Number.isSafeInteger(row.aurionTransferred)||row.aurionTransferred<=0||row.sellerUserId===row.buyerUserId) {
    throw new Error("ECONOMIC_MARKET_RECEIPT_INVALID");
  }
  return Object.freeze({
    eventType:"economic_transition" as const,
    sourceEvidenceHash:marketTransactionSourceEvidenceHash(row),
    resourceDeltas:Object.freeze([
      Object.freeze({resourceId:"aurion_points",accountId:`user:${row.buyerUserId}`,deltaExact:`-${row.aurionTransferred}`}),
      Object.freeze({resourceId:"aurion_points",accountId:`user:${row.sellerUserId}`,deltaExact:String(row.aurionTransferred)}),
    ]),
    assetTransitions:Object.freeze([{
      assetId:`item:legacy:${row.itemId}`,
      transitionKind:"transfer" as const,
      fromOwnerId:`user:${row.sellerUserId}`,
      toOwnerId:`user:${row.buyerUserId}`,
    }]),
  });
}

async function deriveSystemSale(tx:Tx,sourceId:string){
  const row=(await tx.select().from(systemSaleReceipts).where(eq(systemSaleReceipts.id,sourceId)).limit(1))[0];
  if(!row) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  if(!Number.isSafeInteger(row.aurionGranted)||row.aurionGranted<=0) throw new Error("ECONOMIC_SYSTEM_SALE_RECEIPT_INVALID");
  return Object.freeze({
    eventType:"economic_transition" as const,
    sourceEvidenceHash:systemSaleSourceEvidenceHash(row),
    resourceDeltas:Object.freeze([
      Object.freeze({resourceId:"aurion_points",accountId:"system:vendor",deltaExact:`-${row.aurionGranted}`}),
      Object.freeze({resourceId:"aurion_points",accountId:`user:${row.sellerUserId}`,deltaExact:String(row.aurionGranted)}),
    ]),
    assetTransitions:Object.freeze([{
      assetId:`item:legacy:${row.itemId}`,
      transitionKind:"consume" as const,
      fromOwnerId:`user:${row.sellerUserId}`,
      toOwnerId:null,
    }]),
  });
}

async function deriveProgressionPoints(tx:Tx,sourceId:string){
  const row=(await tx.select().from(progressionLedger).where(eq(progressionLedger.id,sourceId)).limit(1))[0];
  if(!row) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  if(row.kind!=="points"||!Number.isSafeInteger(row.delta)||row.delta<=0) throw new Error("ECONOMIC_PROGRESSION_POINTS_RECEIPT_INVALID");
  return Object.freeze({
    eventType:"economic_transition" as const,
    sourceEvidenceHash:progressionPointsSourceEvidenceHash(row),
    resourceDeltas:Object.freeze([
      Object.freeze({resourceId:"aurion_points",accountId:"system:progression",deltaExact:`-${row.delta}`}),
      Object.freeze({resourceId:"aurion_points",accountId:`user:${row.userId}`,deltaExact:String(row.delta)}),
    ]),
    assetTransitions:Object.freeze([]),
  });
}

async function deriveSource(tx:Tx,kind:AurionEconomicSourceKind,sourceId:string){
  if(kind==="trade_crafting") return deriveTradeCrafting(tx,sourceId);
  if(kind==="loot_v1") return deriveLootV1(tx,sourceId);
  if(kind==="loot_v2") return deriveLootV2(tx,sourceId);
  if(kind==="market_transaction") return deriveMarketTransaction(tx,sourceId);
  if(kind==="system_sale") return deriveSystemSale(tx,sourceId);
  if(kind==="progression_points") return deriveProgressionPoints(tx,sourceId);
  throw new Error("ECONOMIC_SOURCE_KIND_UNSUPPORTED");
}

async function assertAssetTransitionAllowed(
  tx:Tx,
  worldId:string,
  transition:AurionEconomicEvent["assetTransitions"][number],
):Promise<void>{
  const rows=await tx.select({
    transitionKind:aurionEconomicAssetTransitions.transitionKind,
    fromOwnerId:aurionEconomicAssetTransitions.fromOwnerId,
    toOwnerId:aurionEconomicAssetTransitions.toOwnerId,
    ordinal:aurionEconomicEvents.ordinal,
  }).from(aurionEconomicAssetTransitions)
    .innerJoin(aurionEconomicEvents,eq(aurionEconomicEvents.eventId,aurionEconomicAssetTransitions.eventId))
    .where(and(
      eq(aurionEconomicEvents.worldId,worldId),
      eq(aurionEconomicAssetTransitions.assetId,transition.assetId),
    ))
    .orderBy(asc(aurionEconomicEvents.ordinal))
    .limit(2049);
  if(rows.length>2048) throw new Error("ECONOMIC_ASSET_LINEAGE_LIMIT_EXCEEDED");
  let created=false,owner:string|null=null,consumed=false;
  for(const row of rows){
    if(row.transitionKind==="create"){
      if(created||consumed||row.fromOwnerId!==null||row.toOwnerId===null) throw new Error("ECONOMIC_ASSET_LINEAGE_CORRUPT");
      created=true;owner=row.toOwnerId;
    }else if(row.transitionKind==="transfer"){
      if(!created||consumed||owner!==row.fromOwnerId||row.toOwnerId===null) throw new Error("ECONOMIC_ASSET_LINEAGE_CORRUPT");
      owner=row.toOwnerId;
    }else{
      if(!created||consumed||owner!==row.fromOwnerId||row.toOwnerId!==null) throw new Error("ECONOMIC_ASSET_LINEAGE_CORRUPT");
      owner=null;consumed=true;
    }
  }
  if(transition.transitionKind==="create"){
    if(created) throw new Error("ECONOMIC_ASSET_DUPLICATE_CREATE");
    return;
  }
  if(!created||consumed||owner!==transition.fromOwnerId) throw new Error("ECONOMIC_ASSET_OWNERSHIP_MISMATCH");
}

async function readEvent(tx:Tx,id:string):Promise<AurionEconomicEvent|null>{
  const row=(await tx.select().from(aurionEconomicEvents).where(eq(aurionEconomicEvents.eventId,id)).limit(1))[0];
  if(!row)return null;
  const [resources,assets]=await Promise.all([
    tx.select().from(aurionEconomicResourceDeltas).where(eq(aurionEconomicResourceDeltas.eventId,id)),
    tx.select().from(aurionEconomicAssetTransitions).where(eq(aurionEconomicAssetTransitions.eventId,id)),
  ]);
  const event=createEconomicEvent({
    eventId:row.eventId,worldId:row.worldId,epoch:row.epoch,eventType:row.eventType,sourceKind:row.sourceKind,sourceId:row.sourceId,
    sourceEvidenceHash:row.sourceEvidenceHash,temporalEventId:row.temporalEventId,temporalEventHash:row.temporalEventHash,
    sourceWorldRoot:row.sourceWorldRoot,sourceRevision:row.sourceRevision,rulesetVersion:row.rulesetVersion,
    resourceDeltas:resources.map(value=>({resourceId:value.resourceId,accountId:value.accountId,deltaExact:value.deltaExact})),
    assetTransitions:assets.map(value=>({assetId:value.assetId,transitionKind:value.transitionKind,fromOwnerId:value.fromOwnerId,toOwnerId:value.toOwnerId})),
  });
  if(event.eventHash!==row.eventHash) throw new Error("ECONOMIC_EVENT_PERSISTED_HASH_MISMATCH");
  return event;
}

export async function materializeEconomicSource(input:{sourceKind:AurionEconomicSourceKind;sourceId:string;temporalEventId:string}){
  const db=await getDb();if(!db)throw new Error("ECONOMIC_DATABASE_UNAVAILABLE");
  return db.transaction(async tx=>{
    const temporal=await readTemporalEventById(input.temporalEventId);
    if(!temporal)throw new Error("ECONOMIC_TEMPORAL_EVENT_MISSING");
    if(temporal.domain!=="economy"&&temporal.domain!=="ownership")throw new Error("ECONOMIC_TEMPORAL_DOMAIN_INVALID");
    const source=await deriveSource(tx,input.sourceKind,input.sourceId);
    const payload=temporal.payload as Record<string,unknown>;
    if(payload.sourceKind!==input.sourceKind||payload.sourceId!==input.sourceId||payload.sourceEvidenceHash!==source.sourceEvidenceHash)throw new Error("ECONOMIC_TEMPORAL_SOURCE_BINDING_MISMATCH");

    await tx.insert(aurionEconomicLedgerCoordinator).values({worldId:temporal.worldId,nextOrdinal:1n})
      .onDuplicateKeyUpdate({set:{worldId:temporal.worldId}});
    const coordinator=(await tx.select().from(aurionEconomicLedgerCoordinator).where(eq(aurionEconomicLedgerCoordinator.worldId,temporal.worldId)).limit(1).for("update"))[0];
    if(!coordinator)throw new Error("ECONOMIC_COORDINATOR_MISSING");

    const candidate=createEconomicEvent({
      eventId:"economic:pending",worldId:temporal.worldId,epoch:temporal.epoch,eventType:source.eventType,sourceKind:input.sourceKind,sourceId:input.sourceId,
      sourceEvidenceHash:source.sourceEvidenceHash,temporalEventId:temporal.eventId,temporalEventHash:temporal.eventHash,sourceWorldRoot:temporal.sourceWorldRoot,
      sourceRevision:temporal.sourceRevision,rulesetVersion:temporal.rulesetVersion,resourceDeltas:source.resourceDeltas,assetTransitions:source.assetTransitions,
    });
    const id=eventId(candidate.eventHash);
    const event=createEconomicEvent({...candidate,eventId:id});
    const priorBySource=(await tx.select().from(aurionEconomicEvents).where(and(
      eq(aurionEconomicEvents.sourceKind,event.sourceKind),eq(aurionEconomicEvents.sourceId,event.sourceId),
    )).limit(1))[0];
    if(priorBySource){
      const read=await readEvent(tx,priorBySource.eventId);
      if(!read||canonicalJson(read)!==canonicalJson(event))throw new Error("ECONOMIC_SOURCE_IDEMPOTENCY_CONFLICT");
      return Object.freeze({applied:false as const,ordinal:priorBySource.ordinal,event:read});
    }
    const prior=(await tx.select().from(aurionEconomicEvents).where(eq(aurionEconomicEvents.eventHash,event.eventHash)).limit(1))[0];
    if(prior){
      const read=await readEvent(tx,prior.eventId);
      if(!read||canonicalJson(read)!==canonicalJson(event))throw new Error("ECONOMIC_EVENT_IDEMPOTENCY_CONFLICT");
      return Object.freeze({applied:false as const,ordinal:prior.ordinal,event:read});
    }
    for(const transition of event.assetTransitions) await assertAssetTransitionAllowed(tx,event.worldId,transition);
    const ordinal=coordinator.nextOrdinal;
    await tx.insert(aurionEconomicEvents).values({
      eventId:event.eventId,worldId:event.worldId,epoch:event.epoch,ordinal,eventType:event.eventType,sourceKind:event.sourceKind,sourceId:event.sourceId,
      sourceEvidenceHash:event.sourceEvidenceHash,temporalEventId:event.temporalEventId,temporalEventHash:event.temporalEventHash,sourceWorldRoot:event.sourceWorldRoot,
      sourceRevision:event.sourceRevision,rulesetVersion:event.rulesetVersion,eventHash:event.eventHash,
    });
    if(event.resourceDeltas.length)await tx.insert(aurionEconomicResourceDeltas).values(event.resourceDeltas.map(value=>({eventId:event.eventId,...value})));
    if(event.assetTransitions.length)await tx.insert(aurionEconomicAssetTransitions).values(event.assetTransitions.map(value=>({eventId:event.eventId,...value})));
    await tx.update(aurionEconomicLedgerCoordinator).set({nextOrdinal:ordinal+1n}).where(eq(aurionEconomicLedgerCoordinator.worldId,event.worldId));
    const read=await readEvent(tx,event.eventId);
    if(!read||canonicalJson(read)!==canonicalJson(event))throw new Error("ECONOMIC_EVENT_READBACK_MISMATCH");
    return Object.freeze({applied:true as const,ordinal,event:read});
  });
}

export async function readEconomicEvents(worldId:string,limit=2048){
  if(!Number.isSafeInteger(limit)||limit<1||limit>2048)throw new Error("ECONOMIC_READ_LIMIT_INVALID");
  const db=await getDb();if(!db)throw new Error("ECONOMIC_DATABASE_UNAVAILABLE");
  return db.transaction(async tx=>{
    const rows=await tx.select({eventId:aurionEconomicEvents.eventId}).from(aurionEconomicEvents)
      .where(eq(aurionEconomicEvents.worldId,worldId)).orderBy(asc(aurionEconomicEvents.ordinal)).limit(limit+1);
    if(rows.length>limit) throw new Error("ECONOMIC_HISTORY_LIMIT_EXCEEDED");
    const result:AurionEconomicEvent[]=[];
    for(const row of rows){const event=await readEvent(tx,row.eventId);if(event)result.push(event);}
    return Object.freeze(result);
  });
}

export async function readResourceBalance(worldId:string,resourceId:string,accountId:string){
  const events=await readEconomicEvents(worldId);
  let value=0n;
  for(const event of events)for(const delta of event.resourceDeltas)if(delta.resourceId===resourceId&&delta.accountId===accountId)value+=BigInt(delta.deltaExact);
  return value.toString(10);
}
