import { and, asc, eq, inArray } from "drizzle-orm";
import { aurionCausalTickReceipts, aurionTemporalEventPredecessors, aurionTemporalEventSubjects, aurionTemporalEvents } from "../../drizzle/aurionCausalitySchema";
import { canonicalJson } from "../../shared/aurionCanonicalHash";
import { type AurionTemporalEvent, verifyTemporalEventIntegrity } from "../../shared/aurionTemporalEventContract";
import { getDb } from "../db";
import { worldCausalRootService } from "../causality/worldCausalRootService";

type Database=NonNullable<Awaited<ReturnType<typeof getDb>>>;
type TemporalTx=Parameters<Parameters<Database["transaction"]>[0]>[0];
type TemporalReader=Pick<TemporalTx,"select">;

async function decodeStored(reader:TemporalReader,eventId:string):Promise<AurionTemporalEvent|null>{
  const row=(await reader.select().from(aurionTemporalEvents).where(eq(aurionTemporalEvents.eventId,eventId)).limit(1))[0];
  if(!row) return null;
  const [subjects,predecessors]=await Promise.all([
    reader.select().from(aurionTemporalEventSubjects).where(eq(aurionTemporalEventSubjects.eventId,eventId)),
    reader.select().from(aurionTemporalEventPredecessors).where(eq(aurionTemporalEventPredecessors.eventId,eventId)),
  ]);
  const event:AurionTemporalEvent={
    schema:"aurion.temporal.event.v1",
    eventId:row.eventId,worldId:row.worldId,epoch:row.epoch,domain:row.domain,
    subjectIds:Object.freeze(subjects.map(value=>value.subjectId).sort()),
    validFromEpoch:row.validFromEpoch,validToEpoch:row.validToEpoch,
    sourceReceiptHash:row.sourceReceiptHash,sourceWorldRoot:row.sourceWorldRoot,sourceRevision:row.sourceRevision,rulesetVersion:row.rulesetVersion,
    predecessorEventIds:Object.freeze(predecessors.map(value=>value.predecessorEventId).sort()),
    payload:Object.freeze(JSON.parse(row.payloadJson) as Record<string,unknown>),
    payloadHash:row.payloadHash,eventHash:row.eventHash,
  };
  const verified=verifyTemporalEventIntegrity(event);
  if(!verified.valid) throw new Error(`TEMPORAL_STORED_EVENT_CORRUPT:${verified.reason??"UNKNOWN"}`);
  return Object.freeze(event);
}

export async function verifyTemporalEventSource(event:AurionTemporalEvent):Promise<void>{
  const persisted=await worldCausalRootService.read(event.worldId,event.epoch);
  if(!persisted||persisted.status!=="VERIFIED"||!persisted.root) throw new Error("TEMPORAL_WORLD_ROOT_UNPROVABLE");
  if(persisted.root.worldRootHash!==event.sourceWorldRoot||persisted.root.sourceRevision!==event.sourceRevision||persisted.root.rulesetVersion!==event.rulesetVersion) {
    throw new Error("TEMPORAL_WORLD_ROOT_IDENTITY_MISMATCH");
  }
  const db=await getDb(); if(!db) throw new Error("TEMPORAL_DATABASE_UNAVAILABLE");
  const receipts=await db.select().from(aurionCausalTickReceipts).where(and(
    eq(aurionCausalTickReceipts.receiptHash,event.sourceReceiptHash),
    eq(aurionCausalTickReceipts.worldId,event.worldId),
  )).limit(2);
  if(receipts.length!==1) throw new Error("TEMPORAL_SOURCE_RECEIPT_UNPROVABLE");
  const receipt=receipts[0]!;
  if(receipt.revision!==event.sourceRevision||receipt.rulesetVersion!==event.rulesetVersion) throw new Error("TEMPORAL_SOURCE_RECEIPT_IDENTITY_MISMATCH");
  const zoneRoot=persisted.root.zoneRoots.find(value=>value.zoneId===receipt.zoneId);
  if(!zoneRoot||receipt.tick<zoneRoot.fromTick||receipt.tick>zoneRoot.toTick) throw new Error("TEMPORAL_SOURCE_RECEIPT_OUTSIDE_WORLD_ROOT");
  const replay=await worldCausalRootService.replay(event.worldId,event.epoch);
  if(replay.status!=="MATCH"||replay.worldRootHash!==event.sourceWorldRoot) throw new Error("TEMPORAL_WORLD_ROOT_REPLAY_MISMATCH");
}

