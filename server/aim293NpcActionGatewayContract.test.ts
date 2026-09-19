import { describe, expect, it } from "vitest";
import {
  NPC_LIFE_RECEIPT_VERSION,
  advanceNpcMemory,
  confirmedNpcEconomy,
  createNpcLifeSnapshot,
  encodeNpcLifeReceipt,
  merchantBootstrapMarkets,
  merchantInventoryStateHash,
  merchantMarketStateHash,
  merchantPolityStateHash,
  normalizeNpcRequest,
  npcHash,
  npcIdentity,
  npcRequestHash,
  parseNpcMemory,
  planMerchantAction,
  resolveNpcNeeds,
  validateMerchantAction,
  verifyConfirmedNpcDecision,
  type HubId,
  type MerchantGatewayContext,
} from "./wasdNpcCapsule";

function opportunities(tick:number, hub:HubId) {
  const specs = [
    ["safe_hub","safe"],
    ["resource","resource"],
    ["social","social"],
    ["reputation","reputation"],
    ["market","market"],
    ["influence","influence"],
  ] as const;
  return specs.map(([kind,suffix]) => ({
    id:`op:${tick}:${suffix}`,
    kind,
    regionId:hub,
    targetId:`target:${suffix}`,
    benefitBps:8_000,
    riskBps:0,
    distanceBps:0,
    sourceReceiptId:`evidence:${tick}`,
    resolutionIndex:tick,
  }));
}

function source(tick=0, withPlan=true) {
  const hub:HubId="observatory_threshold";
  const npcId=npcIdentity(hub);
  const request=normalizeNpcRequest({
    npcId,
    regionId:hub,
    resolutionIndex:tick,
    needEvents:[],
    observationIds:[`source:${tick}`],
    memory:[],
    roleId:"merchant",
    economy:{currentHubId:hub,wealthCopper:1200,hungerBps:2000,fatigueBps:1500,tradeProwessBps:10500,harvestYieldBps:10000},
    opportunities:withPlan ? opportunities(tick,hub) : [],
  });
  const snapshot=createNpcLifeSnapshot({
    ...request,
    needs:resolveNpcNeeds({current:{safety:1,resources:1,belonging:1,status:1,wealth:0,power:1},events:[]}),
    memoryState:advanceNpcMemory(parseNpcMemory("[]",-1),[],tick),
  });
  const raw=encodeNpcLifeReceipt(npcRequestHash(request,NPC_LIFE_RECEIPT_VERSION),snapshot);
  const expected={receiptId:`npc_${npcHash([NPC_LIFE_RECEIPT_VERSION,npcId,tick]).slice(0,56)}`,npcId,regionId:hub,resolutionIndex:tick,goal:snapshot.decision.goal,decisionHash:snapshot.decision.decisionHash};
  return {raw,expected,confirmed:verifyConfirmedNpcDecision(raw,expected),hub};
}

function context(tick=0):MerchantGatewayContext {
  const s=source(tick,true);
  const npc=confirmedNpcEconomy(s.hub,s.confirmed.snapshot);
  const market=merchantBootstrapMarkets[npc.currentHubId];
  const marketVersion=7;
  const polityVersion=3;
  const ownerId=`market:${market.hubId}`;
  const entries=Object.entries(market.stock).map(([itemId,quantity])=>({itemId,quantity,capacity:1_000_000}));
  return Object.freeze({
    worldSeed:"aim293-contract-world",
    homeHubId:s.hub,
    logicalIndex:tick+1,
    confirmedDecision:s.confirmed,
    epoch:{npcResolutionIndex:tick,marketVersion,polityVersion},
    npc,
    market,
    marketEvidence:{version:marketVersion,stateHash:merchantMarketStateHash(market)},
    polity:{polityId:`polity:${market.hubId}`,version:polityVersion,stability:72,stateHash:merchantPolityStateHash({polityId:`polity:${market.hubId}`,version:polityVersion,stability:72})},
    inventory:{ownerId,entries,stateHash:merchantInventoryStateHash({ownerId,market,entries})},
    targets:Object.values(merchantBootstrapMarkets).map(value=>({id:`market:${value.hubId}`,kind:"market" as const,market:value,version:marketVersion,active:true})),
  }) as MerchantGatewayContext;
}

