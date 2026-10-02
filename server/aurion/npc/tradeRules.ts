// Native Aurion trade rules — automatic guild market response system.
// Defines clear rules so player/NPC guilds react automatically to market changes.
// All hash identifiers use "aurion:" prefixes — no legacy dependencies.

import { createHash } from "node:crypto";
import type { HubId, CommodityId, MarketState } from "./ax1LivingWorldProtocol.js";
import { marketPriceCopper, hasLivingWorldRoute, caravanSecurityIndex } from "./ax1LivingWorldProtocol.js";

// ─── Rule thresholds (basis points = 1/100 of a percent) ───────────────────

/** Price must drop below this fraction of base price to trigger auto-buy. */
export const AUTO_BUY_THRESHOLD_BPS = 8_500; // 0.85× base price

/** Price must rise above this fraction of base price to trigger auto-sell. */
export const AUTO_SELL_THRESHOLD_BPS = 13_000; // 1.3× base price

/** Price differential between hubs (as fraction of cheaper hub) to trigger caravan. */
export const CARAVAN_ARBITRAGE_THRESHOLD_BPS = 20_000; // 20% price gap

/** Stock below this fraction of initial stock triggers scarcity alert. */
export const SCARCITY_STOCK_THRESHOLD_BPS = 25_000; // 25% of initial

/** Treasury below this copper amount triggers tax increase. */
export const TREASURY_LOW_THRESHOLD_COPPER = 50_000;

/** Stability above this level allows tax reduction to stimulate trade. */
export const STABILITY_HIGH_THRESHOLD = 0.75;

/** Stability below this level triggers tax reduction for economic relief. */
export const STABILITY_LOW_THRESHOLD = 0.35;

/** Maximum tax rate in basis points (100 = 1%). */
export const MAX_TAX_BPS = 1_000; // 10%

/** Minimum tax rate in basis points. */
export const MIN_TAX_BPS = 0;

/** Tax adjustment step in basis points per market cycle. */
export const TAX_ADJUSTMENT_STEP_BPS = 50; // 0.5%

// ─── Types ──────────────────────────────────────────────────────────────────

export type TradeRuleAction =
  | "auto_buy"
  | "auto_sell"
  | "dispatch_caravan"
  | "increase_tax"
  | "decrease_tax"
  | "hoard_resources"
  | "open_trade_route"
  | "hold";

export type GuildTradeDirective = Readonly<{
  guildId: string;
  hubId: HubId;
  action: TradeRuleAction;
  commodity: CommodityId;
  reason: string;
  urgencyBps: number; // 0..10000 — how urgently the guild should act
  targetHubId: HubId | null;
  quantity: number;
  pricePerUnitCopper: number;
  taxAdjustmentBps: number; // signed delta to apply to tax rate
  receiptHash: string;
}>;

export type MarketCondition = Readonly<{
  hubId: HubId;
  commodity: CommodityId;
  currentStock: number;
  initialStock: number;
  currentPriceCopper: number;
  basePriceCopper: number;
  demandBps: number;
  taxRateBps: number;
  treasuryCopper: number;
  guildStability: number;
}>;

export type InterHubPriceData = Readonly<{
  fromHub: HubId;
  toHub: HubId;
  commodity: CommodityId;
  fromPriceCopper: number;
  toPriceCopper: number;
  fromStock: number;
  toStock: number;
}>;

// ─── Helpers ────────────────────────────────────────────────────────────────

const commodityBasePrice: Readonly<Record<CommodityId, number>> = Object.freeze({
  grain: 20,
  sandstone: 45,
  bronze: 90,
  aether: 220,
  salve: 60,
  rune_core: 450,
});

function hash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function clampBps(value: number, min = 0, max = 10_000): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// ─── Core rule functions ────────────────────────────────────────────────────

/**
 * Rule 1: Scarcity detection — when stock drops below threshold, guilds hoard
 * and dispatch caravans to restock from other hubs.
 */
