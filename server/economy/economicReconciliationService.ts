import { and, asc, eq, gt, gte, lte } from "drizzle-orm";
import { aurionCausalTickReceipts, aurionEconomicEvents, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { createTemporalEvent } from "../../shared/aurionTemporalEventContract";
import type { AurionEconomicSourceKind } from "../../shared/aurionEconomicEventContract";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { worldCausalRootService } from "../causality/worldCausalRootService";
import { getDb } from "../db";
import { appendTemporalEvent } from "../history/aurionTemporalEventPersistence";
import { auditEconomicLedger } from "./economicInvariantService";
import { materializeEconomicSource, readEconomicSourceProjection } from "./economicLedgerPersistence";
import { readEconomicSourceInventory, type EconomicSourceReference } from "./economicSourceCoverage";

const MAX_RECONCILE_SOURCES=4096;
const MAX_ANCHOR_EPOCHS=512;

type Anchor=Readonly<{
  epoch:number;
  sourceReceiptHash:string;
  sourceWorldRoot:string;
  sourceRevision:string;
  rulesetVersion:string;
}>;

type Pending=Readonly<{
  source: EconomicSourceReference;
  sourceCreatedAt: Date;
  temporalEventId:string;
}>;

function sourceKey(source:EconomicSourceReference){return `${source.sourceKind}:${source.sourceId}`;}

function errorText(error:unknown){return error instanceof Error?error.message:String(error);}

function classify(error:unknown):"CONTRADICTED"|"UNPROVABLE"{
  const reason=errorText(error);
  if(
    reason.includes("_MISSING")||
    reason.includes("_UNAVAILABLE")||
    reason.includes("_UNPROVABLE")||
    reason.includes("_UNSUPPORTED")||
    reason.includes("_LIMIT")||
    reason.includes("_DEPENDENCY")
  ) return "UNPROVABLE";
  return "CONTRADICTED";
}

async function findAnchor(worldId:string,sourceCreatedAt:Date):Promise<Anchor|null>{
  const db=await getDb(); if(!db) throw new Error("ECONOMIC_DATABASE_UNAVAILABLE");
  const proofs=await db.select({epoch:aurionGlobalStateProofs.epoch}).from(aurionGlobalStateProofs)
    .where(and(
      eq(aurionGlobalStateProofs.worldId,worldId),
      eq(aurionGlobalStateProofs.status,"VERIFIED"),
      gte(aurionGlobalStateProofs.createdAt,sourceCreatedAt),
    ))
    .orderBy(asc(aurionGlobalStateProofs.epoch))
    .limit(MAX_ANCHOR_EPOCHS+1);
  if(proofs.length>MAX_ANCHOR_EPOCHS) throw new Error("ECONOMIC_ANCHOR_EPOCH_LIMIT_EXCEEDED");

  for(const proof of proofs){
    const persisted=await worldCausalRootService.read(worldId,proof.epoch);
    if(!persisted||persisted.status!=="VERIFIED"||!persisted.root) continue;
    const replay=await worldCausalRootService.replay(worldId,proof.epoch);
    if(replay.status==="FIRST_DIVERGENCE") throw new Error("ECONOMIC_WORLD_ROOT_CONTRADICTED");
    if(replay.status!=="MATCH"||replay.worldRootHash!==persisted.root.worldRootHash) continue;

    const candidates:Array<Readonly<{receiptHash:string;zoneId:string;tick:number;createdAt:Date}>>=[];
    for(const zoneRoot of persisted.root.zoneRoots){
      const rows=await db.select({
        receiptHash:aurionCausalTickReceipts.receiptHash,
        zoneId:aurionCausalTickReceipts.zoneId,
        tick:aurionCausalTickReceipts.tick,
        createdAt:aurionCausalTickReceipts.createdAt,
      }).from(aurionCausalTickReceipts).where(and(
        eq(aurionCausalTickReceipts.worldId,worldId),
        eq(aurionCausalTickReceipts.zoneId,zoneRoot.zoneId),
        gte(aurionCausalTickReceipts.tick,zoneRoot.fromTick),
        lte(aurionCausalTickReceipts.tick,zoneRoot.toTick),
        gt(aurionCausalTickReceipts.createdAt,sourceCreatedAt),
        eq(aurionCausalTickReceipts.revision,persisted.root.sourceRevision),
        eq(aurionCausalTickReceipts.rulesetVersion,persisted.root.rulesetVersion),
      )).orderBy(asc(aurionCausalTickReceipts.createdAt),asc(aurionCausalTickReceipts.tick)).limit(1);
      if(rows[0]) candidates.push(rows[0]);
    }
    candidates.sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime()||a.zoneId.localeCompare(b.zoneId)||a.tick-b.tick||a.receiptHash.localeCompare(b.receiptHash));
    const receipt=candidates[0];
    if(!receipt) continue;
    return Object.freeze({
      epoch:proof.epoch,
      sourceReceiptHash:receipt.receiptHash,
      sourceWorldRoot:persisted.root.worldRootHash,
      sourceRevision:persisted.root.sourceRevision,
      rulesetVersion:persisted.root.rulesetVersion,
    });
  }
  return null;
}

