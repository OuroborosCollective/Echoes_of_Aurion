import { asc, eq } from "drizzle-orm";
import {
  aurionEconomicAssetTransitions,
  aurionEconomicEvents,
  aurionEconomicLedgerCoordinator,
  aurionEconomicResourceDeltas,
} from "../../drizzle/aurionCausalitySchema";
import { aurionItemInstancesV2, aurionLootDropReceiptsV2, aurionTradeCraftingReceipts } from "../../drizzle/schema";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { createEconomicEvent, type AurionEconomicEvent, type AurionEconomicSourceKind } from "../../shared/aurionEconomicEventContract";
import { getDb } from "../db";
import { readTemporalEventById } from "../history/aurionTemporalEventPersistence";
import { parseStoredDeterministicLootResult } from "../aurionVisualItemAdapter";
import { normalizeTradeCraftingReceipt } from "../tradeCraftingReceiptPersistence";

type Database=NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx=Parameters<Parameters<Database["transaction"]>[0]>[0];

function sourceHash(value:unknown){return canonicalSha256(value);}
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
    eventType:"resource_delta" as const,
    sourceEvidenceHash:`sha256:${row.receiptHash}`,
    resourceDeltas:Object.freeze(normalized.resourceDeltas.map(delta=>Object.freeze({
      resourceId:delta.resourceId,accountId:`character:${row.characterId}`,deltaExact:delta.quantityExact,
    }))),
    assetTransitions:Object.freeze([]),
  });
}

async function deriveLootV2(tx:Tx,sourceId:string){
  const receipt=(await tx.select().from(aurionLootDropReceiptsV2).where(eq(aurionLootDropReceiptsV2.id,sourceId)).limit(1))[0];
  if(!receipt) throw new Error("ECONOMIC_SOURCE_RECEIPT_MISSING");
  const item=(await tx.select().from(aurionItemInstancesV2).where(eq(aurionItemInstancesV2.lootReceiptId,receipt.id)).limit(1))[0];
  if(!item||item.ownerUserId!==receipt.userId) throw new Error("ECONOMIC_LOOT_ITEM_MISSING");
  const resolved=parseStoredDeterministicLootResult(receipt.resolvedJson);
  if(
    receipt.itemDefinitionId!==resolved.itemDefinitionId||receipt.category!==resolved.category||receipt.quality!==resolved.quality||
    receipt.itemLevelExact!==resolved.itemLevelExact||(receipt.setId??null)!==(resolved.setId??null)||receipt.contextHash!==resolved.contextHash||
    receipt.deterministicHash!==resolved.deterministicHash||item.baseItemDefinitionId!==resolved.itemDefinitionId||item.category!==resolved.category||
    item.quality!==resolved.quality||item.itemLevelExact!==resolved.itemLevelExact||(item.setId??null)!==(resolved.setId??null)||
    item.deterministicHash!==resolved.deterministicHash||item.itemPower!==resolved.itemPower
  ) throw new Error("ECONOMIC_LOOT_RECEIPT_MISMATCH");
  const evidence={receipt:{id:receipt.id,userId:receipt.userId,encounterReceiptId:receipt.encounterReceiptId,itemDefinitionId:receipt.itemDefinitionId,
    category:receipt.category,quality:receipt.quality,itemLevelExact:receipt.itemLevelExact,setId:receipt.setId??null,contextHash:receipt.contextHash,
    deterministicHash:receipt.deterministicHash,ruleSetVersion:receipt.ruleSetVersion,contentVersion:receipt.contentVersion},
    item:{id:item.id,ownerUserId:item.ownerUserId,lootReceiptId:item.lootReceiptId,baseItemDefinitionId:item.baseItemDefinitionId,category:item.category,
      quality:item.quality,itemLevelExact:item.itemLevelExact,setId:item.setId??null,itemPower:item.itemPower,deterministicHash:item.deterministicHash}};
  return Object.freeze({
    eventType:"asset_create" as const,
    sourceEvidenceHash:sourceHash(evidence),
    resourceDeltas:Object.freeze([]),
    assetTransitions:Object.freeze([{assetId:item.id,transitionKind:"create" as const,fromOwnerId:null,toOwnerId:`user:${receipt.userId}`}]),
  });
}

async function deriveSource(tx:Tx,kind:AurionEconomicSourceKind,sourceId:string){
  if(kind==="trade_crafting") return deriveTradeCrafting(tx,sourceId);
  if(kind==="loot_v2") return deriveLootV2(tx,sourceId);
  throw new Error("ECONOMIC_SOURCE_KIND_UNSUPPORTED");
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
    if(temporal.sourceReceiptHash!==source.sourceEvidenceHash)throw new Error("ECONOMIC_TEMPORAL_SOURCE_HASH_MISMATCH");
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
    const prior=(await tx.select().from(aurionEconomicEvents).where(eq(aurionEconomicEvents.eventHash,event.eventHash)).limit(1))[0];
    if(prior){
      const read=await readEvent(tx,prior.eventId);
      if(!read||canonicalJson(read)!==canonicalJson(event))throw new Error("ECONOMIC_EVENT_IDEMPOTENCY_CONFLICT");
      return Object.freeze({applied:false as const,ordinal:prior.ordinal,event:read});
    }
    for(const transition of event.assetTransitions){
      const existing=await tx.select().from(aurionEconomicAssetTransitions).where(eq(aurionEconomicAssetTransitions.assetId,transition.assetId)).limit(1);
      if(existing.length)throw new Error("ECONOMIC_ASSET_DUPLICATE_CREATE");
    }
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
      .where(eq(aurionEconomicEvents.worldId,worldId)).orderBy(asc(aurionEconomicEvents.ordinal)).limit(limit);
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
