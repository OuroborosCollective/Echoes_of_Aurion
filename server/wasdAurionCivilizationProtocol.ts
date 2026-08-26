import { createHash } from "node:crypto";

/**
 * Aurion-native, pure adapters for the Wasd settlement, economy, crafting and
 * guild-territory semantics. Callers may persist only confirmed outputs.
 */
export type SettlementKind = "village" | "city" | "kingdom" | "nation";
export type SettlementState = {
  id: string;
  kind: SettlementKind;
  ownerId: string;
  regionId: string;
  foundedResolutionIndex: number;
  prosperity: number;
  stability: number;
  receiptHash: string;
};

export type MarketListing = { itemId: string; basePrice: number; category: "provisions" | "weapon" | "material" | "relic" };
export type MarketPrice = MarketListing & { price: number; scarcityDelta: number; weatherMultiplier: number; receiptHash: string };
export type ScarcitySignal = { regionId: string; itemId: string; shiftPercentage: number; x: number; y: number; z: number; resolutionIndex: number; sourceReceiptId: string };
export type CaravanMission = { npcId: string; regionId: string; goal: "find_trade_partner"; x: number; y: number; z: number; objectiveType: "scarcity_response"; receiptHash: string };

export type CraftIngredient = { itemId: string; amount: number };
export type CraftRecipe = { id: string; requiredLevel: number; ingredients: readonly CraftIngredient[]; result: CraftIngredient; xp: number };
export type InventoryStack = { itemId: string; amount: number };
export type CraftResolution = { state: "crafted" | "rejected"; reason?: "recipe_missing" | "level_too_low" | "missing_ingredients"; inventory: readonly InventoryStack[]; xpDelta: number; result?: CraftIngredient; receiptHash: string };

export type GuildState = { id: string; name: string; founderId: string; members: readonly string[]; ranks: Readonly<Record<string, "founder" | "member">>; treasury: number; receiptHash: string };
export type GuildTerritoryEffect = { chunkKey: string; ownerGuildId?: string; faithDelta: number; aggressionDelta: number; receiptHash: string };

const clamp = (value: number, lower = 0, upper = 1) => Math.max(lower, Math.min(upper, Math.round(value * 10_000) / 10_000));
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const stableAmount = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function resolveSettlement(input: { id: string; kind: SettlementKind; ownerId: string; regionId: string; foundedResolutionIndex: number; prosperity: number; stability: number }): SettlementState {
  if (!input.id || !input.ownerId || !input.regionId || !Number.isSafeInteger(input.foundedResolutionIndex) || input.foundedResolutionIndex < 0) throw new Error("Settlement requires explicit stable identity and resolution index");
  const prosperity = clamp(input.prosperity);
  const stability = clamp(input.stability);
  const receiptHash = hash(["wasd:settlement:v1", input.id, input.kind, input.ownerId, input.regionId, String(input.foundedResolutionIndex), String(prosperity), String(stability)]);
  return { ...input, prosperity, stability, receiptHash };
}

export function resolveMarketPrices(input: { regionId: string; weatherTone: "clear" | "rain" | "storm" | "ashfall"; listings: readonly MarketListing[]; scarcity: readonly ScarcitySignal[]; resolutionIndex: number }): readonly MarketPrice[] {
  const weatherMultiplier: Record<typeof input.weatherTone, number> = { clear: 1, rain: 1.05, storm: 1.12, ashfall: 1.2 };
  const multiplier = weatherMultiplier[input.weatherTone];
  const signals = input.scarcity.filter(signal => signal.regionId === input.regionId && signal.resolutionIndex <= input.resolutionIndex).slice().sort((a, b) => a.resolutionIndex - b.resolutionIndex || compare(a.sourceReceiptId, b.sourceReceiptId) || compare(a.itemId, b.itemId));
  return input.listings.slice().sort((a, b) => compare(a.itemId, b.itemId)).map(listing => {
    const scarcityDelta = signals.filter(signal => signal.itemId === listing.itemId).reduce((total, signal) => total + Math.max(-0.8, Math.min(0.8, signal.shiftPercentage)), 0);
    const price = Math.max(1, Math.floor(Math.max(1, listing.basePrice) * multiplier * (1 + scarcityDelta)));
    const receiptHash = hash(["wasd:market:v1", input.regionId, listing.itemId, String(input.resolutionIndex), String(price), String(scarcityDelta)]);
    return { ...listing, price, scarcityDelta, weatherMultiplier: multiplier, receiptHash };
  });
}

