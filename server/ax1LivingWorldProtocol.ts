import { createHash } from "node:crypto";

export const AX1_LIVING_WORLD_RULESET = "aurion-ax1-living-world.v1" as const;
export const livingWorldSocialActions = ["negotiation", "diplomacy", "intimidation", "friendship", "trade", "leadership", "politics"] as const;
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
export type LivingWorldResolution = Readonly<{
  resolutionIndex: number;
  market: MarketState;
  npc: NpcEconomyState;
  action: "consume" | "produce" | "trade" | "caravan" | "patrol";
  commodity: CommodityId;
  quantity: number;
  unitPriceCopper: number;
  taxCopper: number;
  caravan: Readonly<{ destination: HubId | null; securityIndex: number; ambushed: boolean }>;
  nextMemory: readonly string[];
  stabilityDelta: number;
  deterministicHash: string;
}>;

const commodityBasePrice: Readonly<Record<CommodityId, number>> = Object.freeze({ grain: 20, sandstone: 45, bronze: 90, aether: 220, salve: 60, rune_core: 450 });
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

function hash(...parts: readonly (string | number)[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}
function seed32(value: string): number {
  const digest = createHash("sha256").update(value, "utf8").digest();
  return digest.readUInt32BE(0) >>> 0;
}
function next(seed: number): { value: number; seed: number } {
  let state = (seed + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: state };
}
function boundedInt(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} out of range`);
  return value;
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

/** Damped deterministic pricing adapted from -ax1 AutonomousNPCEconomy. */
export function marketPriceCopper(input: Readonly<{ commodity: CommodityId; stock: number; demandBps: number; taxRateBasisPoints: number; memoryAffinityBps?: number }>): number {
  const stock = Math.max(1, boundedInt(input.stock, 0, 1_000_000, "stock"));
  const demand = boundedInt(input.demandBps, 0, 20_000, "demandBps") / 10_000;
  const tax = boundedInt(input.taxRateBasisPoints, 0, 5_000, "taxRateBasisPoints") / 10_000;
  const affinity = boundedInt(input.memoryAffinityBps ?? 10_000, 2_500, 30_000, "memoryAffinityBps") / 10_000;
  const scarcity = clamp(120 / stock, 0.2, 4);
  const damped = Math.tanh((demand * affinity * scarcity) - 1);
  const beforeTax = commodityBasePrice[input.commodity] * (1 + 0.85 * damped);
  return Math.max(1, Math.round(beforeTax * (1 + tax)));
}

export function caravanSecurityIndex(from: HubId, to: HubId, polityStability: number, rememberedThreat: number): number {
  const direct = routeSecurity[`${from}:${to}`] ?? routeSecurity[`${to}:${from}`] ?? 50;
  return Math.round(clamp(direct + clamp(polityStability, -100, 100) * 0.15 - clamp(rememberedThreat, 0, 100) * 0.35, 5, 100));
}

export function socialMasteryEvidence(action: LivingWorldSocialAction, sourceReceiptId: string, resolutionIndex: number): Readonly<{ disciplineId: "diplomacy" | "council" | "sovereignty" | "stewardship"; amountExact: string; sourceReceiptId: string; resolutionIndex: number; reputationDelta: number }> {
  if (!sourceReceiptId || !Number.isSafeInteger(resolutionIndex) || resolutionIndex < 0) throw new Error("social evidence requires server receipt and resolution index");
  const mapping = {
    negotiation: ["diplomacy", "3", 2], diplomacy: ["diplomacy", "5", 4], intimidation: ["sovereignty", "3", -2], friendship: ["stewardship", "4", 5], trade: ["stewardship", "3", 3], leadership: ["council", "5", 4], politics: ["sovereignty", "5", 3],
  } as const;
  const [disciplineId, amountExact, reputationDelta] = mapping[action];
  return Object.freeze({ disciplineId, amountExact, sourceReceiptId, resolutionIndex, reputationDelta });
}

/** One server-owned fixed logical resolution; browser inputs never choose prices, drops, ticks or outcomes. */
export function resolveLivingWorldTick(input: Readonly<{ worldSeed: string; resolutionIndex: number; market: MarketState; npc: NpcEconomyState; polityStability: number }>): LivingWorldResolution {
  if (!input.worldSeed.trim() || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("invalid living world context");
  let rng = seed32(`${input.worldSeed}:${input.resolutionIndex}:${input.npc.npcId}:${AX1_LIVING_WORLD_RULESET}`);
  const roll = () => { const result = next(rng); rng = result.seed; return result.value; };
  const hunger = boundedInt(input.npc.hungerBps, 0, 10_000, "hungerBps");
  const fatigue = boundedInt(input.npc.fatigueBps, 0, 10_000, "fatigueBps");
  const focus = productionFocus[input.market.hubId];
  const commodity = focus[Math.floor(roll() * focus.length)]!;
  const memoryAffinityBps = input.npc.memory.some(entry => entry.includes(`trade:${input.market.hubId}`)) ? 13_000 : 10_000;
  const demandBps = clamp(5_000 + hunger + Math.round(fatigue * 0.25), 0, 20_000);
  const unitPriceCopper = marketPriceCopper({ commodity, stock: input.market.stock[commodity], demandBps, taxRateBasisPoints: input.market.taxRateBasisPoints, memoryAffinityBps });
  const quantity = Math.max(1, Math.floor((2 + roll() * 4) * clamp(input.npc.harvestYieldBps / 10_000, 0.5, 2)));
  let action: LivingWorldResolution["action"] = hunger >= 7_500 ? "consume" : fatigue >= 8_500 ? "patrol" : input.npc.wealthCopper < unitPriceCopper * 2 ? "produce" : "trade";
  const destinations = (["observatory_threshold", "windhollow", "emberfall", "cinder_vault"] as const).filter(hub => hub !== input.market.hubId);
  let destination: HubId | null = null;
  let securityIndex = 100;
  let ambushed = false;
  if (action === "trade" && roll() > 0.45) {
    action = "caravan";
    destination = destinations[Math.floor(roll() * destinations.length)]!;
    const rememberedThreat = input.npc.memory.some(entry => entry.startsWith("danger:")) ? 60 : 10;
    securityIndex = caravanSecurityIndex(input.market.hubId, destination, input.polityStability, rememberedThreat);
    ambushed = roll() < (100 - securityIndex) / 300;
  }
  const taxCopper = action === "trade" || action === "caravan" ? Math.floor(unitPriceCopper * quantity * input.market.taxRateBasisPoints / 10_000) : 0;
  const memoryEntry = action === "caravan" ? `trade:${destination}:${commodity}:${unitPriceCopper}:security=${securityIndex}${ambushed ? ":ambushed" : ""}` : `${action}:${input.market.hubId}:${commodity}:${unitPriceCopper}`;
  const nextMemory = Object.freeze([...input.npc.memory, memoryEntry].slice(-24));
  const stabilityDelta = ambushed ? -2 : action === "patrol" ? 1 : taxCopper > 0 ? 1 : 0;
  const market: MarketState = Object.freeze({ ...input.market, treasuryCopper: input.market.treasuryCopper + taxCopper, stock: Object.freeze({ ...input.market.stock, [commodity]: Math.max(0, input.market.stock[commodity] + (action === "produce" ? quantity : action === "consume" || action === "trade" || action === "caravan" ? -Math.min(quantity, input.market.stock[commodity]) : 0)) }) });
  const npc: NpcEconomyState = Object.freeze({ ...input.npc, wealthCopper: Math.max(0, input.npc.wealthCopper + (action === "produce" ? 0 : action === "consume" ? -Math.min(input.npc.wealthCopper, unitPriceCopper) : unitPriceCopper * quantity - taxCopper)), memory: nextMemory });
  const deterministicHash = hash(AX1_LIVING_WORLD_RULESET, input.worldSeed, input.resolutionIndex, npc.npcId, action, commodity, quantity, unitPriceCopper, taxCopper, destination ?? "none", securityIndex, ambushed ? 1 : 0, ...nextMemory);
  return Object.freeze({ resolutionIndex: input.resolutionIndex, market, npc, action, commodity, quantity, unitPriceCopper, taxCopper, caravan: Object.freeze({ destination, securityIndex, ambushed }), nextMemory, stabilityDelta, deterministicHash });
}
