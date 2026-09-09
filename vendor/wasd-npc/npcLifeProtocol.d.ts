import { z } from "zod/v3";
import type { NpcGoal, NpcNeedState } from "./npcNeeds.js";
export declare const NPC_LIFE_VERSION: "aurion-npc-life.v1";
export declare const NPC_LIFE_MAX_RELATIONSHIPS = 64;
export declare const NPC_LIFE_MAX_OPPORTUNITIES = 128;
export declare const NPC_LIFE_MAX_PLAN_STEPS = 6;
export declare const NPC_LIFE_MEMORY_HORIZON = 3500;
export declare const npcLifeGoals: readonly ["seek_safety", "gather_resources", "socialize", "gain_reputation", "trade", "expand_influence"];
export declare const npcLifeOpportunityKinds: readonly ["safe_hub", "resource", "social", "reputation", "market", "influence"];
export type NpcLifeOpportunityKind = (typeof npcLifeOpportunityKinds)[number];
export declare const npcLifePlanActions: readonly ["travel_to_safety", "recover_safety", "travel_to_resource", "gather_resource", "approach_actor", "socialize", "serve_region", "gain_reputation", "reach_market", "trade", "approach_influence_target", "extend_influence"];
export type NpcLifePlanAction = (typeof npcLifePlanActions)[number];
export type NpcPersonality = Readonly<{
    empathyBps: number;
    courageBps: number;
    curiosityBps: number;
    loyaltyBps: number;
    ambitionBps: number;
    prudenceBps: number;
}>;
export type NpcRelationshipEvent = Readonly<{
    id: string;
    targetId: string;
    trustDeltaBps: number;
    affectionDeltaBps: number;
    fearDeltaBps: number;
    rivalryDeltaBps: number;
    debtDeltaCopper: number;
    sourceReceiptId: string;
    resolutionIndex: number;
}>;
export type NpcRelationship = Readonly<{
    targetId: string;
    trustBps: number;
    affectionBps: number;
    fearBps: number;
    rivalryBps: number;
    debtCopper: number;
    lastResolutionIndex: number;
}>;
export type NpcLifeOpportunity = Readonly<{
    id: string;
    kind: NpcLifeOpportunityKind;
    regionId: string;
    targetId?: string;
    benefitBps: number;
    riskBps: number;
    distanceBps: number;
    sourceReceiptId: string;
    resolutionIndex: number;
}>;
export type NpcEconomyLifeState = Readonly<{
    currentHubId: string;
    wealthCopper: number;
    hungerBps: number;
    fatigueBps: number;
    tradeProwessBps: number;
    harvestYieldBps: number;
}>;
export type NpcLifePlanStep = Readonly<{
    action: NpcLifePlanAction;
    opportunityId: string;
    regionId: string;
    targetId?: string;
}>;
export type NpcLifePlan = Readonly<{
    status: "planned" | "blocked";
    goal: NpcGoal;
    opportunityId: string | null;
    steps: readonly NpcLifePlanStep[];
    planHash: string;
}>;
export type NpcLifeState = Readonly<{
    version: typeof NPC_LIFE_VERSION;
    npcId: string;
    homeRegionId: string;
    roleId: string;
    personality: NpcPersonality;
    relationships: readonly NpcRelationship[];
    currentGoal: NpcGoal;
    currentGoalSinceResolutionIndex: number;
    longTermGoal: NpcGoal;
    longTermGoalSinceResolutionIndex: number;
    plan: NpcLifePlan;
    economy?: NpcEconomyLifeState;
    lastResolutionIndex: number;
    decisionCount: number;
    stateHash: string;
}>;
export type NpcLifeDecision = Readonly<{
    npcId: string;
    goal: NpcGoal;
    longTermGoal: NpcGoal;
    needs: NpcNeedState;
    observationIds: readonly string[];
    resolutionIndex: number;
    utilityBps: Readonly<Record<NpcGoal, number>>;
    plan: NpcLifePlan;
    decisionHash: string;
}>;
export declare const npcRelationshipEventSchema: z.ZodObject<{
    id: z.ZodString;
    targetId: z.ZodString;
    trustDeltaBps: z.ZodDefault<z.ZodNumber>;
    affectionDeltaBps: z.ZodDefault<z.ZodNumber>;
    fearDeltaBps: z.ZodDefault<z.ZodNumber>;
    rivalryDeltaBps: z.ZodDefault<z.ZodNumber>;
    debtDeltaCopper: z.ZodDefault<z.ZodNumber>;
    sourceReceiptId: z.ZodString;
    resolutionIndex: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    sourceReceiptId: string;
    resolutionIndex: number;
    id: string;
    targetId: string;
    trustDeltaBps: number;
    affectionDeltaBps: number;
    fearDeltaBps: number;
    rivalryDeltaBps: number;
    debtDeltaCopper: number;
}, {
    sourceReceiptId: string;
    resolutionIndex: number;
    id: string;
    targetId: string;
    trustDeltaBps?: number | undefined;
    affectionDeltaBps?: number | undefined;
    fearDeltaBps?: number | undefined;
    rivalryDeltaBps?: number | undefined;
    debtDeltaCopper?: number | undefined;
}>;
export declare const npcLifeOpportunitySchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<["safe_hub", "resource", "social", "reputation", "market", "influence"]>;
    regionId: z.ZodString;
    targetId: z.ZodOptional<z.ZodString>;
    benefitBps: z.ZodNumber;
    riskBps: z.ZodNumber;
    distanceBps: z.ZodNumber;
    sourceReceiptId: z.ZodString;
    resolutionIndex: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    sourceReceiptId: string;
    resolutionIndex: number;
    id: string;
    kind: "market" | "safe_hub" | "resource" | "social" | "reputation" | "influence";
    regionId: string;
    benefitBps: number;
    riskBps: number;
    distanceBps: number;
    targetId?: string | undefined;
}, {
    sourceReceiptId: string;
    resolutionIndex: number;
    id: string;
    kind: "market" | "safe_hub" | "resource" | "social" | "reputation" | "influence";
    regionId: string;
    benefitBps: number;
    riskBps: number;
    distanceBps: number;
    targetId?: string | undefined;
}>;
export declare const npcEconomyLifeStateSchema: z.ZodObject<{
    currentHubId: z.ZodString;
    wealthCopper: z.ZodNumber;
    hungerBps: z.ZodNumber;
    fatigueBps: z.ZodNumber;
    tradeProwessBps: z.ZodNumber;
    harvestYieldBps: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    currentHubId: string;
    wealthCopper: number;
    hungerBps: number;
    fatigueBps: number;
    tradeProwessBps: number;
    harvestYieldBps: number;
}, {
    currentHubId: string;
    wealthCopper: number;
    hungerBps: number;
    fatigueBps: number;
    tradeProwessBps: number;
    harvestYieldBps: number;
}>;
declare const planSchema: z.ZodObject<{
    status: z.ZodEnum<["planned", "blocked"]>;
    goal: z.ZodEnum<["seek_safety", "gather_resources", "socialize", "gain_reputation", "trade", "expand_influence"]>;
    opportunityId: z.ZodNullable<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        action: z.ZodEnum<["travel_to_safety", "recover_safety", "travel_to_resource", "gather_resource", "approach_actor", "socialize", "serve_region", "gain_reputation", "reach_market", "trade", "approach_influence_target", "extend_influence"]>;
        opportunityId: z.ZodString;
        regionId: z.ZodString;
        targetId: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        action: "socialize" | "gain_reputation" | "trade" | "travel_to_safety" | "recover_safety" | "travel_to_resource" | "gather_resource" | "approach_actor" | "serve_region" | "reach_market" | "approach_influence_target" | "extend_influence";
        regionId: string;
        opportunityId: string;
        targetId?: string | undefined;
    }, {
        action: "socialize" | "gain_reputation" | "trade" | "travel_to_safety" | "recover_safety" | "travel_to_resource" | "gather_resource" | "approach_actor" | "serve_region" | "reach_market" | "approach_influence_target" | "extend_influence";
        regionId: string;
        opportunityId: string;
        targetId?: string | undefined;
    }>, "many">;
    planHash: z.ZodString;
}, "strict", z.ZodTypeAny, {
    status: "planned" | "blocked";
    opportunityId: string | null;
    goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
    steps: {
        action: "socialize" | "gain_reputation" | "trade" | "travel_to_safety" | "recover_safety" | "travel_to_resource" | "gather_resource" | "approach_actor" | "serve_region" | "reach_market" | "approach_influence_target" | "extend_influence";
        regionId: string;
        opportunityId: string;
        targetId?: string | undefined;
    }[];
    planHash: string;
}, {
    status: "planned" | "blocked";
    opportunityId: string | null;
    goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
    steps: {
        action: "socialize" | "gain_reputation" | "trade" | "travel_to_safety" | "recover_safety" | "travel_to_resource" | "gather_resource" | "approach_actor" | "serve_region" | "reach_market" | "approach_influence_target" | "extend_influence";
        regionId: string;
        opportunityId: string;
        targetId?: string | undefined;
    }[];
    planHash: string;
}>;
export { planSchema as npcLifePlanSchema };
export declare function parseNpcEconomyLifeState(value: unknown): NpcEconomyLifeState;
export declare function parseNpcLifeOpportunity(value: unknown): NpcLifeOpportunity;
export declare function parseNpcRelationshipEvent(value: unknown): NpcRelationshipEvent;
export declare function parseNpcLifeState(value: unknown): NpcLifeState;
export declare function deriveNpcPersonality(npcId: string): NpcPersonality;
export declare function npcLifeDecisionHash(input: {
    npcId: string;
    resolutionIndex: number;
    goal: NpcGoal;
    longTermGoal: NpcGoal;
    needs: NpcNeedState;
    observationIds: readonly string[];
    utilityBps: Readonly<Record<NpcGoal, number>>;
    planHash: string;
    stateHash: string;
}): string;
export declare function resolveNpcLife(input: Readonly<{
    npcId: string;
    regionId: string;
    roleId: string;
    resolutionIndex: number;
    needs: NpcNeedState;
    memoryEntries: readonly Readonly<{
        text: string;
        lastSeenIndex: number;
    }>[];
    observationIds: readonly string[];
    relationshipEvents: readonly NpcRelationshipEvent[];
    opportunities: readonly NpcLifeOpportunity[];
    previous?: NpcLifeState;
    economy?: NpcEconomyLifeState;
}>): Readonly<{
    state: NpcLifeState;
    decision: NpcLifeDecision;
}>;