function temporalForSource(
  worldId:string,
  source:EconomicSourceReference,
  projection:Awaited<ReturnType<typeof readEconomicSourceProjection>>,
  anchor:Anchor,
){
  const identityHash=canonicalSha256({
    schema:"aurion.economic-temporal-anchor.v1",
    worldId,sourceKind:source.sourceKind,sourceId:source.sourceId,sourceEvidenceHash:projection.sourceEvidenceHash,
  });
  const suffix=identityHash.slice("sha256:".length);
  return createTemporalEvent({
    eventId:`economic-temporal:${suffix.slice(0,56)}`,
    worldId,
    epoch:anchor.epoch,
    domain:projection.resourceDeltas.length?"economy":"ownership",
    subjectIds:[`economic-source:${suffix.slice(0,56)}`],
    sourceReceiptHash:anchor.sourceReceiptHash,
    sourceWorldRoot:anchor.sourceWorldRoot,
    sourceRevision:anchor.sourceRevision,
    rulesetVersion:anchor.rulesetVersion,
    payload:Object.freeze({
      schema:"aurion.economic-temporal-source.v1",
      sourceKind:source.sourceKind,
      sourceId:source.sourceId,
      sourceEvidenceHash:projection.sourceEvidenceHash,
      sourceCreatedAt:projection.sourceCreatedAt.toISOString(),
      mutationAuthority:"none",
    }),
  });
}

