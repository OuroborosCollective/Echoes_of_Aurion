// Native Aurion NPC market reaction system.
// Defines how NPCs and guilds automatically react to sudden market changes,
// with clear price-change thresholds, risk-benefit analysis, and deterministic
// action selection based on each NPC's wealth, needs, and structural environment.
// All hash identifiers use "aurion:" prefixes — no legacy dependencies.

import { createHash } from "node:crypto";
import type { HubId, CommodityId, MarketState, NpcEconomyState } from "./ax1LivingWorldProtocol.js";
import { marketPriceCopper, hasLivingWorldRoute, caravanSecurityIndex } from "./ax1LivingWorldProtocol.js";
import type { NpcNeedState, NpcNeedKey, NpcGoal } from "./npcNeeds.js";
import type { NpcPersonality } from "./npcLifeProtocol.js";
import type { WorldReaction, PolityState } from "./worldPolityRules.js";

// ═══════════════════════════════════════════════════════════════════════════
//  MARKET EVENT THRESHOLDS — sudden price changes that trigger reactions
// ═══════════════════════════════════════════════════════════════════════════

/** Price increase above this fraction of previous price triggers SELL/HOARD reaction. */
export const PRICE_SPIKE_THRESHOLD_BPS = 3_000; // +30% → sell signal

/** Price decrease below this fraction of previous price triggers BUY reaction. */
export const PRICE_CRASH_THRESHOLD_BPS = -2_500; // -25% → buy signal

/** Stock drop in a single tick above this fraction triggers SUPPLY_SHOCK. */
export const SUPPLY_SHOCK_STOCK_DROP_BPS = 5_000; // 50% stock drop → shock

/** Price band (±this fraction of base) within which market is "stable". */
export const STABLE_PRICE_BAND_BPS = 1_500; // ±15% → stable

/** Minimum security index for a caravan to be considered "safe enough". */
export const MIN_CARAVAN_SECURITY = 40;

/** Risk-free action threshold — below this risk level, always safe to act. */
export const LOW_RISK_THRESHOLD_BPS = 2_000; // 20% risk or less = low

/** High risk threshold — above this, only courageous or desperate NPCs act. */
export const HIGH_RISK_THRESHOLD_BPS = 7_000; // 70% risk or more = high

/** Wealth below this copper amount makes NPCs risk-averse (can't afford losses). */
export const WEALTH_LOW_COPPER = 500;

/** Wealth above this copper amount makes NPCs more risk-tolerant. */
export const WEALTH_HIGH_COPPER = 5_000;

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SettlementKind = "city" | "village" | "farm" | "hub";

export type MarketEventKind =
  | "price_spike"
  | "price_crash"
  | "supply_shock"
  | "scarcity"
  | "surplus"
  | "stable";

export type NpcEnvironment = Readonly<{
  hubId: HubId;
  warPressure: number; // 0..1 — from polity warPressure
  peaceLevel: number; // 0..1 — 1 - warPressure
  laborAvailability: number; // 0..1 — based on stability & population
  prosperityLevel: number; // 0..1 — based on treasury, stock, stability
  settlementKind: SettlementKind;
  settlementProsperity: number; // 0..1 — own settlement's prosperity
  threatLevel: number; // 0..1 — from world reaction threatDelta
  weatherTone: "clear" | "rain" | "storm" | "ashfall";
  dialogueTone: "calm" | "guarded" | "urgent";
}>;

export type NpcStateSummary = Readonly<{
  npcId: string;
  name: string;
  currentHubId: HubId;
  wealthCopper: number;
  needs: NpcNeedState;
  /** How urgently the NPC needs more wealth (0..10000 bps). */
  wealthDemandBps: number;
  /** Most pressing need (lowest value). */
  primaryNeed: NpcNeedKey;
  /** Goal associated with primary need. */
  primaryGoal: NpcGoal;
  hungerBps: number;
  fatigueBps: number;
  tradeProwessBps: number;
  harvestYieldBps: number;
  environment: NpcEnvironment;
  /** Current market event at the NPC's hub (most significant). */
  marketEvent: MarketEventKind;
  /** Price changes for all commodities at the NPC's hub (bps relative to previous tick). */
  priceChangesBps: Readonly<Record<CommodityId, number>>;
  summary: string;
  receiptHash: string;
}>;

export type NpcChoiceAction =
  | "produce"
  | "trade_local"
  | "caravan_arbitrage"
  | "caravan_escape"
  | "hoard"
  | "consume"
  | "rest"
  | "patrol"
  | "socialize"
  | "flee_to_safety";

