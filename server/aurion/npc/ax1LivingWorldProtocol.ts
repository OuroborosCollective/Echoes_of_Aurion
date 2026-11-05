// Native Aurion AX1 living world protocol.
// Migrated from WASD/AX1 provenance; active implementation is Aurion-owned.

import { createHash } from "node:crypto";
import type { NpcGoal } from "./npcNeeds.js";
import { stableCatalogStringify } from "./canonical.js";

export const AX1_LIVING_WORLD_RULESET = "aurion-ax1-living-world.v2" as const;

export const livingWorldSocialActions = [
  "negotiation",
  "diplomacy",
  "intimidation",
  "friendship",
  "trade",
  "leadership",
  "politics",
] as const;
export type LivingWorldSocialAction = (typeof livingWorldSocialActions)[number];

export type HubId = "observatory_threshold" | "windhollow" | "emberfall" | "cinder_vault";
export type CommodityId = "grain" | "sandstone" | "bronze" | "aether" | "salve" | "rune_core";

export type MarketState = Readonly<{
  hubId: HubId;
  controllingGuild: string;
  taxRateBasisPoints: number;
  treasuryCopper: number;
  stock: Readonly<Record<CommodityId, number>>;
}>;

export type NpcEconomyState = Readonly<{
  npcId: string;
  name: string;
  currentHubId: HubId;
  wealthCopper: number;
  hungerBps: number;
  fatigueBps: number;
  tradeProwessBps: number;
  harvestYieldBps: number;
  memory: readonly string[];
}>;

/** Explicit server-selected rule; absence retains historical bounded behavior. */
export const MERCHANT_STORAGE_POLICY = "aurion.merchant-storage.unbounded.v1" as const;
export type MerchantStoragePolicy = typeof MERCHANT_STORAGE_POLICY;
export const MERCHANT_TRAVEL_POLICY = "aurion.merchant-travel.v1" as const;
export type MerchantTravelPolicy = typeof MERCHANT_TRAVEL_POLICY;
export type MerchantTravelMarket = Readonly<{ market: MarketState; polityStability: number }>;


export type LivingWorldResolution = Readonly<{
  resolutionIndex: number;
  market: MarketState;
  npc: NpcEconomyState;
  preferredGoal: NpcGoal | null;
  action: "consume" | "produce" | "trade" | "caravan" | "patrol" | "rest" | "socialize";
  commodity: CommodityId;
  quantity: number;
  unitPriceCopper: number;
  taxCopper: number;
  caravan: Readonly<{
    destination: HubId | null;
    securityIndex: number;
    ambushed: boolean;
  }>;
  nextMemory: readonly string[];
  stabilityDelta: number;
  deterministicHash: string;
  travelPlan?: ReturnType<typeof planMerchantJourney>;
}>;

const commodityBasePrice: Readonly<Record<CommodityId, number>> = Object.freeze({
  grain: 20,
  sandstone: 45,
  bronze: 90,
  aether: 220,
  salve: 60,
  rune_core: 450,
});

const productionFocus: Readonly<Record<HubId, readonly CommodityId[]>> = Object.freeze({
  observatory_threshold: ["salve", "rune_core"],
  windhollow: ["grain"],
  emberfall: ["sandstone", "bronze"],
  cinder_vault: ["aether", "rune_core"],
});

const routeSecurity: Readonly<Record<string, number>> = Object.freeze({
  "observatory_threshold:windhollow": 85,
  "observatory_threshold:emberfall": 70,
  "observatory_threshold:cinder_vault": 35,
  "windhollow:emberfall": 60,
  "emberfall:cinder_vault": 48,
});

function hash(...parts: string[]): string {
  return createHash("sha256").update(parts.join(""), "utf8").digest("hex");
}

function seed32(value: string): number {
  const digest = createHash("sha256").update(value, "utf8").digest();
  return digest.readUInt32BE(0) >>> 0;
}

function next(seed: number): { value: number; seed: number } {
  let state = (seed + 1831565813) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: state };
}