describe("Wave 2 Step 26 WASD AIM-293 action gateway contract",()=>{
  it("rejects JSON look-alikes and blocked source plans before effect requests exist",()=>{
    const ctx=context();
    expect(()=>planMerchantAction({...ctx,confirmedDecision:{...ctx.confirmedDecision}} as MerchantGatewayContext)).toThrow(/CONFIRMED_SOURCE_REQUIRED/);
    const blockedSource=source(0,false);
    const blocked=planMerchantAction({...ctx,confirmedDecision:blockedSource.confirmed});
    expect(blocked.status).toBe("blocked");
    if(blocked.status==="blocked"){
      expect(blocked.code).toBe("SOURCE_PLAN_BLOCKED");
      expect("requests" in blocked).toBe(false);
    }
  });

  it("fails closed on market, polity, inventory and target evidence drift",()=>{
    const ctx=context();
    const cases=[
      planMerchantAction({...ctx,marketEvidence:{...ctx.marketEvidence,version:0}}),
      planMerchantAction({...ctx,polity:{...ctx.polity,stability:71}}),
      planMerchantAction({...ctx,inventory:{...ctx.inventory,entries:ctx.inventory.entries.map(entry=>({...entry,capacity:entry.capacity-1}))}}),
      planMerchantAction({...ctx,targets:ctx.targets.map((target,index)=>index===0?{...target,market:{...target.market,treasuryCopper:target.market.treasuryCopper+1}}:target)}),
    ];
    expect(cases.every(result=>result.status==="blocked")).toBe(true);
    expect(cases.map(result=>result.status==="blocked"?result.code:"")).toEqual([
      "MARKET_STATE_MISMATCH",
      "POLITY_STATE_MISMATCH",
      "INVENTORY_STATE_MISMATCH",
      "TARGET_STATE_MISMATCH",
    ]);
    expect(cases.every(result=>!("requests" in result))).toBe(true);
  });

  it("revalidates exact intent/revision/lease and rejects stale or conflicting leases",()=>{
    const ctx=context();
    const ready=planMerchantAction(ctx);
    expect(ready.status).toBe("ready");
    if(ready.status!=="ready") return;
    const accepted=validateMerchantAction({context:ctx,intent:ready.intent,lease:ready.proposedLease});
    expect(accepted.status).toBe("validated");
    if(accepted.status==="validated"){
      expect(accepted.receipt.effectsHash).toBeDefined();
      expect(accepted.requests.receiptId).toBe(accepted.receipt.id);
    }
    const revision=validateMerchantAction({context:ctx,intent:{...ready.intent,authority:{...ready.intent.authority,sourceRevision:"0".repeat(40)}},lease:ready.proposedLease});
    const expired=validateMerchantAction({context:ctx,intent:ready.intent,lease:{...ready.proposedLease,issuedAtLogicalIndex:0,expiresAtLogicalIndex:0}});
    const revoked=validateMerchantAction({context:ctx,intent:ready.intent,lease:{...ready.proposedLease,state:"revoked"}});
    const conflict=validateMerchantAction({context:ctx,intent:ready.intent,lease:{...ready.proposedLease,id:"npl_conflict"}});
    expect(revision.status==="blocked"&&revision.code).toBe("REVISION_MISMATCH");
    expect(expired.status==="blocked"&&expired.code).toBe("LEASE_EXPIRED");
    expect(revoked.status==="blocked"&&revoked.code).toBe("LEASE_REVOKED");
    expect(conflict.status==="blocked"&&conflict.code).toBe("LEASE_CONFLICT");
  });
});