export function evaluateScarcityResponse(
  condition: MarketCondition,
  interHubPrices: readonly InterHubPriceData[],
): GuildTradeDirective {
  const stockRatio = condition.initialStock > 0 ? condition.currentStock / condition.initialStock : 1;
  const isScarce = stockRatio * 10_000 < SCARCITY_STOCK_THRESHOLD_BPS;
  const priceRatio = condition.basePriceCopper > 0 ? condition.currentPriceCopper / condition.basePriceCopper : 1;

  if (!isScarce && priceRatio < AUTO_SELL_THRESHOLD_BPS / 10_000) {
    return holdDirective(condition, "stock_adequate");
  }

  // Find the cheapest source hub for this commodity
  const cheaperSources = interHubPrices
    .filter(p => p.commodity === condition.commodity && p.toPriceCopper < condition.currentPriceCopper)
    .sort((a, b) => a.toPriceCopper - b.toPriceCopper);

  if (cheaperSources.length > 0) {
    const best = cheaperSources[0]!;
    const priceGapBps = Math.round(
      ((condition.currentPriceCopper - best.toPriceCopper) / best.toPriceCopper) * 10_000,
    );
    if (priceGapBps >= CARAVAN_ARBITRAGE_THRESHOLD_BPS) {
      const urgency = clampBps(priceGapBps / 2);
      return makeDirective(
        condition, "dispatch_caravan", best.toHub,
        `scarcity_caravan: ${condition.commodity} stock at ${condition.currentStock}/${condition.initialStock}, price gap ${priceGapBps / 100}%`,
        urgency, Math.min(50, Math.ceil(condition.initialStock * 0.3)), best.toPriceCopper, 0,
      );
    }
  }

  // No cheaper source — hoard remaining stock
  if (isScarce) {
    return makeDirective(
      condition, "hoard_resources", null,
      `scarcity_hoard: ${condition.commodity} stock critically low at ${condition.currentStock}`,
      clampBps(10_000 - stockRatio * 10_000), 0, condition.currentPriceCopper, 0,
    );
  }

  return holdDirective(condition, "no_scarcity");
}

/**
 * Rule 2: Price threshold — auto-buy when price is low, auto-sell when high.
 */
export function evaluatePriceThreshold(condition: MarketCondition): GuildTradeDirective {
  const priceRatio = condition.basePriceCopper > 0
    ? Math.round((condition.currentPriceCopper / condition.basePriceCopper) * 10_000)
    : 10_000;

  if (priceRatio <= AUTO_BUY_THRESHOLD_BPS) {
    const urgency = clampBps((AUTO_BUY_THRESHOLD_BPS - priceRatio) * 2);
    const buyQty = Math.min(100, Math.floor(condition.treasuryCopper / Math.max(1, condition.currentPriceCopper)));
    return makeDirective(
      condition, "auto_buy", null,
      `auto_buy: ${condition.commodity} at ${condition.currentPriceCopper}c (${priceRatio / 100}% of base)`,
      urgency, buyQty, condition.currentPriceCopper, 0,
    );
  }

  if (priceRatio >= AUTO_SELL_THRESHOLD_BPS) {
    const urgency = clampBps((priceRatio - AUTO_SELL_THRESHOLD_BPS) * 2);
    const sellQty = Math.min(condition.currentStock, Math.ceil(condition.initialStock * 0.2));
    return makeDirective(
      condition, "auto_sell", null,
      `auto_sell: ${condition.commodity} at ${condition.currentPriceCopper}c (${priceRatio / 100}% of base)`,
      urgency, sellQty, condition.currentPriceCopper, 0,
    );
  }

  return holdDirective(condition, "price_in_band");
}

/**
 * Rule 3: Tax adjustment — guilds adjust tax rates based on treasury and stability.
 */
export function evaluateTaxPolicy(condition: MarketCondition): GuildTradeDirective {
  let taxDelta = 0;
  let reason = "tax_hold";

  if (condition.treasuryCopper < TREASURY_LOW_THRESHOLD_COPPER && condition.taxRateBps < MAX_TAX_BPS) {
    taxDelta = TAX_ADJUSTMENT_STEP_BPS;
    reason = `tax_increase: treasury low at ${condition.treasuryCopper}c`;
  } else if (condition.guildStability < STABILITY_LOW_THRESHOLD && condition.taxRateBps > MIN_TAX_BPS) {
    taxDelta = -TAX_ADJUSTMENT_STEP_BPS;
    reason = `tax_decrease: stability low at ${condition.guildStability}`;
  } else if (condition.guildStability > STABILITY_HIGH_THRESHOLD && condition.taxRateBps > MIN_TAX_BPS) {
    taxDelta = -TAX_ADJUSTMENT_STEP_BPS;
    reason = `tax_decrease: stability high at ${condition.guildStability}, stimulate trade`;
  }

  if (taxDelta === 0) return holdDirective(condition, "tax_stable");

  return makeDirective(
    condition,
    taxDelta > 0 ? "increase_tax" : "decrease_tax",
    null,
    reason,
    clampBps(Math.abs(taxDelta) * 20),
    0, 0, taxDelta,
  );
}

