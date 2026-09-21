import { eq } from "drizzle-orm";
import { aurionEconomicEvents } from "../../drizzle/aurionCausalitySchema";
import { aurionGuildBankReceipts } from "../../drizzle/guildBankSchema";
import {
  lootDropReceipts,
  aurionLootDropReceiptsV2,
  aurionTradeCraftingReceipts,
  marketTransactionReceipts,
  progressionLedger,
  systemSaleReceipts,
} from "../../drizzle/schema";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import type { AurionEconomicSourceKind } from "../../shared/aurionEconomicEventContract";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { getDb } from "../db";

const SOURCE_LIMIT=4096;
const SOURCE_KIND_COUNT=7;

export type EconomicSourceReference=Readonly<{sourceKind:AurionEconomicSourceKind;sourceId:string}>;
type SourceSet=Readonly<{kind:AurionEconomicSourceKind;ids:readonly string[]}>;

function freezeIds(values:readonly string[]):readonly string[]{
  const ids=[...new Set(values)].sort();
  if(ids.length>SOURCE_LIMIT) throw new Error("ECONOMIC_SOURCE_COVERAGE_LIMIT_EXCEEDED");
  return Object.freeze(ids);
}

export async function readEconomicSourceInventory(worldId:string):Promise<Readonly<{
  worldId:string;
  sources:readonly SourceSet[];
  references:readonly EconomicSourceReference[];
}>>{
  if(worldId!==GLOBAL_WORLD_ID) throw new Error("ECONOMIC_SOURCE_WORLD_UNSUPPORTED");
  const db=await getDb(); if(!db) throw new Error("ECONOMIC_DATABASE_UNAVAILABLE");
  const [tradeCrafting,lootV1,lootV2,market,systemSales,guild,points]=await Promise.all([
    db.select({id:aurionTradeCraftingReceipts.id}).from(aurionTradeCraftingReceipts).limit(SOURCE_LIMIT+1),
    db.select({id:lootDropReceipts.id}).from(lootDropReceipts).limit(SOURCE_LIMIT+1),
    db.select({id:aurionLootDropReceiptsV2.id}).from(aurionLootDropReceiptsV2).limit(SOURCE_LIMIT+1),
    db.select({id:marketTransactionReceipts.id}).from(marketTransactionReceipts).limit(SOURCE_LIMIT+1),
    db.select({id:systemSaleReceipts.id}).from(systemSaleReceipts).limit(SOURCE_LIMIT+1),
    db.select({id:aurionGuildBankReceipts.receiptId}).from(aurionGuildBankReceipts).limit(SOURCE_LIMIT+1),
    db.select({id:progressionLedger.id}).from(progressionLedger).where(eq(progressionLedger.kind,"points")).limit(SOURCE_LIMIT+1),
  ]);
  if([tradeCrafting,lootV1,lootV2,market,systemSales,guild,points].some(rows=>rows.length>SOURCE_LIMIT)) {
    throw new Error("ECONOMIC_SOURCE_COVERAGE_LIMIT_EXCEEDED");
  }
  const sources:readonly SourceSet[]=Object.freeze([
    Object.freeze({kind:"trade_crafting" as const,ids:freezeIds(tradeCrafting.map(row=>row.id))}),
    Object.freeze({kind:"loot_v1" as const,ids:freezeIds(lootV1.map(row=>row.id))}),
    Object.freeze({kind:"loot_v2" as const,ids:freezeIds(lootV2.map(row=>row.id))}),
    Object.freeze({kind:"market_transaction" as const,ids:freezeIds(market.map(row=>row.id))}),
    Object.freeze({kind:"system_sale" as const,ids:freezeIds(systemSales.map(row=>row.id))}),
    Object.freeze({kind:"guild_bank" as const,ids:freezeIds(guild.map(row=>row.id))}),
    Object.freeze({kind:"progression_points" as const,ids:freezeIds(points.map(row=>row.id))}),
  ]);
  const references=Object.freeze(sources
    .flatMap(source=>source.ids.map(sourceId=>Object.freeze({sourceKind:source.kind,sourceId})))
    .sort((a,b)=>a.sourceKind.localeCompare(b.sourceKind)||a.sourceId.localeCompare(b.sourceId)));
  return Object.freeze({worldId,sources,references});
}

export async function readEconomicSourceCoverage(worldId:string){
  try{
    const inventory=await readEconomicSourceInventory(worldId);
    const db=await getDb(); if(!db) throw new Error("ECONOMIC_DATABASE_UNAVAILABLE");
    const economic=await db.select({sourceKind:aurionEconomicEvents.sourceKind,sourceId:aurionEconomicEvents.sourceId})
      .from(aurionEconomicEvents).where(eq(aurionEconomicEvents.worldId,worldId)).limit(SOURCE_LIMIT*SOURCE_KIND_COUNT+1);
    if(economic.length>SOURCE_LIMIT*SOURCE_KIND_COUNT) throw new Error("ECONOMIC_SOURCE_COVERAGE_LIMIT_EXCEEDED");
    const materialized=new Set(economic.map(row=>`${row.sourceKind}:${row.sourceId}`));
    const sourceKeys=new Set(inventory.references.map(source=>`${source.sourceKind}:${source.sourceId}`));
    const missingEvents=[...sourceKeys].filter(key=>!materialized.has(key)).sort();
    const orphanEvents=[...materialized].filter(key=>!sourceKeys.has(key)).sort();
    const sourceSummary=Object.freeze(inventory.sources.map(source=>Object.freeze({
      kind:source.kind,
      sourceCount:source.ids.length,
      materializedCount:source.ids.filter(id=>materialized.has(`${source.kind}:${id}`)).length,
      sourceDigest:canonicalSha256(source.ids),
    })));
    const contradictions=orphanEvents.map(value=>`ORPHAN_EVENT:${value}`).sort();
    const coverageHash=canonicalSha256({
      schema:"aurion.economic-source-coverage.v3",worldId,sourceSummary,
      missingEventDigest:canonicalSha256(missingEvents),
      contradictionDigest:canonicalSha256(contradictions),
    });
    const status=contradictions.length?"CONTRADICTED" as const:missingEvents.length?"UNPROVABLE" as const:"MATCH" as const;
    return Object.freeze({
      mutationAuthority:"none" as const,status,worldId,
      reason:contradictions.length?"ECONOMIC_SOURCE_COVERAGE_CONTRADICTED":status==="UNPROVABLE"?"ECONOMIC_SOURCE_COVERAGE_INCOMPLETE":null,
      sources:sourceSummary,
      missingEventCount:missingEvents.length,
      contradictionCount:contradictions.length,
      missingEventSample:Object.freeze(missingEvents.slice(0,64)),
      contradictionSample:Object.freeze(contradictions.slice(0,64)),
      coverageHash,
    });
  }catch(error){
    return Object.freeze({
      mutationAuthority:"none" as const,status:"UNPROVABLE" as const,worldId,
      reason:error instanceof Error?error.message:String(error),
      sources:Object.freeze([]),missingEventCount:0,contradictionCount:0,
      missingEventSample:Object.freeze([]),contradictionSample:Object.freeze([]),coverageHash:null,
    });
  }
}
