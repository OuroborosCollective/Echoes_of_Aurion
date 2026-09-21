import { eq } from "drizzle-orm";
import {
  aurionFactionWarfrontReceipts,
  aurionNpcActionReceipts,
  aurionProgressionReceipts,
  aurionQuestReceipts,
  aurionSemanticGraphReceiptsV2,
  aurionTradeCraftingReceipts,
} from "../../drizzle/schema";
import {
  aurionCausalTickReceipts,
  aurionCrossZoneTransferReceipts,
  aurionEffectDeliveryReceipts,
} from "../../drizzle/aurionCausalitySchema";
import { getDb } from "../db";

export type TemporalSourceReceiptKind =
  | "causal_tick"
  | "quest"
  | "npc_action"
  | "semantic_graph"
  | "faction_warfront"
  | "cross_zone_transfer"
  | "effect_delivery"
  | "trade_crafting"
  | "progression";

export type TemporalSourceReceiptResolution = Readonly<{
  kind: TemporalSourceReceiptKind;
  receiptId: string;
  directAuthorityTick:
    | Readonly<{ worldId: string; zoneId: string; tick: number; revision: string; rulesetVersion: string }>
    | null;
}>;

const HASH=/^sha256:[a-f0-9]{64}$/;

export async function resolveTemporalSourceReceipt(sourceReceiptHash:string):Promise<
  | Readonly<{status:"MATCH";receipt:TemporalSourceReceiptResolution}>
  | Readonly<{status:"UNPROVABLE";reason:string}>
  | Readonly<{status:"CONTRADICTED";reason:string;kinds:readonly TemporalSourceReceiptKind[]}>
>{
  if(!HASH.test(sourceReceiptHash)) return Object.freeze({status:"UNPROVABLE" as const,reason:"TEMPORAL_SOURCE_RECEIPT_HASH_INVALID"});
  const db=await getDb(); if(!db) return Object.freeze({status:"UNPROVABLE" as const,reason:"TEMPORAL_DATABASE_UNAVAILABLE"});
  const bare=sourceReceiptHash.slice("sha256:".length);
  const matches:TemporalSourceReceiptResolution[]=[];

  const ticks=await db.select({
    id:aurionCausalTickReceipts.id,worldId:aurionCausalTickReceipts.worldId,zoneId:aurionCausalTickReceipts.zoneId,
    tick:aurionCausalTickReceipts.tick,revision:aurionCausalTickReceipts.revision,rulesetVersion:aurionCausalTickReceipts.rulesetVersion,
  }).from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.receiptHash,sourceReceiptHash)).limit(2);
  for(const row of ticks) matches.push(Object.freeze({kind:"causal_tick",receiptId:row.id,directAuthorityTick:Object.freeze({
    worldId:row.worldId,zoneId:row.zoneId,tick:row.tick,revision:row.revision,rulesetVersion:row.rulesetVersion,
  })}));

  const quests=await db.select({id:aurionQuestReceipts.id}).from(aurionQuestReceipts).where(eq(aurionQuestReceipts.receiptHash,bare)).limit(2);
  for(const row of quests) matches.push(Object.freeze({kind:"quest",receiptId:row.id,directAuthorityTick:null}));

  const actions=await db.select({id:aurionNpcActionReceipts.id}).from(aurionNpcActionReceipts).where(eq(aurionNpcActionReceipts.receiptHash,bare)).limit(2);
  for(const row of actions) matches.push(Object.freeze({kind:"npc_action",receiptId:row.id,directAuthorityTick:null}));

  const graphs=await db.select({id:aurionSemanticGraphReceiptsV2.id}).from(aurionSemanticGraphReceiptsV2).where(eq(aurionSemanticGraphReceiptsV2.receiptHash,bare)).limit(2);
  for(const row of graphs) matches.push(Object.freeze({kind:"semantic_graph",receiptId:row.id,directAuthorityTick:null}));

  const warfronts=await db.select({id:aurionFactionWarfrontReceipts.id}).from(aurionFactionWarfrontReceipts).where(eq(aurionFactionWarfrontReceipts.stateHash,bare)).limit(2);
  for(const row of warfronts) matches.push(Object.freeze({kind:"faction_warfront",receiptId:row.id,directAuthorityTick:null}));

  const crossZone=await db.select({id:aurionCrossZoneTransferReceipts.id}).from(aurionCrossZoneTransferReceipts).where(eq(aurionCrossZoneTransferReceipts.transferReceiptHash,sourceReceiptHash)).limit(2);
  for(const row of crossZone) matches.push(Object.freeze({kind:"cross_zone_transfer",receiptId:row.id,directAuthorityTick:null}));

  const effects=await db.select({id:aurionEffectDeliveryReceipts.id}).from(aurionEffectDeliveryReceipts).where(eq(aurionEffectDeliveryReceipts.deliveryReceiptHash,sourceReceiptHash)).limit(2);
  for(const row of effects) matches.push(Object.freeze({kind:"effect_delivery",receiptId:row.id,directAuthorityTick:null}));

  const tradeCrafting=await db.select({id:aurionTradeCraftingReceipts.id}).from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.receiptHash,bare)).limit(2);
  for(const row of tradeCrafting) matches.push(Object.freeze({kind:"trade_crafting",receiptId:row.id,directAuthorityTick:null}));

  const progression=await db.select({id:aurionProgressionReceipts.id}).from(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.receiptHash,bare)).limit(2);
  for(const row of progression) matches.push(Object.freeze({kind:"progression",receiptId:row.id,directAuthorityTick:null}));

  if(matches.length===0) return Object.freeze({status:"UNPROVABLE" as const,reason:"TEMPORAL_SOURCE_RECEIPT_NOT_FOUND"});
  if(matches.length!==1) return Object.freeze({
    status:"CONTRADICTED" as const,
    reason:"TEMPORAL_SOURCE_RECEIPT_HASH_COLLISION",
    kinds:Object.freeze(matches.map(value=>value.kind).sort()),
  });
  return Object.freeze({status:"MATCH" as const,receipt:matches[0]!});
}