/**
 * Rule 4: Inter-hub arbitrage — when price differential exceeds threshold,
 * guilds open trade routes and dispatch caravans.
 */
export function evaluateArbitrageOpportunity(
  fromHub: HubId,
  toHub: HubId,
  commodity: CommodityId,
  fromPrice: number,
  toPrice: number,
  fromStock: number,
  toStock: number,
  guildStability: number,
): GuildTradeDirective | null {
  if (!hasLivingWorldRoute(fromHub, toHub)) return null;
  if (toPrice <= fromPrice) return null;

  const priceGapBps = Math.round(((toPrice - fromPrice) / fromPrice) * 10_000);
  if (priceGapBps < CARAVAN_ARBITRAGE_THRESHOLD_BPS) return null;

  const security = caravanSecurityIndex(fromHub, toHub, guildStability * 100, 10);
  const securityOk = security >= 40;
  if (!securityOk) return null;

  const quantity = Math.min(fromStock, Math.ceil(toStock * 0.3));
  const condition: MarketCondition = {
    hubId: fromHub,
    commodity,
    currentStock: fromStock,
    initialStock: fromStock,
    currentPriceCopper: fromPrice,
    basePriceCopper: commodityBasePrice[commodity],
    demandBps: 5_000,
    taxRateBps: 0,
    treasuryCopper: 0,
    guildStability,
  };

  return makeDirective(
    condition, "open_trade_route", toHub,
    `arbitrage: ${commodity} ${fromHub}→${toHub}, gap ${priceGapBps / 100}%, security ${security}`,
    clampBps(priceGapBps / 3),
    quantity, fromPrice, 0,
  );
}

/**
 * Master evaluation: runs all rules for a single market condition and returns
 * the highest-urgency directive. Guilds should execute the top directive.
 */
export function evaluateGuildTradeResponse(
  condition: MarketCondition,
  interHubPrices: readonly InterHubPriceData[],
): GuildTradeDirective {
  const directives: GuildTradeDirective[] = [
    evaluateScarcityResponse(condition, interHubPrices),
    evaluatePriceThreshold(condition),
    evaluateTaxPolicy(condition),
  ];

  // Also evaluate arbitrage for each reachable hub
  for (const inter of interHubPrices.filter(p => p.fromHub === condition.hubId)) {
    const arb = evaluateArbitrageOpportunity(
      inter.fromHub, inter.toHub, inter.commodity,
      inter.fromPriceCopper, inter.toPriceCopper,
      inter.fromStock, inter.toStock,
      condition.guildStability,
    );
    if (arb) directives.push(arb);
  }

  // Return highest urgency directive
  return directives.reduce((best, current) =>
    current.urgencyBps > best.urgencyBps ? current : best,
  );
}

// ─── Directive constructors ────────────────────────────────────────────────

function makeDirective(
  condition: MarketCondition,
  action: TradeRuleAction,
  targetHubId: HubId | null,
  reason: string,
  urgencyBps: number,
  quantity: number,
  pricePerUnitCopper: number,
  taxAdjustmentBps: number,
): GuildTradeDirective {
  const guildId = `guild_${condition.hubId}`;
  const receiptHash = hash([
    "aurion:trade-rule:v1",
    guildId,
    condition.hubId,
    action,
    condition.commodity,
    String(urgencyBps),
    String(quantity),
    String(pricePerUnitCopper),
    String(taxAdjustmentBps),
    targetHubId ?? "none",
    reason,
  ]);
  return Object.freeze({
    guildId,
    hubId: condition.hubId,
    action,
    commodity: condition.commodity,
    reason,
    urgencyBps,
    targetHubId,
    quantity,
    pricePerUnitCopper,
    taxAdjustmentBps,
    receiptHash,
  });
}

