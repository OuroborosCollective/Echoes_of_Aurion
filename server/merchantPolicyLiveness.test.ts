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
  verifyConfirmedNpcDecision,
  type HubId,
  type MerchantGatewayContext,
} from "./wasdNpcCapsule";

// Production 2026-11-05: three hub merchants were stuck for days because a blocked
// action records no new decision and the live loop uses a fixed world seed, so the
// same decision is re-planned into the same block forever (TARGET_RANGE,
// INVENTORY_UNAVAILABLE). Under the versioned storage and travel policies a valid
// context must therefore never plan into a resource/range block.
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

function source(tick:number, withPlan:boolean, economy:{currentHubId:HubId;wealthCopper:number;hungerBps:number;fatigueBps:number;tradeProwessBps:number;harvestYieldBps:number}, gatherResources=false) {
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
    economy,
    opportunities:withPlan ? opportunities(tick,hub) : [],
  });
  const snapshot=createNpcLifeSnapshot({
    ...request,
    needs:resolveNpcNeeds({current:{safety:1,resources:gatherResources?0:1,belonging:1,status:1,wealth:gatherResources?1:0,power:1},events:[]}),
    memoryState:advanceNpcMemory(parseNpcMemory("[]",-1),[],tick),
  });
  const raw=encodeNpcLifeReceipt(npcRequestHash(request,NPC_LIFE_RECEIPT_VERSION),snapshot);
  const expected={receiptId:`npc_${npcHash([NPC_LIFE_RECEIPT_VERSION,npcId,tick]).slice(0,56)}`,npcId,regionId:hub,resolutionIndex:tick,goal:snapshot.decision.goal,decisionHash:snapshot.decision.decisionHash};
  return {raw,expected,confirmed:verifyConfirmedNpcDecision(raw,expected),hub};
}


const hubs = Object.keys(merchantBootstrapMarkets).sort() as HubId[];
const commodities = Object.keys(merchantBootstrapMarkets.observatory_threshold.stock);
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

function policyContext(random: () => number, tick: number): MerchantGatewayContext {
  const currentHubId = hubs[Math.floor(random() * hubs.length)]!;
  const wealthBand = random();
  const wealthCopper = wealthBand < 0.1 ? 1_000_000_000 - Math.floor(random() * 500) : wealthBand < 0.2 ? Math.floor(random() * 2_000_000) : Math.floor(random() * 5000);
  const economy = { currentHubId, wealthCopper, hungerBps: Math.floor(random() * 10001), fatigueBps: Math.floor(random() * 10001), tradeProwessBps: 10500, harvestYieldBps: 10000 };
  const s = source(tick, true, economy, random() < 0.5);
  const npc = confirmedNpcEconomy(s.hub, s.confirmed.snapshot);
  // Includes empty shelves, stock beyond the historical 1e6 bound (unbounded storage)
  // and treasuries at the validated copper ceiling.
  const markets = Object.fromEntries(hubs.map(hub => [hub, { ...merchantBootstrapMarkets[hub],
    treasuryCopper: random() < 0.1 ? 1_000_000_000 - Math.floor(random() * 50) : merchantBootstrapMarkets[hub].treasuryCopper,
    stock: Object.fromEntries(commodities.map(c => { const band = random(); return [c, band < 0.25 ? 0 : band < 0.32 ? 1_000_000 + Math.floor(random() * 1e9) : Math.floor(random() * 2000)]; })) }]));
  const market = markets[npc.currentHubId]!;
  const marketVersion = 7, polityVersion = 3, stability = 40 + Math.floor(random() * 61);
  const ownerId = `market:${market.hubId}`;
  const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
  return Object.freeze({
    storagePolicyVersion: "aurion.merchant-storage.unbounded.v1" as const,
    travelPolicyVersion: "aurion.merchant-travel.v1" as const,
    worldSeed: `echoes-of-aurion-v1:${Math.floor(random() * 1e9)}`,
    homeHubId: s.hub, logicalIndex: tick + 1, confirmedDecision: s.confirmed,
    epoch: { npcResolutionIndex: tick, marketVersion, polityVersion }, npc, market,
    marketEvidence: { version: marketVersion, stateHash: merchantMarketStateHash(market as never) },
    polity: { polityId: `polity:${market.hubId}`, version: polityVersion, stability, stateHash: merchantPolityStateHash({ polityId: `polity:${market.hubId}`, version: polityVersion, stability }) },
    inventory: { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market: market as never, entries }) },
    targets: hubs.map(hub => ({ id: `market:${hub}`, kind: "market" as const, market: markets[hub], version: marketVersion, active: true, polityStability: 40 + Math.floor(random() * 61) })),
  }) as MerchantGatewayContext;
}

describe("merchant policy liveness (no permanent re-plan block)", () => {
  it("never plans a valid policy context into a resource or range block", () => {
    const random = rng(20261105);
    const blocked: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const ctx = policyContext(random, 1 + Math.floor(random() * 30000));
      const plan = planMerchantAction(ctx);
      if (plan.status === "ready") seen.add(plan.resolution.action);
      if (plan.status === "blocked" && blocked.length < 5) blocked.push(`${plan.code}:${plan.action}:wealth=${ctx.npc.wealthCopper}:hunger=${ctx.npc.hungerBps}`);
    }
    expect(blocked).toEqual([]);
    // The generator exercises the decision space, including consumption and travel.
    expect([...seen].sort()).toEqual(expect.arrayContaining(["caravan", "consume", "produce", "rest", "trade"]));
  });

  it("saturates wealth and treasury at the validated ceiling instead of invalidating the next context", () => {
    const random = rng(7);
    let checked = 0;
    for (let i = 0; i < 4000 && checked < 50; i++) {
      const ctx = policyContext(random, 1 + i);
      const plan = planMerchantAction(ctx);
      if (plan.status !== "ready" || ctx.npc.wealthCopper < 999_000_000) continue;
      expect(plan.resolution.npc.wealthCopper).toBeLessThanOrEqual(1_000_000_000);
      expect(plan.resolution.market.treasuryCopper).toBeLessThanOrEqual(1_000_000_000);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });
});