export type NpcChoiceOption = Readonly<{
  action: NpcChoiceAction;
  commodity: CommodityId;
  targetHubId: HubId | null;
  /** Projected profit in copper (negative = expected loss). */
  expectedProfitCopper: number;
  /** Risk level 0..10000 bps (0 = safe, 10000 = near-certain loss). */
  riskBps: number;
  /** How much this action satisfies the NPC's primary need (0..10000 bps). */
  needSatisfactionBps: number;
  /** Overall value score: profit × needSatisfaction / (risk + 1), in bps. */
  valueScoreBps: number;
  /** How urgent this action is (0..10000 bps). */
  urgencyBps: number;
  /** Human-readable explanation. */
  reason: string;
  receiptHash: string;
}>;

export type NpcChoiceResult = Readonly<{
  npcId: string;
  resolutionIndex: number;
  summary: NpcStateSummary;
  options: readonly NpcChoiceOption[];
  selected: NpcChoiceOption;
  receiptHash: string;
}>;

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const commodityBasePrice: Readonly<Record<CommodityId, number>> = Object.freeze({
  grain: 20,
  sandstone: 45,
  bronze: 90,
  aether: 220,
  salve: 60,
  rune_core: 450,
});

const ALL_COMMODITIES: CommodityId[] = ["grain", "sandstone", "bronze", "aether", "salve", "rune_core"];
const ALL_HUBS: HubId[] = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];

const needGoalMap: Record<NpcNeedKey, NpcGoal> = {
  safety: "seek_safety",
  resources: "gather_resources",
  belonging: "socialize",
  status: "gain_reputation",
  wealth: "trade",
  power: "expand_influence",
};

const needTieOrder: NpcNeedKey[] = ["safety", "resources", "belonging", "status", "wealth", "power"];

function hash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampBps(value: number, min = 0, max = 10_000): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function defaultPersonality(): NpcPersonality {
  return { empathyBps: 5000, courageBps: 5000, curiosityBps: 5000, loyaltyBps: 5000, ambitionBps: 5000, prudenceBps: 5000 };
}

function settlementKindForHub(hubId: HubId): SettlementKind {
  if (hubId === "observatory_threshold") return "city";
  if (hubId === "emberfall") return "city";
  if (hubId === "windhollow") return "village";
  return "hub"; // cinder_vault
}

// ═══════════════════════════════════════════════════════════════════════════
//  ENVIRONMENT DERIVATION
// ═══════════════════════════════════════════════════════════════════════════

