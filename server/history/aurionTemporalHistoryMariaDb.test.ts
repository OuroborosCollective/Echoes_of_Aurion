import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aurionCausalTickReceipts, aurionGlobalStateProofs, aurionTemporalEvents } from "../../drizzle/aurionCausalitySchema";
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

    await expect(db.update(aurionTemporalEvents).set({payloadHash:"sha256:"+"0".repeat(64)}).where(eq(aurionTemporalEvents.eventId,first.eventId)))
      .rejects.toThrow(/AURION_TEMPORAL_HISTORY_APPEND_ONLY/);
  },60_000);
});