export async function appendTemporalEvent(event:AurionTemporalEvent){
  const integrity=verifyTemporalEventIntegrity(event);
  if(!integrity.valid) throw new Error(`TEMPORAL_EVENT_INVALID:${integrity.reason??"UNKNOWN"}`);
  await verifyTemporalEventSource(event);
  const db=await getDb(); if(!db) throw new Error("TEMPORAL_DATABASE_UNAVAILABLE");
  return db.transaction(async tx=>{
    const prior=await decodeStored(tx,event.eventId);
    if(prior){
      if(prior.eventHash!==event.eventHash||canonicalJson(prior)!==canonicalJson(event)) throw new Error("TEMPORAL_EVENT_ID_CONFLICT");
      return Object.freeze({applied:false as const,event:prior});
    }
    if(event.predecessorEventIds.length){
      const rows=await tx.select().from(aurionTemporalEvents).where(inArray(aurionTemporalEvents.eventId,[...event.predecessorEventIds]));
      if(rows.length!==event.predecessorEventIds.length) throw new Error("TEMPORAL_PREDECESSOR_MISSING");
      for(const row of rows) if(row.worldId!==event.worldId||row.validFromEpoch>event.validFromEpoch) throw new Error("TEMPORAL_PREDECESSOR_IDENTITY_INVALID");
    }
    await tx.insert(aurionTemporalEvents).values({
      eventId:event.eventId,worldId:event.worldId,epoch:event.epoch,domain:event.domain,validFromEpoch:event.validFromEpoch,validToEpoch:event.validToEpoch,
      sourceReceiptHash:event.sourceReceiptHash,sourceWorldRoot:event.sourceWorldRoot,sourceRevision:event.sourceRevision,rulesetVersion:event.rulesetVersion,
      payloadJson:canonicalJson(event.payload),payloadHash:event.payloadHash,eventHash:event.eventHash,
    });
    await tx.insert(aurionTemporalEventSubjects).values(event.subjectIds.map(subjectId=>({
      eventId:event.eventId,worldId:event.worldId,subjectId,domain:event.domain,validFromEpoch:event.validFromEpoch,validToEpoch:event.validToEpoch,
    })));
    if(event.predecessorEventIds.length) await tx.insert(aurionTemporalEventPredecessors).values(event.predecessorEventIds.map(predecessorEventId=>({
      eventId:event.eventId,predecessorEventId,worldId:event.worldId,
    })));
    const stored=await decodeStored(tx,event.eventId);
    if(!stored||stored.eventHash!==event.eventHash||canonicalJson(stored)!==canonicalJson(event)) throw new Error("TEMPORAL_EVENT_READBACK_MISMATCH");
    return Object.freeze({applied:true as const,event:stored});
  });
}

export async function readTemporalEventById(eventId:string):Promise<AurionTemporalEvent|null>{
  const db=await getDb(); if(!db) throw new Error("TEMPORAL_DATABASE_UNAVAILABLE");
  return db.transaction(tx=>decodeStored(tx,eventId));
}

export async function readTemporalEventsForWorld(worldId:string,limit=512):Promise<readonly AurionTemporalEvent[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>512) throw new Error("TEMPORAL_READ_LIMIT_INVALID");
  const db=await getDb(); if(!db) throw new Error("TEMPORAL_DATABASE_UNAVAILABLE");
  return db.transaction(async tx=>{
    const rows=await tx.select({eventId:aurionTemporalEvents.eventId}).from(aurionTemporalEvents)
      .where(eq(aurionTemporalEvents.worldId,worldId)).orderBy(asc(aurionTemporalEvents.epoch),asc(aurionTemporalEvents.eventId)).limit(limit+1);
    if(rows.length>limit) throw new Error("TEMPORAL_HISTORY_LIMIT_EXCEEDED");
    const out=[] as AurionTemporalEvent[];
    for(const row of rows){const event=await decodeStored(tx,row.eventId);if(event) out.push(event);}
    return Object.freeze(out);
  });
}

export async function readTemporalEventsForSubject(worldId:string,subjectId:string,limit=512):Promise<readonly AurionTemporalEvent[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>512) throw new Error("TEMPORAL_READ_LIMIT_INVALID");
  const db=await getDb(); if(!db) throw new Error("TEMPORAL_DATABASE_UNAVAILABLE");
  return db.transaction(async tx=>{
    const rows=await tx.select({eventId:aurionTemporalEventSubjects.eventId}).from(aurionTemporalEventSubjects)
      .where(and(eq(aurionTemporalEventSubjects.worldId,worldId),eq(aurionTemporalEventSubjects.subjectId,subjectId)))
      .orderBy(asc(aurionTemporalEventSubjects.validFromEpoch),asc(aurionTemporalEventSubjects.eventId)).limit(limit+1);
    if(rows.length>limit) throw new Error("TEMPORAL_HISTORY_LIMIT_EXCEEDED");
    const out=[] as AurionTemporalEvent[];
    for(const row of rows){const event=await decodeStored(tx,row.eventId);if(event) out.push(event);}
    return Object.freeze(out);
  });
}
