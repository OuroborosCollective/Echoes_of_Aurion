import type { NpcGoal } from "./npcNeeds.js";
export declare const AX1_LIVING_WORLD_RULESET: "aurion-ax1-living-world.v2";
export declare const livingWorldSocialActions: readonly ["negotiation", "diplomacy", "intimidation", "friendship", "trade", "leadership", "politics"];
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
}>;
/** Damped deterministic pricing adapted from -ax1 AutonomousNPCEconomy. */
export declare function marketPriceCopper(input: Readonly<{
    commodity: CommodityId;
    stock: number;
    demandBps: number;
    taxRateBasisPoints: number;
    memoryAffinityBps?: number;
}>): number;
export declare function caravanSecurityIndex(from: HubId, to: HubId, polityStability: number, rememberedThreat: number): number;
export declare function socialMasteryEvidence(action: LivingWorldSocialAction, sourceReceiptId: string, resolutionIndex: number): Readonly<{
    disciplineId: "diplomacy" | "council" | "sovereignty" | "stewardship";
    amountExact: string;
    sourceReceiptId: string;
    resolutionIndex: number;
    reputationDelta: number;
}>;
/** One server-owned fixed logical resolution; browser inputs never choose prices, drops, ticks or outcomes. */
export declare function resolveLivingWorldTick(input: Readonly<{
    worldSeed: string;
    resolutionIndex: number;
    market: MarketState;
    npc: NpcEconomyState;
    polityStability: number;
    preferredGoal?: NpcGoal;
}>): LivingWorldResolution;