function boundedInt(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} out of range`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function marketPriceCopper(input: Readonly<{
  commodity: CommodityId;
  stock: number;
  demandBps: number;
  taxRateBasisPoints: number;
  memoryAffinityBps?: number;
}>): number {
  const stock = Math.max(1, boundedInt(input.stock, 0, 1e6, "stock"));
  const demand = boundedInt(input.demandBps, 0, 2e4, "demandBps") / 1e4;
  const tax = boundedInt(input.taxRateBasisPoints, 0, 5e3, "taxRateBasisPoints") / 1e4;
  const affinity = boundedInt(input.memoryAffinityBps ?? 1e4, 2500, 3e4, "memoryAffinityBps") / 1e4;
  const scarcity = clamp(120 / stock, 0.2, 4);
  const damped = Math.tanh(demand * affinity * scarcity - 1);
  const beforeTax = commodityBasePrice[input.commodity] * (1 + 0.85 * damped);
  return Math.max(1, Math.round(beforeTax * (1 + tax)));
}

export function hasLivingWorldRoute(from: HubId, to: HubId): boolean {
  return from !== to && (routeSecurity[`${from}:${to}`] !== undefined || routeSecurity[`${to}:${from}`] !== undefined);
}

export function caravanSecurityIndex(
  from: HubId,
  to: HubId,
  polityStability: number,
  rememberedThreat: number,
): number {
  const direct = routeSecurity[`${from}:${to}`] ?? routeSecurity[`${to}:${from}`] ?? 50;
  return Math.round(
    clamp(direct + clamp(polityStability, -100, 100) * 0.15 - clamp(rememberedThreat, 0, 100) * 0.35, 5, 100),
  );
}

/** Route experience is carried by the existing confirmed NPC memory/receipt
 * chain. A passed trip is not a declaration that the area is monster-free.
 * Logical age is measured in this NPC's resolution indices, never wall time.
 */
export function readMerchantRouteExperience(memory: readonly string[], from: HubId, to: HubId, resolutionIndex: number) {
  const observations = memory.slice(-24).flatMap(text=>{
    const match=/^journey:v1:([a-z_]+):([a-z_]+):(\d+):(passed|ambushed)$/.exec(text);
    if(!match || !((match[1]===from&&match[2]===to)||(match[1]===to&&match[2]===from))) return [];
    const observedIndex=Number(match[3]),age=resolutionIndex-observedIndex;
    if(!Number.isSafeInteger(observedIndex)||age<0||age>=3500) return [];
    return [{from:match[1],to:match[2],observedIndex,outcome:match[4],confidenceBps:Math.floor((3500-age)*10000/3500)}];
  }).sort((a,b)=>b.observedIndex-a.observedIndex||(a.outcome<b.outcome?-1:a.outcome>b.outcome?1:0));
  const legacyThreat=memory.some(text=>text.startsWith("danger:"))?60:10;
  const rememberedThreat=Math.max(legacyThreat,...observations.filter(o=>o.outcome==="ambushed").map(o=>10+Math.floor(50*o.confidenceBps/10000)));
  return {rememberedThreat,observations};
}

/** Bounded planning on the existing four-hub route graph. It proposes one
 * existing route edge; it does not implement a second navigation simulation.
 * Scores estimate the next hub market opportunity, not settled cargo profit.
 * Existing caravans settle at origin and carry no persistent cargo/itinerary.
 */
export function planMerchantJourney(input: Readonly<{
  origin: MarketState; npc: NpcEconomyState; commodity: CommodityId; quantity: number;
  unitPriceCopper: number; markets: readonly MerchantTravelMarket[]; resolutionIndex:number;
}>) {
  const hubs: HubId[] = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];
  const markets = [...input.markets].sort((a,b)=>hubs.indexOf(a.market.hubId)-hubs.indexOf(b.market.hubId));
  if (markets.length > 4 || new Set(markets.map(m=>m.market.hubId)).size !== markets.length
    || markets.some(m=>!hubs.includes(m.market.hubId) || !Number.isInteger(m.polityStability) || m.polityStability<0 || m.polityStability>100)) throw new Error("NPC_TRAVEL_OBSERVATION_INVALID");
  const available = new Map(markets.map(m=>[m.market.hubId,m]));
  const quantity = Math.min(input.quantity,input.origin.stock[input.commodity]);
  const cargoValue = input.unitPriceCopper * quantity;
  const wealthExposure = Math.floor(input.npc.wealthCopper / 100);
  const evaluations: Array<{targetHubId:HubId;path:HubId[];securityBps:number;opportunityCopper:number;riskCostCopper:number;journeyCostCopper:number;scoreCopper:number}> = [];
  for (const target of markets) {
    if (target.market.hubId===input.origin.hubId) continue;
    // A distant market cannot justify a first leg without an authoritative
    // itinerary/cargo contract. Only the actual next hub is valued here.
    if (!hasLivingWorldRoute(input.origin.hubId,target.market.hubId)) continue;
    const paths: HubId[][]=[[input.origin.hubId,target.market.hubId]];
    const destinationPrice=marketPriceCopper({commodity:input.commodity,stock:Math.min(target.market.stock[input.commodity],1e6),demandBps:10000,taxRateBasisPoints:target.market.taxRateBasisPoints});
    for(const path of paths){
      let securityBps=10000;
      for(let i=1;i<path.length;i++) securityBps=Math.floor(securityBps*caravanSecurityIndex(path[i-1]!,path[i]!,available.get(path[i]!)!.polityStability,readMerchantRouteExperience(input.npc.memory,path[i-1]!,path[i]!,input.resolutionIndex).rememberedThreat)/100);
      const opportunityCopper=Math.max(0,destinationPrice-input.unitPriceCopper)*quantity;
      const riskCostCopper=Math.floor((cargoValue+wealthExposure)*(10000-securityBps)/10000);
      const journeyCostCopper=(path.length-1)*Math.max(1,quantity)*2;
      evaluations.push({targetHubId:target.market.hubId,path,securityBps,opportunityCopper,riskCostCopper,journeyCostCopper,scoreCopper:opportunityCopper-riskCostCopper-journeyCostCopper});
    }
  }
  evaluations.sort((a,b)=>b.scoreCopper-a.scoreCopper||a.path.length-b.path.length||hubs.indexOf(a.targetHubId)-hubs.indexOf(b.targetHubId)||(a.path.join("|")<b.path.join("|")?-1:a.path.join("|")>b.path.join("|")?1:0));
  const selected=quantity>0&&evaluations[0]?.scoreCopper>0 ? evaluations[0] : null;
  return Object.freeze({version:MERCHANT_TRAVEL_POLICY,valueBasis:"NEXT_HOP_MARKET_OPPORTUNITY_NOT_SETTLED_PROFIT" as const,decision:selected?"TRAVEL" as const:"LOCAL" as const,
    reason:quantity===0?"REPLENISH_LOCAL_STOCK":selected?"BENEFIT_EXCEEDS_ROUTE_RISK":evaluations.length?"LOCAL_ACTION_HAS_BETTER_VALUE":"NO_REACHABLE_MARKET",
    destinationHubId:selected?.targetHubId??null,nextHopHubId:selected?.path[1]??null,path:selected?.path??[input.origin.hubId],
    observationHash:hash(stableCatalogStringify({origin:input.origin,npc:input.npc,markets,resolutionIndex:input.resolutionIndex})),evaluations,
    routeExperience:selected ? selected.path.slice(1).map((to,i)=>({from:selected.path[i]!,to,...readMerchantRouteExperience(input.npc.memory,selected.path[i]!,to,input.resolutionIndex)})) : [],
    unobservedRiskSources:["live_monster_positions","warfront"] as const});
}

export function socialMasteryEvidence(
  action: LivingWorldSocialAction,
  sourceReceiptId: string,
  resolutionIndex: number,
): Readonly<{
  disciplineId: "diplomacy" | "council" | "sovereignty" | "stewardship";
  amountExact: string;
  sourceReceiptId: string;
  resolutionIndex: number;
  reputationDelta: number;
}> {
  if (!sourceReceiptId || !Number.isSafeInteger(resolutionIndex) || resolutionIndex < 0)
    throw new Error("social evidence requires server receipt and resolution index");
  const mapping: Record<LivingWorldSocialAction, ["diplomacy" | "council" | "sovereignty" | "stewardship", string, number]> = {
    negotiation: ["diplomacy", "3", 2],
    diplomacy: ["diplomacy", "5", 4],
    intimidation: ["sovereignty", "3", -2],
    friendship: ["stewardship", "4", 5],
    trade: ["stewardship", "3", 3],
    leadership: ["council", "5", 4],
    politics: ["sovereignty", "5", 3],
  };
  const [disciplineId, amountExact, reputationDelta] = mapping[action];
  return Object.freeze({ disciplineId, amountExact, sourceReceiptId, resolutionIndex, reputationDelta });
}

function actionForGoal(goal: NpcGoal | undefined, wealthCopper: number, unitPriceCopper: number): string {
  if (!goal) return wealthCopper < unitPriceCopper * 2 ? "produce" : "trade";
  switch (goal) {
    case "seek_safety":
      return "patrol";
    case "gather_resources":
      return "produce";
    case "socialize":
      return "socialize";
    case "gain_reputation":
      return "patrol";
    case "trade":
      return "trade";
    case "expand_influence":
      return "trade";
  }
}

export function resolveLivingWorldTick(input: Readonly<{
  worldSeed: string;
  resolutionIndex: number;
  market: MarketState;
  npc: NpcEconomyState;
  polityStability: number;
  preferredGoal?: NpcGoal;
  storagePolicyVersion?: MerchantStoragePolicy;
  travelPolicyVersion?: MerchantTravelPolicy;
  travelMarkets?: readonly MerchantTravelMarket[];
}>): LivingWorldResolution {
  if (
    !input.worldSeed.trim() ||
    !Number.isSafeInteger(input.resolutionIndex) ||
    input.resolutionIndex < 0 ||
    input.npc.currentHubId !== input.market.hubId
  )
    throw new Error("invalid living world context");

  if (input.storagePolicyVersion !== undefined && input.storagePolicyVersion !== MERCHANT_STORAGE_POLICY) throw new Error("NPC_MERCHANT_STORAGE_POLICY_INVALID");
  const unboundedStorage = input.storagePolicyVersion === MERCHANT_STORAGE_POLICY;
  if (input.travelPolicyVersion !== undefined && input.travelPolicyVersion !== MERCHANT_TRAVEL_POLICY) throw new Error("NPC_MERCHANT_TRAVEL_POLICY_INVALID");
  if (unboundedStorage && Object.values(input.market.stock).some(amount => !Number.isSafeInteger(amount) || amount < 0)) throw new Error("NPC_MERCHANT_STOCK_NUMERIC_RANGE");

  let rng = seed32(
    `${input.worldSeed}:${input.resolutionIndex}:${input.npc.npcId}:${input.preferredGoal ?? "none"}:${AX1_LIVING_WORLD_RULESET}`,
  );
  const roll = (): number => {
    const result = next(rng);
    rng = result.seed;
    return result.value;
  };

  const hunger = boundedInt(input.npc.hungerBps, 0, 1e4, "hungerBps");
  const fatigue = boundedInt(input.npc.fatigueBps, 0, 1e4, "fatigueBps");
  const focus = productionFocus[input.market.hubId];
  const commodity = focus[Math.floor(roll() * focus.length)];
  const memoryAffinityBps = input.npc.memory.some((entry) => entry.includes(`trade:${input.market.hubId}`))
    ? 13e3
    : 1e4;
  const demandBps = clamp(5e3 + hunger + Math.round(fatigue * 0.25), 0, 2e4);
  const unitPriceCopper = marketPriceCopper({
    commodity,
    // Scarcity already saturates above 600 units; keep the historical pricing
    // formula and validate quantities separately from this bounded price input.
    stock: unboundedStorage ? Math.min(input.market.stock[commodity], 1e6) : input.market.stock[commodity],
    demandBps,
    taxRateBasisPoints: input.market.taxRateBasisPoints,
    memoryAffinityBps,
  });
  const requestedQuantity = Math.max(
    1,
    Math.floor((2 + roll() * 4) * clamp(input.npc.harvestYieldBps / 1e4, 0.5, 2)),
  );

  let action: string = hunger >= 7500 ? "consume" : fatigue >= 8500 ? "rest" : actionForGoal(input.preferredGoal, input.npc.wealthCopper, unitPriceCopper);
  const destinations: HubId[] = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"].filter(
    (hub) => hub !== input.market.hubId,
  ) as HubId[];
  let destination: HubId | null = null;
  let securityIndex = 100;
  let ambushed = false;
  const caravanThreshold = input.preferredGoal === "expand_influence" ? 0.25 : 0.45;

  let travelPlan: ReturnType<typeof planMerchantJourney> | undefined;
  if ((action === "trade" || (action === "consume" && input.market.stock[commodity] === 0)) && input.travelPolicyVersion === MERCHANT_TRAVEL_POLICY) {
    if(!input.travelMarkets) throw new Error("NPC_TRAVEL_OBSERVATION_REQUIRED");
    travelPlan=planMerchantJourney({origin:input.market,npc:input.npc,commodity,quantity:requestedQuantity,unitPriceCopper,markets:input.travelMarkets,resolutionIndex:input.resolutionIndex});
    if(travelPlan.reason==="REPLENISH_LOCAL_STOCK") action="produce";
    else if(travelPlan.nextHopHubId){
      action="caravan";destination=travelPlan.nextHopHubId;
      securityIndex=caravanSecurityIndex(input.market.hubId,destination,input.travelMarkets.find(m=>m.market.hubId===destination)!.polityStability,readMerchantRouteExperience(input.npc.memory,input.market.hubId,destination,input.resolutionIndex).rememberedThreat);
      ambushed=roll()<(100-securityIndex)/300;
    }
  } else if (action === "trade" && roll() > caravanThreshold) {
    action = "caravan";
    destination = destinations[Math.floor(roll() * destinations.length)];
    const rememberedThreat = input.npc.memory.some((entry) => entry.startsWith("danger:")) ? 60 : 10;
    securityIndex = caravanSecurityIndex(input.market.hubId, destination, input.polityStability, rememberedThreat);
    ambushed = roll() < (100 - securityIndex) / 300;
  }

  // A partial trade must declare and credit the same units that leave stock.
  // Historical empty contexts still fail closed. The versioned planner above
  // replenishes before consumption; finite partial consumption stays bounded.
  const quantity =
    (action === "trade" || action === "caravan" || (action === "consume" && input.travelPolicyVersion === MERCHANT_TRAVEL_POLICY)) && input.market.stock[commodity] > 0
      ? Math.min(requestedQuantity, input.market.stock[commodity])
      : requestedQuantity;

  const taxCopper =
    action === "trade" || action === "caravan"
      ? Math.floor((unitPriceCopper * quantity * input.market.taxRateBasisPoints) / 1e4)
      : 0;

  const memoryEntry =
    action === "caravan"
      ? `trade:${destination}:${commodity}:${unitPriceCopper}:security=${securityIndex}${ambushed ? ":ambushed" : ""}`
      : action === "socialize"
        ? `social:${input.market.hubId}`
        : `${action}:${input.market.hubId}:${commodity}:${unitPriceCopper}`;

  const journeyExperience = input.travelPolicyVersion && action === "caravan" && destination
    ? `journey:v1:${input.market.hubId}:${destination}:${input.resolutionIndex}:${ambushed ? "ambushed" : "passed"}` : null;
  const nextMemory = Object.freeze([...input.npc.memory, memoryEntry, ...(journeyExperience ? [journeyExperience] : [])].slice(-24));
  const stabilityDelta =
    ambushed ? -2 : action === "patrol" ? 1 : action === "socialize" ? 1 : taxCopper > 0 ? 1 : 0;
  const stockDelta =
    action === "produce"
      ? quantity
      : action === "consume" || action === "trade" || action === "caravan"
        ? -Math.min(quantity, input.market.stock[commodity])
        : 0;

  const nextStock = input.market.stock[commodity] + stockDelta;
  if (unboundedStorage && (!Number.isSafeInteger(nextStock) || nextStock < 0)) throw new Error("NPC_MERCHANT_STOCK_NUMERIC_RANGE");
  const market = Object.freeze({
    ...input.market,
    treasuryCopper: input.market.treasuryCopper + taxCopper,
    stock: Object.freeze({ ...input.market.stock, [commodity]: Math.max(0, nextStock) }),
  });

  const wealthDelta =
    action === "consume"
      ? -Math.min(input.npc.wealthCopper, unitPriceCopper)
      : action === "trade" || action === "caravan"
        ? unitPriceCopper * quantity - taxCopper
        : 0;

  const hungerDelta =
    action === "consume" ? -3e3 : action === "rest" ? 100 : action === "produce" ? 350 : action === "caravan" ? 450 : action === "patrol" ? 300 : action === "socialize" ? 150 : 220;
  const fatigueDelta =
    action === "rest" ? -3500 : action === "produce" ? 350 : action === "caravan" ? 550 : action === "patrol" ? 450 : action === "socialize" ? 100 : action === "consume" ? 80 : 180;

  const currentHubId = action === "caravan" && destination && !ambushed ? destination : input.npc.currentHubId;
  const npc = Object.freeze({
    ...input.npc,
    currentHubId,
    wealthCopper: Math.max(0, input.npc.wealthCopper + wealthDelta),
    hungerBps: Math.round(clamp(hunger + hungerDelta, 0, 1e4)),
    fatigueBps: Math.round(clamp(fatigue + fatigueDelta, 0, 1e4)),
    memory: nextMemory,
  });

  const deterministicHash = hash(
    AX1_LIVING_WORLD_RULESET,
    input.worldSeed,
    String(input.resolutionIndex),
    input.npc.npcId,
    input.preferredGoal ?? "none",
    action,
    commodity,
    String(quantity),
    String(unitPriceCopper),
    String(taxCopper),
    destination ?? "none",
    String(securityIndex),
    String(ambushed),
    stableCatalogStringify(market),
    stableCatalogStringify(npc),
    ...(travelPlan ? [stableCatalogStringify(travelPlan)] : []),
  );

  return Object.freeze({
    ...(travelPlan ? { travelPlan } : {}),
    resolutionIndex: input.resolutionIndex,
    market,
    npc,
    preferredGoal: input.preferredGoal ?? null,
    action: action as LivingWorldResolution["action"],
    commodity,
    quantity,
    unitPriceCopper,
    taxCopper,
    caravan: Object.freeze({ destination, securityIndex, ambushed }),
    nextMemory,
    stabilityDelta,
    deterministicHash,
  });
}