export async function reconcileEconomicLedger(worldId=GLOBAL_WORLD_ID){
  if(worldId!==GLOBAL_WORLD_ID) return Object.freeze({
    status:"UNPROVABLE" as const,worldId,reason:"ECONOMIC_SOURCE_WORLD_UNSUPPORTED",
    gameplayMutationAuthority:"none" as const,evidenceMutation:"append_only_projection" as const,
    sourceCount:0,materializedCount:0,unprovableCount:0,contradictionCount:0,reconciliationHash:null,
  });
  const inventory=await readEconomicSourceInventory(worldId);
  if(inventory.references.length>MAX_RECONCILE_SOURCES) return Object.freeze({
    status:"UNPROVABLE" as const,worldId,reason:"ECONOMIC_RECONCILE_SOURCE_LIMIT_EXCEEDED",
    gameplayMutationAuthority:"none" as const,evidenceMutation:"append_only_projection" as const,
    sourceCount:inventory.references.length,materializedCount:0,unprovableCount:inventory.references.length,contradictionCount:0,reconciliationHash:null,
  });
  const db=await getDb(); if(!db) throw new Error("ECONOMIC_DATABASE_UNAVAILABLE");
  const existingRows=await db.select({
    sourceKind:aurionEconomicEvents.sourceKind,sourceId:aurionEconomicEvents.sourceId,
  }).from(aurionEconomicEvents).where(eq(aurionEconomicEvents.worldId,worldId)).limit(MAX_RECONCILE_SOURCES+1);
  if(existingRows.length>MAX_RECONCILE_SOURCES) throw new Error("ECONOMIC_RECONCILE_EVENT_LIMIT_EXCEEDED");
  const existing=new Set(existingRows.map(row=>`${row.sourceKind}:${row.sourceId}`));

  const pending:Pending[]=[];
  const unprovable:Array<Readonly<{source:string;reason:string}>>=[];
  const contradictions:Array<Readonly<{source:string;reason:string}>>=[];
  let materializedCount=existing.size;

  for(const source of inventory.references){
    const key=sourceKey(source);
    if(existing.has(key)) continue;
    try{
      const projection=await readEconomicSourceProjection(source.sourceKind,source.sourceId);
      if(!(projection.sourceCreatedAt instanceof Date)||!Number.isFinite(projection.sourceCreatedAt.getTime())) {
        throw new Error("ECONOMIC_SOURCE_CREATED_AT_INVALID");
      }
      const anchor=await findAnchor(worldId,projection.sourceCreatedAt);
      if(!anchor){
        unprovable.push(Object.freeze({source:key,reason:"ECONOMIC_TEMPORAL_ANCHOR_NOT_YET_PROVABLE"}));
        continue;
      }
      const temporal=temporalForSource(worldId,source,projection,anchor);
      await appendTemporalEvent(temporal);
      pending.push(Object.freeze({source,sourceCreatedAt:projection.sourceCreatedAt,temporalEventId:temporal.eventId}));
    }catch(error){
      const record=Object.freeze({source:key,reason:errorText(error)});
      if(classify(error)==="CONTRADICTED") contradictions.push(record); else unprovable.push(record);
    }
  }

  let unresolved=[...pending];
  for(let pass=0;unresolved.length&&pass<=pending.length;pass++){
    let progress=0;
    const next:Pending[]=[];
    for(const item of unresolved){
      try{
        await materializeEconomicSource({
          sourceKind:item.source.sourceKind,sourceId:item.source.sourceId,temporalEventId:item.temporalEventId,
        });
        materializedCount++; progress++;
      }catch(error){
        const reason=errorText(error);
        if(reason.includes("ECONOMIC_ASSET_OWNERSHIP_MISMATCH")||reason.includes("ECONOMIC_ASSET_LINEAGE_CORRUPT")){
          next.push(item);
          continue;
        }
        const record=Object.freeze({source:sourceKey(item.source),reason});
        if(classify(error)==="CONTRADICTED") contradictions.push(record); else unprovable.push(record);
      }
    }
    unresolved=next;
    if(!progress) break;
  }
  for(const item of unresolved) unprovable.push(Object.freeze({
    source:sourceKey(item.source),reason:"ECONOMIC_ASSET_DEPENDENCY_UNRESOLVED",
  }));

  const audit=await auditEconomicLedger(worldId);
  const status=contradictions.length||audit.status==="CONTRADICTED"
    ?"CONTRADICTED" as const
    :unprovable.length||audit.status==="UNPROVABLE"
      ?"UNPROVABLE" as const
      :"MATCH" as const;
  const summary=Object.freeze({
    schema:"aurion.economic-reconciliation.v1",
    worldId,status,
    sourceCount:inventory.references.length,
    materializedCount,
    unprovable:Object.freeze([...unprovable].sort((a,b)=>a.source.localeCompare(b.source)||a.reason.localeCompare(b.reason))),
    contradictions:Object.freeze([...contradictions].sort((a,b)=>a.source.localeCompare(b.source)||a.reason.localeCompare(b.reason))),
    auditHash:audit.auditHash,
  });
  return Object.freeze({
    gameplayMutationAuthority:"none" as const,
    evidenceMutation:"append_only_projection" as const,
    ...summary,
    unprovableCount:summary.unprovable.length,
    contradictionCount:summary.contradictions.length,
    reconciliationHash:canonicalSha256(summary),
    audit,
  });
}
