import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { aurionCausalTickReceipts, aurionGlobalStateProofs, aurionTemporalEvents } from "../../drizzle/aurionCausalitySchema";
import { aurionQuestReceipts } from "../../drizzle/schema";
import { createTemporalEvent } from "../../shared/aurionTemporalEventContract";
import { getDb, resolveAndRecordGlobalWorldEpoch } from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "../causality/tickRecorder";
import { appendTemporalEvent } from "./aurionTemporalEventPersistence";
import { globalHistoricalWorldStateService } from "./historicalWorldStateService";
import { globalCausalHistoryExplainService } from "./causalHistoryExplainService";

const describeWave3 = process.env.DATABASE_URL && process.env.NODE_ENV === "test" && process.env.AURION_WAVE3_TEMPORAL_E2E === "1" ? describe : describe.skip;
const WORLD_ID="echoes-of-aurion-global";

describeWave3("Wave 3 Steps 32-34 persisted temporal history",()=>{
  it("binds append-only history to replayed world roots and reconstructs superseded state",async()=>{
    const releaseSha=process.env.AURION_RELEASE_SHA;
    expect(releaseSha).toMatch(/^[a-f0-9]{40}$/);
    const db=await getDb();expect(db).not.toBeNull();if(!db)return;

    const zone=new AuthoritativeMovementZone("observatory_threshold");
    zone.sourceRevisionOverride=releaseSha!;
    zone.tick();
    await globalTickRecorder.flushPersistence();
    const firstEpoch=await resolveAndRecordGlobalWorldEpoch({requestedByUserId:2_146_999_960,idempotencyKey:"wave3:temporal:epoch:1",now:new Date("2026-01-01T00:00:00.000Z")});
    expect(firstEpoch).toMatchObject({source:"created",plan:{epoch:1}});

    const firstProof=(await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.epoch,1)).limit(1))[0]!;
    const firstRoot=JSON.parse(firstProof.globalProofJson).root;
    const firstTick=(await db.select().from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.tick,1)).limit(1))[0]!;
    const first=createTemporalEvent({
      eventId:"event:mine:1",worldId:WORLD_ID,epoch:1,domain:"faction",subjectIds:["poi:ember-mine","faction:iron-vanguard"],
      sourceReceiptHash:firstTick.receiptHash,sourceWorldRoot:firstRoot.worldRootHash,sourceRevision:firstRoot.sourceRevision,rulesetVersion:firstRoot.rulesetVersion,
      payload:{controllingFaction:"faction:iron-vanguard",state:"CLAIMED"},
    });
    expect((await appendTemporalEvent(first)).applied).toBe(true);
    expect((await appendTemporalEvent(first)).applied).toBe(false);

    zone.tick();
    await globalTickRecorder.flushPersistence();
    const secondEpoch=await resolveAndRecordGlobalWorldEpoch({requestedByUserId:2_146_999_960,idempotencyKey:"wave3:temporal:epoch:2",now:new Date("2026-01-01T00:00:01.000Z")});
    expect(secondEpoch).toMatchObject({source:"created",plan:{epoch:2}});
    const secondProof=(await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.epoch,2)).limit(1))[0]!;
    const secondRoot=JSON.parse(secondProof.globalProofJson).root;
    const secondTick=(await db.select().from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.tick,2)).limit(1))[0]!;
    const second=createTemporalEvent({
      eventId:"event:mine:2",worldId:WORLD_ID,epoch:2,domain:"faction",subjectIds:["poi:ember-mine","faction:solar-dawn"],
      sourceReceiptHash:secondTick.receiptHash,sourceWorldRoot:secondRoot.worldRootHash,sourceRevision:secondRoot.sourceRevision,rulesetVersion:secondRoot.rulesetVersion,
      predecessorEventIds:[first.eventId],payload:{controllingFaction:"faction:solar-dawn",state:"CLAIMED"},
    });
    expect((await appendTemporalEvent(second)).applied).toBe(true);

    const questReceiptHash="a".repeat(64);
    await db.insert(aurionQuestReceipts).values({
      id:"quest-receipt-wave3-2",instanceId:"quest-instance-wave3",eventSequence:1,
      planHash:"b".repeat(64),graphHash:"c".repeat(64),previousStateHash:"d".repeat(64),resultStateHash:"e".repeat(64),
      idempotencyKey:"wave3:quest:receipt:2",receiptHash:questReceiptHash,
    });
    const questEvent=createTemporalEvent({
      eventId:"event:quest:2",worldId:WORLD_ID,epoch:2,domain:"quest",subjectIds:["quest:ember-trial"],
      sourceReceiptHash:`sha256:${questReceiptHash}`,sourceWorldRoot:secondRoot.worldRootHash,sourceRevision:secondRoot.sourceRevision,rulesetVersion:secondRoot.rulesetVersion,
      predecessorEventIds:[second.eventId],payload:{status:"COMPLETED",questReceiptId:"quest-receipt-wave3-2"},
    });
    expect((await appendTemporalEvent(questEvent)).applied).toBe(true);
    const questExplanation=await globalCausalHistoryExplainService.explainFactAtEpoch({
      worldId:WORLD_ID,targetFactOrEventId:questEvent.eventId,epoch:2,
    });
    expect(questExplanation).toMatchObject({status:"MATCH",mutationAuthority:"none",rootEvidenceReached:true});
    expect(questExplanation.chain.map(step=>step.eventId)).toEqual(["event:quest:2","event:mine:2","event:mine:1"]);

    const unboundReceipt=createTemporalEvent({
      eventId:"event:receipt:unbound",worldId:WORLD_ID,epoch:2,domain:"world",subjectIds:["evidence:unbound"],
      sourceReceiptHash:"sha256:"+"f".repeat(64),sourceWorldRoot:secondRoot.worldRootHash,sourceRevision:secondRoot.sourceRevision,rulesetVersion:secondRoot.rulesetVersion,
      payload:{state:"MUST_NOT_PERSIST"},
    });
    await expect(appendTemporalEvent(unboundReceipt)).rejects.toThrow("TEMPORAL_SOURCE_RECEIPT_NOT_FOUND");

    const left=createTemporalEvent({
      eventId:"event:diamond:left",worldId:WORLD_ID,epoch:2,domain:"world",subjectIds:["cause:left"],
      sourceReceiptHash:secondTick.receiptHash,sourceWorldRoot:secondRoot.worldRootHash,sourceRevision:secondRoot.sourceRevision,rulesetVersion:secondRoot.rulesetVersion,
      predecessorEventIds:[first.eventId],payload:{branch:"left"},
    });
    const right=createTemporalEvent({
      eventId:"event:diamond:right",worldId:WORLD_ID,epoch:2,domain:"world",subjectIds:["cause:right"],
      sourceReceiptHash:secondTick.receiptHash,sourceWorldRoot:secondRoot.worldRootHash,sourceRevision:secondRoot.sourceRevision,rulesetVersion:secondRoot.rulesetVersion,
      predecessorEventIds:[first.eventId],payload:{branch:"right"},
    });
    const merge=createTemporalEvent({
      eventId:"event:diamond:merge",worldId:WORLD_ID,epoch:2,domain:"world",subjectIds:["cause:merge"],
      sourceReceiptHash:secondTick.receiptHash,sourceWorldRoot:secondRoot.worldRootHash,sourceRevision:secondRoot.sourceRevision,rulesetVersion:secondRoot.rulesetVersion,
      predecessorEventIds:[left.eventId,right.eventId],payload:{state:"merged"},
    });
    expect((await appendTemporalEvent(left)).applied).toBe(true);
    expect((await appendTemporalEvent(right)).applied).toBe(true);
    expect((await appendTemporalEvent(merge)).applied).toBe(true);

    const atOne=await globalHistoricalWorldStateService.reconstructStateAtEpoch({worldId:WORLD_ID,epoch:1,subjectId:"poi:ember-mine"});
    expect(atOne).toMatchObject({status:"MATCH",mutationAuthority:"none"});
    expect(atOne.facts).toHaveLength(1);
    expect(atOne.facts[0]?.state).toEqual({controllingFaction:"faction:iron-vanguard",state:"CLAIMED"});

    const atTwo=await globalHistoricalWorldStateService.reconstructStateAtEpoch({worldId:WORLD_ID,epoch:2,subjectId:"poi:ember-mine"});
    expect(atTwo).toMatchObject({status:"MATCH",mutationAuthority:"none"});
    expect(atTwo.facts).toHaveLength(1);
    expect(atTwo.facts[0]?.state).toEqual({controllingFaction:"faction:solar-dawn",state:"CLAIMED"});
    expect(atTwo.reconstructionHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const explanation=await globalCausalHistoryExplainService.explainFactAtEpoch({worldId:WORLD_ID,targetFactOrEventId:"event:mine:2",epoch:2});
    expect(explanation).toMatchObject({status:"MATCH",mutationAuthority:"none",rootEvidenceReached:true});
    expect(explanation.chain.map(step=>step.eventId)).toEqual(["event:mine:2","event:mine:1"]);

    const factExplanation=await globalCausalHistoryExplainService.explainFactAtEpoch({worldId:WORLD_ID,targetFactOrEventId:atTwo.facts[0]!.factId,epoch:2});
    expect(factExplanation).toMatchObject({status:"MATCH",mutationAuthority:"none",rootEvidenceReached:true});
    expect(factExplanation.chain.map(step=>step.eventId)).toEqual(["event:mine:2","event:mine:1"]);

    const convergent=await globalCausalHistoryExplainService.explainFactAtEpoch({worldId:WORLD_ID,targetFactOrEventId:merge.eventId,epoch:2});
    expect(convergent).toMatchObject({status:"MATCH",mutationAuthority:"none",rootEvidenceReached:true});
    expect(convergent.chain.map(step=>step.eventId)).toEqual(["event:diamond:merge","event:diamond:left","event:diamond:right","event:mine:1"]);

    const raw=await mysql.createConnection(process.env.DATABASE_URL!);
    try {
      let rejected="";
      try {
        await raw.query("UPDATE aurionTemporalEvents SET payloadHash=? WHERE eventId=?", ["sha256:"+"0".repeat(64), first.eventId]);
      } catch(error) {
        rejected=String((error as {sqlMessage?:unknown}).sqlMessage ?? (error as Error).message);
      }
      expect(rejected).toContain("AURION_TEMPORAL_HISTORY_APPEND_ONLY");

      const overflowRows=Array.from({length:513},(_,index)=>[
        `overflow:${String(index).padStart(3,"0")}`,"overflow-world",1,"world",1,null,
        "sha256:"+"1".repeat(64),"sha256:"+"2".repeat(64),releaseSha!,"wave3-overflow-test","{}",
        "sha256:"+"3".repeat(64),`sha256:${index.toString(16).padStart(64,"0")}`,
      ]);
      const placeholders=overflowRows.map(()=>"(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      await raw.query(
        `INSERT INTO aurionTemporalEvents (eventId,worldId,epoch,domain,validFromEpoch,validToEpoch,sourceReceiptHash,sourceWorldRoot,sourceRevision,rulesetVersion,payloadJson,payloadHash,eventHash) VALUES ${placeholders}`,
        overflowRows.flat(),
      );
      const overflow=await globalHistoricalWorldStateService.reconstructStateAtEpoch({worldId:"overflow-world",epoch:1});
      expect(overflow).toMatchObject({status:"UNPROVABLE",reason:"TEMPORAL_HISTORY_LIMIT_EXCEEDED"});
    } finally {
      await raw.end();
    }
  },90_000);
});
