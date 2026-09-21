import { eq } from "drizzle-orm";
import { aurionEconomicEvents } from "../../drizzle/aurionCausalitySchema";
import { aurionGuildBankReceipts } from "../../drizzle/guildBankSchema";
import {
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

type SourceSet=Readonly<{kind:AurionEconomicSourceKind;ids:readonly string[]}>;

function freezeIds(values:readonly string[]):readonly string[]{
  const ids=[...new Set(values)].sort();
  if(ids.length>SOURCE_LIMIT) throw new Error("ECONOMIC_SOURCE_COVERAGE_LIMIT_EXCEEDED");
  return Object.freeze(ids);
}

export async function readEconomicSourceCoverage(worldId:string){
  if(worldId!==GLOBAL_WORLD_ID) return Object.freeze({
    mutationAuthority:"none" as const,status:"UNPROVABLE" as const,worldId,
    reason:"ECONOMIC_SOURCE_WORLD_UNSUPPORTED",sources:Object.freeze([]),missingCount:0,missingSample:Object.freeze([]),coverageHash:null,
  });
  const db=await getDb(); if(!db) return Object.freeze({
    mutationAuthority:"none" as const,status:"UNPROVABLE" as const,worldId,
    reason:"ECONOMIC_DATABASE_UNAVAILABLE",sources:Object.freeze([]),missingCount:0,missingSample:Object.freeze([]),coverageHash:null,
  });
  try{
    const [tradeCrafting,loot,market,systemSales,guild,points,economic]=await Promise.all([
      db.select({id:aurionTradeCraftingReceipts.id}).from(aurionTradeCraftingReceipts).limit(SOURCE_LIMIT+1),
      db.select({id:aurionLootDropReceiptsV2.id}).from(aurionLootDropReceiptsV2).limit(SOURCE_LIMIT+1),
      db.select({id:marketTransactionReceipts.id}).from(marketTransactionReceipts).limit(SOURCE_LIMIT+1),
      db.select({id:systemSaleReceipts.id}).from(systemSaleReceipts).limit(SOURCE_LIMIT+1),
      db.select({id:aurionGuildBankReceipts.receiptId}).from(aurionGuildBankReceipts).limit(SOURCE_LIMIT+1),
      db.select({id:progressionLedger.id}).from(progressionLedger).where(eq(progressionLedger.kind,"points")).limit(SOURCE_LIMIT+1),
      db.select({sourceKind:aurionEconomicEvents.sourceKind,sourceId:aurionEconomicEvents.sourceId})
        .from(aurionEconomicEvents).where(eq(aurionEconomicEvents.worldId,worldId)).limit(SOURCE_LIMIT*6+1),
    ]);
    if([tradeCrafting,loot,market,systemSales,guild,points].some(rows=>rows.length>SOURCE_LIMIT)||economic.length>SOURCE_LIMIT*6){
      throw new Error("ECONOMIC_SOURCE_COVERAGE_LIMIT_EXCEEDED");
    }
    const sources:readonly SourceSet[]=Object.freeze([
      Object.freeze({kind:"trade_crafting" as const,ids:freezeIds(tradeCrafting.map(row=>row.id))}),
      Object.freeze({kind:"loot_v2" as const,ids:freezeIds(loot.map(row=>row.id))}),
      Object.freeze({kind:"market_transaction" as const,ids:freezeIds(market.map(row=>row.id))}),
      Object.freeze({kind:"system_sale" as const,ids:freezeIds(systemSales.map(row=>row.id))}),
      Object.freeze({kind:"guild_bank" as const,ids:freezeIds(guild.map(row=>row.id))}),
      Object.freeze({kind:"progression_points" as const,ids:freezeIds(points.map(row=>row.id))}),
    ]);
    const materialized=new Set(economic.map(row=>`${row.sourceKind}:${row.sourceId}`));
    const missing:string[]=[];
    for(const source of sources) for(const id of source.ids) if(!materialized.has(`${source.kind}:${id}`)) missing.push(`${source.kind}:${id}`);
    missing.sort();
    const sourceSummary=Object.freeze(sources.map(source=>Object.freeze({
      kind:source.kind,
      sourceCount:source.ids.length,
      materializedCount:source.ids.filter(id=>materialized.has(`${source.kind}:${id}`)).length,
      sourceDigest:canonicalSha256(source.ids),
    })));
    const coverageHash=canonicalSha256({
      schema:"aurion.economic-source-coverage.v1",worldId,sourceSummary,
      missingDigest:canonicalSha256(missing),
    });
    return Object.freeze({
      mutationAuthority:"none" as const,
      status:missing.length?"UNPROVABLE" as const:"MATCH" as const,
      worldId,
      reason:missing.length?"ECONOMIC_SOURCE_COVERAGE_INCOMPLETE":null,
      sources:sourceSummary,
      missingCount:missing.length,
      missingSample:Object.freeze(missing.slice(0,64)),
      coverageHash,
    });
  }catch(error){
    return Object.freeze({
      mutationAuthority:"none" as const,status:"UNPROVABLE" as const,worldId,
      reason:error instanceof Error?error.message:String(error),
      sources:Object.freeze([]),missingCount:0,missingSample:Object.freeze([]),coverageHash:null,
    });
  }
}