export function resolveCaravanMissions(input: { traders: readonly { npcId: string }[]; signals: readonly ScarcitySignal[]; threshold?: number }): readonly CaravanMission[] {
  const threshold = clamp(input.threshold ?? 0.15, 0, 1);
  const signals = input.signals.filter(signal => Math.abs(signal.shiftPercentage) >= threshold).slice().sort((a, b) => a.resolutionIndex - b.resolutionIndex || compare(a.regionId, b.regionId) || compare(a.itemId, b.itemId));
  return signals.flatMap(signal => input.traders.slice().sort((a, b) => compare(a.npcId, b.npcId)).map(trader => ({
    npcId: trader.npcId, regionId: signal.regionId, goal: "find_trade_partner" as const, x: signal.x, y: signal.y, z: signal.z, objectiveType: "scarcity_response" as const,
    receiptHash: hash(["wasd:caravan:v1", trader.npcId, signal.regionId, signal.itemId, String(signal.resolutionIndex), signal.sourceReceiptId]),
  })));
}

export function resolveCraft(input: { playerLevel: number; inventory: readonly InventoryStack[]; recipe?: CraftRecipe; receiptId: string }): CraftResolution {
  const normalized = input.inventory.map(row => ({ itemId: row.itemId, amount: stableAmount(row.amount) })).filter(row => row.itemId && row.amount > 0).sort((a, b) => compare(a.itemId, b.itemId));
  if (!input.recipe) return { state: "rejected", reason: "recipe_missing", inventory: normalized, xpDelta: 0, receiptHash: hash(["wasd:craft:v1", input.receiptId, "recipe_missing"]) };
  if (!Number.isInteger(input.playerLevel) || input.playerLevel < input.recipe.requiredLevel) return { state: "rejected", reason: "level_too_low", inventory: normalized, xpDelta: 0, receiptHash: hash(["wasd:craft:v1", input.receiptId, input.recipe.id, "level_too_low"]) };
  const required = input.recipe.ingredients.slice().sort((a, b) => compare(a.itemId, b.itemId));
  const available = new Map(normalized.map(row => [row.itemId, row.amount]));
  if (required.some(ingredient => (available.get(ingredient.itemId) ?? 0) < stableAmount(ingredient.amount))) return { state: "rejected", reason: "missing_ingredients", inventory: normalized, xpDelta: 0, receiptHash: hash(["wasd:craft:v1", input.receiptId, input.recipe.id, "missing_ingredients"]) };
  required.forEach(ingredient => available.set(ingredient.itemId, (available.get(ingredient.itemId) ?? 0) - stableAmount(ingredient.amount)));
  available.set(input.recipe.result.itemId, (available.get(input.recipe.result.itemId) ?? 0) + stableAmount(input.recipe.result.amount));
  const inventory = Array.from(available.entries()).filter(([, amount]) => amount > 0).map(([itemId, amount]) => ({ itemId, amount })).sort((a, b) => compare(a.itemId, b.itemId));
  const result = { itemId: input.recipe.result.itemId, amount: stableAmount(input.recipe.result.amount) };
  return { state: "crafted", inventory, xpDelta: stableAmount(input.recipe.xp), result, receiptHash: hash(["wasd:craft:v1", input.receiptId, input.recipe.id, result.itemId, String(result.amount), String(input.recipe.xp)]) };
}

export function resolveGuild(input: { id: string; name: string; founderId: string; members: readonly string[]; treasury?: number }): GuildState {
  if (!input.id || !input.name || !input.founderId) throw new Error("Guild requires explicit stable identity");
  const members = Array.from(new Set([input.founderId, ...input.members.filter(Boolean)])).sort(compare);
  const ranks = Object.fromEntries(members.map(member => [member, member === input.founderId ? "founder" : "member"] as const));
  const treasury = Math.max(0, Math.floor(input.treasury ?? 0));
  const receiptHash = hash(["wasd:guild:v1", input.id, input.name, input.founderId, ...members, String(treasury)]);
  return { id: input.id, name: input.name, founderId: input.founderId, members, ranks, treasury, receiptHash };
}

export function getTerritoryChunkKey(x: number, y: number, chunkSize = 64): string {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new Error("Territory coordinates and chunk size must be explicit");
  return `${Math.floor(x / chunkSize)}:${Math.floor(y / chunkSize)}`;
}

export function resolveGuildTerritoryEffect(input: { npcGuildId: string; x: number; y: number; territoryOwners: Readonly<Record<string, string>>; chunkSize?: number }): GuildTerritoryEffect {
  const chunkKey = getTerritoryChunkKey(input.x, input.y, input.chunkSize);
  const ownerGuildId = input.territoryOwners[chunkKey];
  const owned = Boolean(ownerGuildId && ownerGuildId === input.npcGuildId);
  const faithDelta = owned ? 0.05 : 0;
  const aggressionDelta = owned ? -0.02 : 0;
  return { chunkKey, ownerGuildId, faithDelta, aggressionDelta, receiptHash: hash(["wasd:guild-territory:v1", input.npcGuildId, chunkKey, ownerGuildId ?? "none", String(faithDelta), String(aggressionDelta)]) };
}
