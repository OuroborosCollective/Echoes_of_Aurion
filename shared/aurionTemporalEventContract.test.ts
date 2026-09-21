import { describe,expect,it } from "vitest";
import { canonicalSha256 } from "./aurionCanonicalHash";
import { createTemporalEvent,verifyTemporalEventIntegrity } from "./aurionTemporalEventContract";

const source={sourceReceiptHash:canonicalSha256("receipt"),sourceWorldRoot:canonicalSha256("root"),sourceRevision:"a".repeat(40),rulesetVersion:"aurion.zone.rules.v2"};

describe("Wave 3 Steps 32-34 temporal contract",()=>{
  it("canonicalizes subjects and predecessors and produces stable identity",()=>{
    const a=createTemporalEvent({eventId:"event:2",worldId:"echoes-of-aurion-global",epoch:2,domain:"faction",subjectIds:["poi:mine","faction:valkyr"],predecessorEventIds:["event:1"],payload:{state:"CLAIMED"},...source});
    const b=createTemporalEvent({eventId:"event:2",worldId:"echoes-of-aurion-global",epoch:2,domain:"faction",subjectIds:["faction:valkyr","poi:mine"],predecessorEventIds:["event:1"],payload:{state:"CLAIMED"},...source});
    expect(a).toEqual(b);
    expect(verifyTemporalEventIntegrity(a)).toEqual({valid:true});
  });
  it("rejects duplicate subjects, malformed roots and oversized payloads",()=>{
    expect(()=>createTemporalEvent({eventId:"event:1",worldId:"world",epoch:1,domain:"world",subjectIds:["world","world"],payload:{ok:true},...source})).toThrow(/DUPLICATE/);
    expect(()=>createTemporalEvent({eventId:"event:1",worldId:"world",epoch:1,domain:"world",subjectIds:["world"],payload:{ok:true},...source,sourceWorldRoot:"fake"})).toThrow(/SOURCE_HASH/);
    expect(()=>createTemporalEvent({eventId:"event:1",worldId:"world",epoch:1,domain:"world",subjectIds:["world"],payload:{blob:"x".repeat(61000)},...source})).toThrow(/TOO_LARGE/);
  });
  it("detects tampering without accepting a green label as evidence",()=>{
    const event=createTemporalEvent({eventId:"event:1",worldId:"world",epoch:1,domain:"quest",subjectIds:["quest:q1"],payload:{status:"ACTIVE"},...source});
    expect(verifyTemporalEventIntegrity({...event,payload:{status:"FAKE"}})).toMatchObject({valid:false});
  });
});