function holdDirective(condition: MarketCondition, reason: string): GuildTradeDirective {
  return makeDirective(condition, "hold", null, `hold: ${reason}`, 0, 0, 0, 0);
}

// ─── Batch evaluation for all hubs ─────────────────────────────────────────

export type GuildMarketSnapshot = Readonly<{
  markets: Readonly<Record<HubId, MarketState>>;
  guildStability: Readonly<Record<HubId, number>>;
  initialStock: Readonly<Record<HubId, Readonly<Record<CommodityId, number>>>>;
}>;

export type GuildTradeReport = Readonly<{
  directives: readonly GuildTradeDirective[];
  tickIndex: number;
  summary: string;
}>;

/**
 * Evaluates all guild trade rules across all hubs for a single market tick.
 * Returns a sorted list of directives (highest urgency first).
 */
export function evaluateAllGuildsTick(
  snapshot: GuildMarketSnapshot,
  tickIndex: number,
): GuildTradeReport {
  const hubIds: HubId[] = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];
  const commodities: CommodityId[] = ["grain", "sandstone", "bronze", "aether", "salve", "rune_core"];
  const allDirectives: GuildTradeDirective[] = [];

  // Build inter-hub price data for all hub pairs
  const interHubPrices: InterHubPriceData[] = [];
  for (const from of hubIds) {
    for (const to of hubIds) {
      if (from === to || !hasLivingWorldRoute(from, to)) continue;
      const fromMarket = snapshot.markets[from];
      const toMarket = snapshot.markets[to];
      if (!fromMarket || !toMarket) continue;
      for (const commodity of commodities) {
        const fromPrice = marketPriceCopper({
          commodity,
          stock: fromMarket.stock[commodity],
          demandBps: 5_000,
          taxRateBasisPoints: fromMarket.taxRateBasisPoints,
        });
        const toPrice = marketPriceCopper({
          commodity,
          stock: toMarket.stock[commodity],
          demandBps: 5_000,
          taxRateBasisPoints: toMarket.taxRateBasisPoints,
        });
        interHubPrices.push({
          fromHub: from,
          toHub: to,
          commodity,
          fromPriceCopper: fromPrice,
          toPriceCopper: toPrice,
          fromStock: fromMarket.stock[commodity],
          toStock: toMarket.stock[commodity],
        });
      }
    }
  }

  // Evaluate each hub's market conditions
  for (const hubId of hubIds) {
    const market = snapshot.markets[hubId];
    if (!market) continue;
    const stability = snapshot.guildStability[hubId] ?? 0.5;
    const initial = snapshot.initialStock[hubId];

    for (const commodity of commodities) {
      const currentPrice = marketPriceCopper({
        commodity,
        stock: market.stock[commodity],
        demandBps: 5_000,
        taxRateBasisPoints: market.taxRateBasisPoints,
      });
      const condition: MarketCondition = {
        hubId,
        commodity,
        currentStock: market.stock[commodity],
        initialStock: initial?.[commodity] ?? market.stock[commodity],
        currentPriceCopper: currentPrice,
        basePriceCopper: commodityBasePrice[commodity],
        demandBps: 5_000,
        taxRateBps: market.taxRateBasisPoints,
        treasuryCopper: market.treasuryCopper,
        guildStability: stability,
      };
      const directive = evaluateGuildTradeResponse(condition, interHubPrices);
      if (directive.action !== "hold") {
        allDirectives.push(directive);
      }
    }
  }

  // Deduplicate directives by (guildId, action, commodity, targetHubId)
  const seen = new Set<string>();
  const uniqueDirectives = allDirectives.filter(d => {
    const key = `${d.guildId}:${d.action}:${d.commodity}:${d.targetHubId ?? "none"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  uniqueDirectives.sort((a, b) => b.urgencyBps - a.urgencyBps);

  const activeCount = uniqueDirectives.length;
  const summary = `Tick ${tickIndex}: ${activeCount} active guild directive(s) across ${hubIds.length} hubs`;

  return Object.freeze({
    directives: Object.freeze(uniqueDirectives),
    tickIndex,
    summary,
  });
}
