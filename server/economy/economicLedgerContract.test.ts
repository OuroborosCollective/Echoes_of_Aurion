import { describe,expect,it } from "vitest";
import { createEconomicEvent } from "../../shared/aurionEconomicEventContract";

const base={
  worldId:"echoes-of-aurion-global",epoch:1,sourceKind:"trade_crafting" as const,sourceId:"receipt:1",
  sourceEvidenceHash:"sha256:"+"1".repeat(64),temporalEventId:"temporal:1",temporalEventHash:"sha256:"+"2".repeat(64),
  sourceWorldRoot:"sha256:"+"3".repeat(64),sourceRevision:"a".repeat(40),rulesetVersion:"aurion.zone.rules.v2",
};
describe("Wave 3 Steps 35-37 economic contract",()=>{
  it("canonicalizes exact resource deltas without floats",()=>{
    const event=createEconomicEvent({...base,eventId:"economic:1",eventType:"resource_delta",resourceDeltas:[
      {resourceId:"wood",accountId:"character:1",deltaExact:"25"},{resourceId:"aether",accountId:"character:1",deltaExact:"-3"}
    ],assetTransitions:[]});
    expect(event.resourceDeltas.map(value=>value.resourceId)).toEqual(["aether","wood"]);
    expect(event.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it("rejects duplicate resources and malformed asset creation",()=>{
    expect(()=>createEconomicEvent({...base,eventId:"economic:1",eventType:"resource_delta",resourceDeltas:[
      {resourceId:"wood",accountId:"character:1",deltaExact:"1"},{resourceId:"wood",accountId:"character:1",deltaExact:"2"}
    ],assetTransitions:[]})).toThrow(/DUPLICATE/);
    expect(()=>createEconomicEvent({...base,eventId:"economic:2",eventType:"asset_create",sourceKind:"loot_v2",resourceDeltas:[],assetTransitions:[
      {assetId:"item:1",transitionKind:"create",fromOwnerId:"user:1",toOwnerId:"user:1"}
    ]})).toThrow(/ASSET_CREATE/);
  });
});