export function deriveNpcEnvironment(input: Readonly<{
  hubId: HubId;
  market: MarketState;
  polityStability: number;
  warPressure: number;
  worldReaction: WorldReaction | null;
}>): NpcEnvironment {
  const warPressure = clamp01(input.warPressure);
  const peaceLevel = clamp01(1 - warPressure);
  const stability = clamp01(input.polityStability / 100);
  const laborAvailability = clamp01(stability * 0.6 + peaceLevel * 0.4);

  // Prosperity: based on treasury, stock diversity, and stability
  const totalStock = ALL_COMMODITIES.reduce((sum, c) => sum + input.market.stock[c], 0);
  const stockDiversity = ALL_COMMODITIES.filter(c => input.market.stock[c] > 0).length / ALL_COMMODITIES.length;
  const treasuryFactor = clamp01(input.market.treasuryCopper / 1_000_000);
  const prosperityLevel = clamp01(treasuryFactor * 0.3 + stockDiversity * 0.3 + stability * 0.4);

  const settlementKind = settlementKindForHub(input.hubId);
  const settlementProsperity = prosperityLevel;

  const threatLevel = input.worldReaction ? clamp01(input.worldReaction.threatDelta) : 0;
  const weatherTone = input.worldReaction?.weatherTone ?? "clear";
  const dialogueTone = input.worldReaction?.dialogueTone ?? "calm";

  return Object.freeze({
    hubId: input.hubId,
    warPressure,
    peaceLevel,
    laborAvailability,
    prosperityLevel,
    settlementKind,
    settlementProsperity,
    threatLevel,
    weatherTone,
    dialogueTone,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MARKET EVENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectMarketEvent(
  priceChangesBps: Readonly<Record<CommodityId, number>>,
  stockChanges: Readonly<Record<CommodityId, number>>,
): { event: MarketEventKind; commodity: CommodityId; severity: number } {
  let maxSeverity = 0;
  let event: MarketEventKind = "stable";
  let eventCommodity: CommodityId = "grain";

  for (const commodity of ALL_COMMODITIES) {
    const priceChange = priceChangesBps[commodity] ?? 0;
    const stockChange = stockChanges[commodity] ?? 0;

    // Supply shock: stock dropped significantly
    if (stockChange <= -SUPPLY_SHOCK_STOCK_DROP_BPS) {
      const severity = Math.abs(stockChange);
      if (severity > maxSeverity) {
        maxSeverity = severity;
        event = "supply_shock";
        eventCommodity = commodity;
      }
    }
    // Price spike
    else if (priceChange >= PRICE_SPIKE_THRESHOLD_BPS) {
      if (priceChange > maxSeverity) {
        maxSeverity = priceChange;
        event = "price_spike";
        eventCommodity = commodity;
      }
    }
    // Price crash
    else if (priceChange <= PRICE_CRASH_THRESHOLD_BPS) {
      const severity = Math.abs(priceChange);
      if (severity > maxSeverity) {
        maxSeverity = severity;
        event = "price_crash";
        eventCommodity = commodity;
      }
    }
  }

  return { event, commodity: eventCommodity, severity: maxSeverity };
}

function computePriceChanges(
  currentMarket: MarketState,
  previousStock: Readonly<Record<CommodityId, number>> | null,
): Readonly<Record<CommodityId, number>> {
  const changes: Record<CommodityId, number> = {} as any;
  for (const commodity of ALL_COMMODITIES) {
    const currentPrice = marketPriceCopper({
      commodity,
      stock: currentMarket.stock[commodity],
      demandBps: 5_000,
      taxRateBasisPoints: currentMarket.taxRateBasisPoints,
    });
    if (previousStock) {
      const previousPrice = marketPriceCopper({
        commodity,
        stock: previousStock[commodity] ?? currentMarket.stock[commodity],
        demandBps: 5_000,
        taxRateBasisPoints: currentMarket.taxRateBasisPoints,
      });
      changes[commodity] = previousPrice > 0
        ? Math.round(((currentPrice - previousPrice) / previousPrice) * 10_000)
        : 0;
    } else {
      const base = commodityBasePrice[commodity];
      changes[commodity] = base > 0 ? Math.round(((currentPrice - base) / base) * 10_000) : 0;
    }
  }
  return Object.freeze(changes);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUMMARIZE — NPC state assessment
// ═══════════════════════════════════════════════════════════════════════════

export function summarize(input: Readonly<{
  npc: NpcEconomyState;
  needs: NpcNeedState;
  market: MarketState;
  polityStability: number;
  warPressure: number;
  worldReaction: WorldReaction | null;
  previousStock: Readonly<Record<CommodityId, number>> | null;
}>): NpcStateSummary {
  const environment = deriveNpcEnvironment({
    hubId: input.npc.currentHubId,
    market: input.market,
    polityStability: input.polityStability,
    warPressure: input.warPressure,
    worldReaction: input.worldReaction,
  });

  // Determine primary need (lowest value = most pressing)
  const primaryNeed = needTieOrder.reduce(
    (selected, candidate) => (input.needs[candidate] < input.needs[selected] ? candidate : selected),
    needTieOrder[0],
  );

  // Wealth demand: how urgently does this NPC need more wealth?
  // Based on: low wealth value, high hunger, low prosperity environment
  const wealthNeedValue = input.needs.wealth;
  const hungerFactor = input.npc.hungerBps / 10_000;
  const prosperityFactor = 1 - environment.prosperityLevel;
  const wealthDemandBps = clampBps(
    (1 - wealthNeedValue) * 4_000 + hungerFactor * 3_000 + prosperityFactor * 3_000,
  );

  // Price changes
  const priceChangesBps = computePriceChanges(input.market, input.previousStock);

  // Stock changes
  const stockChanges: Record<CommodityId, number> = {} as any;
  if (input.previousStock) {
    for (const c of ALL_COMMODITIES) {
      const prev = input.previousStock[c] ?? input.market.stock[c];
      stockChanges[c] = prev > 0 ? Math.round(((input.market.stock[c] - prev) / prev) * 10_000) : 0;
    }
  }
  const marketEventInfo = detectMarketEvent(priceChangesBps, stockChanges);

  const summaryText = [
    `${input.npc.name} @ ${input.npc.currentHubId}`,
    `wealth=${input.npc.wealthCopper}c`,
    `primary_need=${primaryNeed}(${(input.needs[primaryNeed] * 100).toFixed(0)}%)`,
    `wealth_demand=${(wealthDemandBps / 100).toFixed(0)}%`,
    `env: ${environment.settlementKind}`,
    `war=${(environment.warPressure * 100).toFixed(0)}%`,
    `prosperity=${(environment.prosperityLevel * 100).toFixed(0)}%`,
    `market=${marketEventInfo.event}`,
  ].join(" | ");

  const receiptHash = hash([
    "aurion:npc-summary:v1",
    input.npc.npcId,
    input.npc.currentHubId,
    String(input.npc.wealthCopper),
    ...needTieOrder.map(n => `${n}:${input.needs[n]}`),
    String(wealthDemandBps),
    environment.settlementKind,
    String(environment.warPressure),
    String(environment.prosperityLevel),
    marketEventInfo.event,
    summaryText,
  ]);

  return Object.freeze({
    npcId: input.npc.npcId,
    name: input.npc.name,
    currentHubId: input.npc.currentHubId,
    wealthCopper: input.npc.wealthCopper,
    needs: input.needs,
    wealthDemandBps,
    primaryNeed,
    primaryGoal: needGoalMap[primaryNeed],
    hungerBps: input.npc.hungerBps,
    fatigueBps: input.npc.fatigueBps,
    tradeProwessBps: input.npc.tradeProwessBps,
    harvestYieldBps: input.npc.harvestYieldBps,
    environment,
    marketEvent: marketEventInfo.event,
    priceChangesBps,
    summary: summaryText,
    receiptHash,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHOICE EVALUATION — deterministic action options with risk-benefit
// ═══════════════════════════════════════════════════════════════════════════

function makeChoice(
  npcId: string,
  action: NpcChoiceAction,
  commodity: CommodityId,
  targetHubId: HubId | null,
  expectedProfitCopper: number,
  riskBps: number,
  needSatisfactionBps: number,
  urgencyBps: number,
  reason: string,
): NpcChoiceOption {
  // Value score = profit × needSatisfaction / (risk + 1000)
  // Higher profit + higher need satisfaction + lower risk = higher value
  const profitFactor = expectedProfitCopper > 0 ? expectedProfitCopper : 0;
  const riskDenominator = riskBps + 1_000; // +1000 so 0 risk doesn't divide by 0
  const valueScoreBps = clampBps(
    Math.round((profitFactor * needSatisfactionBps) / riskDenominator),
  );

  const receiptHash = hash([
    "aurion:npc-choice:v1",
    npcId,
    action,
    commodity,
    targetHubId ?? "none",
    String(expectedProfitCopper),
    String(riskBps),
    String(needSatisfactionBps),
    String(urgencyBps),
    reason,
  ]);

  return Object.freeze({
    action,
    commodity,
    targetHubId,
    expectedProfitCopper,
    riskBps: clampBps(riskBps),
    needSatisfactionBps: clampBps(needSatisfactionBps),
    valueScoreBps,
    urgencyBps: clampBps(urgencyBps),
    reason,
    receiptHash,
  });
}

/**
 * Evaluates all possible actions for an NPC and returns them sorted by value score.
 * Each action includes expected profit, risk, need satisfaction, and urgency.
 */
export function evaluateNpcChoices(input: Readonly<{
  summary: NpcStateSummary;
  npc: NpcEconomyState;
  market: MarketState;
  allMarkets: Readonly<Record<HubId, MarketState>>;
  personality?: NpcPersonality;
  resolutionIndex: number;
}>): readonly NpcChoiceOption[] {
  const p = input.personality ?? defaultPersonality();
  const s = input.summary;
  const env = s.environment;
  const options: NpcChoiceOption[] = [];

  // Risk tolerance: courage increases tolerance, prudence decreases it
  // Low wealth decreases tolerance, high wealth increases it
  const riskToleranceBps = clampBps(
    p.courageBps * 0.4 + p.ambitionBps * 0.2
    + (s.wealthCopper > WEALTH_HIGH_COPPER ? 2_000 : 0)
    - (s.wealthCopper < WEALTH_LOW_COPPER ? 2_000 : 0)
    - p.prudenceBps * 0.3,
  );

  // ── PRODUCE: gather resources at current hub ──
  {
    // Production focus for this hub
    const productionFocus: Record<HubId, CommodityId[]> = {
      observatory_threshold: ["salve", "rune_core"],
      windhollow: ["grain"],
      emberfall: ["sandstone", "bronze"],
      cinder_vault: ["aether", "rune_core"],
    };
    for (const commodity of productionFocus[s.currentHubId] ?? ["grain"]) {
      const yieldQty = Math.max(1, Math.floor(2 + (s.harvestYieldBps / 10_000) * 4));
      const unitPrice = marketPriceCopper({
        commodity,
        stock: input.market.stock[commodity],
        demandBps: 5_000,
        taxRateBasisPoints: input.market.taxRateBasisPoints,
      });
      const profit = unitPrice * yieldQty;
      // Risk: low, but increases with war pressure (fields may be raided)
      const risk = clampBps(env.warPressure * 2_000 + env.threatLevel * 1_500);
      // Need satisfaction: high if primary need is resources, moderate otherwise
      const needSat = s.primaryNeed === "resources" ? 8_000 : s.primaryNeed === "wealth" ? 5_000 : 3_000;
      // Urgency: high if hunger is high
      const urgency = clampBps(s.hungerBps * 0.5 + (s.primaryNeed === "resources" ? 3_000 : 0));
      options.push(makeChoice(
        s.npcId, "produce", commodity, null, profit, risk, needSat, urgency,
        `produce ${commodity} ×${yieldQty} @ ${unitPrice}c (yield ${(s.harvestYieldBps / 100).toFixed(0)}%)`,
      ));
    }
  }

  // ── TRADE LOCAL: buy/sell at current hub ──
  for (const commodity of ALL_COMMODITIES) {
    const price = marketPriceCopper({
      commodity,
      stock: input.market.stock[commodity],
      demandBps: 5_000,
      taxRateBasisPoints: input.market.taxRateBasisPoints,
    });
    const base = commodityBasePrice[commodity];
    const priceRatio = price / base;

    // Buy opportunity: price below base
    if (priceRatio < 0.85) {
      const qty = Math.min(50, Math.floor(s.wealthCopper / Math.max(1, price)));
      const profit = Math.round((base - price) * qty * 0.8); // expected sell price
      const risk = clampBps(env.warPressure * 1_500 + 500);
      const needSat = s.primaryNeed === "wealth" ? 7_000 : 4_000;
      const urgency = clampBps((1 - priceRatio) * 5_000);
      options.push(makeChoice(
        s.npcId, "trade_local", commodity, null, profit, risk, needSat, urgency,
        `buy ${commodity} ×${qty} @ ${price}c (${(priceRatio * 100).toFixed(0)}% of base)`,
      ));
    }
    // Sell opportunity: price above base
    if (priceRatio > 1.3 && input.market.stock[commodity] > 0) {
      const qty = Math.min(input.market.stock[commodity], 20);
      const profit = Math.round((price - base) * qty);
      const risk = clampBps(env.warPressure * 1_000 + 300);
      const needSat = s.primaryNeed === "wealth" ? 7_000 : 4_000;
      const urgency = clampBps((priceRatio - 1) * 5_000);
      options.push(makeChoice(
        s.npcId, "trade_local", commodity, null, profit, risk, needSat, urgency,
        `sell ${commodity} ×${qty} @ ${price}c (${(priceRatio * 100).toFixed(0)}% of base)`,
      ));
    }
  }

  // ── CARAVAN ARBITRAGE: trade between hubs ──
  for (const dest of ALL_HUBS) {
    if (dest === s.currentHubId || !hasLivingWorldRoute(s.currentHubId, dest)) continue;
    const destMarket = input.allMarkets[dest];
    if (!destMarket) continue;

    for (const commodity of ALL_COMMODITIES) {
      const fromPrice = marketPriceCopper({
        commodity,
        stock: input.market.stock[commodity],
        demandBps: 5_000,
        taxRateBasisPoints: input.market.taxRateBasisPoints,
      });
      const toPrice = marketPriceCopper({
        commodity,
        stock: destMarket.stock[commodity],
        demandBps: 5_000,
        taxRateBasisPoints: destMarket.taxRateBasisPoints,
      });
      if (toPrice <= fromPrice) continue;

      const priceGapBps = Math.round(((toPrice - fromPrice) / fromPrice) * 10_000);
      if (priceGapBps < 2_000) continue; // at least 20% gap

      const security = caravanSecurityIndex(s.currentHubId, dest, env.peaceLevel * 100, 10);
      if (security < MIN_CARAVAN_SECURITY) continue;

      const qty = Math.min(20, Math.floor(s.wealthCopper / Math.max(1, fromPrice)));
      const grossProfit = (toPrice - fromPrice) * qty;
      const tax = Math.round(grossProfit * (destMarket.taxRateBasisPoints / 10_000));
      const netProfit = grossProfit - tax;
      // Risk: based on inverse security + war pressure
      const ambushRisk = (100 - security) / 100;
      const risk = clampBps(ambushRisk * 6_000 + env.warPressure * 2_000);
      const needSat = s.primaryNeed === "wealth" ? 8_000 : s.primaryNeed === "power" ? 6_000 : 4_000;
      const urgency = clampBps(priceGapBps / 3);
      options.push(makeChoice(
        s.npcId, "caravan_arbitrage", commodity, dest, netProfit, risk, needSat, urgency,
        `caravan ${commodity} ${s.currentHubId}→${dest} gap=${(priceGapBps / 100).toFixed(0)}% sec=${security} profit=${netProfit}c`,
      ));
    }
  }

  // ── CARAVAN ESCAPE: flee to safer hub if war/threat is high ──
  if (env.warPressure > 0.5 || env.threatLevel > 0.6) {
    for (const dest of ALL_HUBS) {
      if (dest === s.currentHubId || !hasLivingWorldRoute(s.currentHubId, dest)) continue;
      const destMarket = input.allMarkets[dest];
      if (!destMarket) continue;
      const destSecurity = caravanSecurityIndex(s.currentHubId, dest, env.peaceLevel * 100, 10);
      if (destSecurity < 60) continue;

      // Fleeing has no profit but high need satisfaction for safety
      const risk = clampBps((100 - destSecurity) * 30);
      const needSat = s.primaryNeed === "safety" ? 10_000 : 6_000;
      const urgency = clampBps(env.warPressure * 5_000 + env.threatLevel * 3_000);
      options.push(makeChoice(
        s.npcId, "caravan_escape", "grain", dest, -50, risk, needSat, urgency,
        `flee ${s.currentHubId}→${dest} (war=${(env.warPressure * 100).toFixed(0)}% threat=${(env.threatLevel * 100).toFixed(0)}%)`,
      ));
      break; // only one escape option
    }
  }

  // ── HOARD: protect resources during scarcity ──
  if (s.marketEvent === "supply_shock" || s.marketEvent === "scarcity") {
    const risk = clampBps(200);
    const needSat = s.primaryNeed === "resources" ? 7_000 : s.primaryNeed === "safety" ? 5_000 : 3_000;
    const urgency = clampBps(s.wealthDemandBps);
    options.push(makeChoice(
      s.npcId, "hoard", "grain", null, 0, risk, needSat, urgency,
      `hoard resources (market event: ${s.marketEvent})`,
    ));
  }

  // ── CONSUME: eat to reduce hunger ──
  if (s.hungerBps >= 7_000) {
    const grainPrice = marketPriceCopper({
      commodity: "grain",
      stock: input.market.stock.grain,
      demandBps: 5_000,
      taxRateBasisPoints: input.market.taxRateBasisPoints,
    });
    const cost = -grainPrice;
    const risk = clampBps(100);
    const needSat = 9_000; // eating is critical when starving
    const urgency = clampBps(s.hungerBps);
    options.push(makeChoice(
      s.npcId, "consume", "grain", null, cost, risk, needSat, urgency,
      `consume grain @ ${grainPrice}c (hunger=${(s.hungerBps / 100).toFixed(0)}%)`,
    ));
  }

  // ── REST: recover from fatigue ──
  if (s.fatigueBps >= 8_000) {
    const risk = clampBps(env.warPressure * 1_500);
    const needSat = 7_000;
    const urgency = clampBps(s.fatigueBps);
    options.push(makeChoice(
      s.npcId, "rest", "grain", null, 0, risk, needSat, urgency,
      `rest (fatigue=${(s.fatigueBps / 100).toFixed(0)}%)`,
    ));
  }

  // ── PATROL: improve safety/reputation ──
  if (s.primaryNeed === "safety" || s.primaryNeed === "status") {
    const risk = clampBps(env.warPressure * 3_000 + 500);
    const needSat = s.primaryNeed === "safety" ? 6_000 : 7_000;
    const urgency = clampBps((1 - s.needs.safety) * 5_000 + env.threatLevel * 3_000);
    options.push(makeChoice(
      s.npcId, "patrol", "bronze", null, 0, risk, needSat, urgency,
      `patrol for safety (need=${(s.needs.safety * 100).toFixed(0)}% threat=${(env.threatLevel * 100).toFixed(0)}%)`,
    ));
  }

  // ── SOCIALIZE: build belonging ──
  if (s.primaryNeed === "belonging" || env.peaceLevel > 0.7) {
    const risk = clampBps(env.warPressure * 1_000 + 200);
    const needSat = s.primaryNeed === "belonging" ? 8_000 : 3_000;
    const urgency = clampBps(s.primaryNeed === "belonging" ? 5_000 : 1_000);
    options.push(makeChoice(
      s.npcId, "socialize", "salve", null, 0, risk, needSat, urgency,
      `socialize (belonging=${(s.needs.belonging * 100).toFixed(0)}% peace=${(env.peaceLevel * 100).toFixed(0)}%)`,
    ));
  }

  // ── FLEE TO SAFETY: abandon hub if war is extreme ──
  if (env.warPressure > 0.8) {
    const safestDest = ALL_HUBS
      .filter(h => h !== s.currentHubId && hasLivingWorldRoute(s.currentHubId, h))
      .map(h => ({ hub: h, sec: caravanSecurityIndex(s.currentHubId, h, env.peaceLevel * 100, 10) }))
      .sort((a, b) => b.sec - a.sec)[0];

    if (safestDest && safestDest.sec > 50) {
      const risk = clampBps((100 - safestDest.sec) * 40 + 1_000);
      const needSat = 10_000;
      const urgency = 10_000;
      options.push(makeChoice(
        s.npcId, "flee_to_safety", "grain", safestDest.hub, -100, risk, needSat, urgency,
        `FLEE ${s.currentHubId}→${safestDest.hub} (war critical at ${(env.warPressure * 100).toFixed(0)}%)`,
      ));
    }
  }

  // Sort by value score descending, then urgency descending
  options.sort((a, b) => b.valueScoreBps - a.valueScoreBps || b.urgencyBps - a.urgencyBps);

  return Object.freeze(options);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTION SELECTION — deterministic best choice
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Selects the best action for an NPC from all evaluated options.
 * The selection is deterministic: it weighs value score, need urgency,
 * risk tolerance, and environment factors.
 */
export function selectBestAction(input: Readonly<{
  summary: NpcStateSummary;
  options: readonly NpcChoiceOption[];
  personality?: NpcPersonality;
  resolutionIndex: number;
}>): NpcChoiceResult {
  const p = input.personality ?? defaultPersonality();
  const s = input.summary;

  if (input.options.length === 0) {
    // No options — default to rest
    const fallback = makeChoice(
      s.npcId, "rest", "grain", null, 0, 100, 1_000, 1_000, "no viable options — rest",
    );
    return finalizeChoice(s, [fallback], fallback, input.resolutionIndex);
  }

  // Risk tolerance: how much risk the NPC is willing to accept
  const riskToleranceBps = clampBps(
    p.courageBps * 0.4 + p.ambitionBps * 0.2
    + (s.wealthCopper > WEALTH_HIGH_COPPER ? 2_000 : 0)
    - (s.wealthCopper < WEALTH_LOW_COPPER ? 2_000 : 0)
    - p.prudenceBps * 0.3,
  );

  // Filter out options that exceed risk tolerance (unless urgency is extreme)
  const viable = input.options.filter(opt =>
    opt.riskBps <= riskToleranceBps + 2_000 // allow 20% over tolerance for urgent actions
    || opt.urgencyBps >= 8_000, // or if urgency is critical (fleeing, eating)
  );

  const candidates = viable.length > 0 ? viable : input.options;

  // Adjusted score: value score + urgency bonus + need alignment bonus
  const scored = candidates.map(opt => {
    let adjustedScore = opt.valueScoreBps;

    // Need alignment: if action satisfies primary need, boost score
    if (s.primaryNeed === "safety" && (opt.action === "patrol" || opt.action === "flee_to_safety" || opt.action === "caravan_escape")) {
      adjustedScore += 3_000;
    }
    if (s.primaryNeed === "resources" && (opt.action === "produce" || opt.action === "hoard")) {
      adjustedScore += 3_000;
    }
    if (s.primaryNeed === "wealth" && (opt.action === "trade_local" || opt.action === "caravan_arbitrage")) {
      adjustedScore += 3_000;
    }
    if (s.primaryNeed === "belonging" && opt.action === "socialize") {
      adjustedScore += 3_000;
    }
    if (s.primaryNeed === "status" && (opt.action === "patrol" || opt.action === "socialize")) {
      adjustedScore += 2_000;
    }
    if (s.primaryNeed === "power" && (opt.action === "caravan_arbitrage" || opt.action === "patrol")) {
      adjustedScore += 2_000;
    }

    // Environment adjustments
    // War: penalize non-safety actions, boost safety actions
    if (s.environment.warPressure > 0.5) {
      if (opt.action === "flee_to_safety" || opt.action === "caravan_escape" || opt.action === "patrol") {
        adjustedScore += Math.round(s.environment.warPressure * 2_000);
      } else {
        adjustedScore -= Math.round(s.environment.warPressure * 1_000);
      }
    }

    // Peace: boost economic actions
    if (s.environment.peaceLevel > 0.7) {
      if (opt.action === "trade_local" || opt.action === "caravan_arbitrage" || opt.action === "produce") {
        adjustedScore += Math.round(s.environment.peaceLevel * 1_000);
      }
    }

    // Prosperity: boost social/ambitious actions
    if (s.environment.prosperityLevel > 0.6) {
      if (opt.action === "socialize" || opt.action === "caravan_arbitrage") {
        adjustedScore += 500;
      }
    }

    // Low prosperity: boost produce/gather
    if (s.environment.prosperityLevel < 0.3) {
      if (opt.action === "produce" || opt.action === "hoard") {
        adjustedScore += 1_000;
      }
    }

    // Urgency bonus
    adjustedScore += Math.round(opt.urgencyBps * 0.3);

    return { option: opt, score: adjustedScore };
  });

  // Deterministic selection: highest adjusted score, tiebreak by action name
  scored.sort((a, b) => b.score - a.score || a.option.action.localeCompare(b.option.action));
  const selected = scored[0]!.option;

  return finalizeChoice(s, input.options, selected, input.resolutionIndex);
}

function finalizeChoice(
  summary: NpcStateSummary,
  options: readonly NpcChoiceOption[],
  selected: NpcChoiceOption,
  resolutionIndex: number,
): NpcChoiceResult {
  const receiptHash = hash([
    "aurion:npc-choice-result:v1",
    summary.npcId,
    String(resolutionIndex),
    selected.action,
    selected.commodity,
    selected.targetHubId ?? "none",
    String(selected.valueScoreBps),
    String(selected.riskBps),
    selected.receiptHash,
    summary.receiptHash,
  ]);

  return Object.freeze({
    npcId: summary.npcId,
    resolutionIndex,
    summary,
    options,
    selected,
    receiptHash,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  BATCH EVALUATION — all NPCs in one tick
// ═══════════════════════════════════════════════════════════════════════════

export type NpcBatchInput = Readonly<{
  npcs: Readonly<Record<HubId, NpcEconomyState>>;
  needs: Readonly<Record<HubId, NpcNeedState>>;
  markets: Readonly<Record<HubId, MarketState>>;
  polityStability: Readonly<Record<HubId, number>>;
  warPressure: Readonly<Record<HubId, number>>;
  worldReactions: Readonly<Record<HubId, WorldReaction | null>>;
  previousStock: Readonly<Record<HubId, Readonly<Record<CommodityId, number>>>>;
  personalities?: Readonly<Record<string, NpcPersonality>>;
  resolutionIndex: number;
}>;

export type NpcBatchResult = Readonly<{
  results: readonly NpcChoiceResult[];
  resolutionIndex: number;
  summary: string;
}>;

export function evaluateAllNpcChoices(input: NpcBatchInput): NpcBatchResult {
  const results: NpcChoiceResult[] = [];

  for (const hub of ALL_HUBS) {
    const npc = input.npcs[hub];
    const needs = input.needs[hub];
    const market = input.markets[hub];
    if (!npc || !needs || !market) continue;

    const summary = summarize({
      npc,
      needs,
      market,
      polityStability: input.polityStability[hub] ?? 50,
      warPressure: input.warPressure[hub] ?? 0,
      worldReaction: input.worldReactions[hub] ?? null,
      previousStock: input.previousStock[hub] ?? null,
    });

    const options = evaluateNpcChoices({
      summary,
      npc,
      market,
      allMarkets: input.markets,
      personality: input.personalities?.[npc.npcId],
      resolutionIndex: input.resolutionIndex,
    });

    const result = selectBestAction({
      summary,
      options,
      personality: input.personalities?.[npc.npcId],
      resolutionIndex: input.resolutionIndex,
    });

    results.push(result);
  }

  const summaryText = `Tick ${input.resolutionIndex}: ${results.length} NPCs evaluated, ` +
    results.map(r => `${r.summary.name}:${r.selected.action}`).join(", ");

  return Object.freeze({
    results: Object.freeze(results),
    resolutionIndex: input.resolutionIndex,
    summary: summaryText,
  });
}
