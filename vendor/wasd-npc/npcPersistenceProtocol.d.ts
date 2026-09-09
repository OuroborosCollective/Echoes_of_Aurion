import { z } from "zod/v3";
import { decideNpcGoal, npcNeedKeys, type NpcNeedState } from "./npcNeeds.js";
import { type NpcEconomyLifeState, type NpcLifeDecision, type NpcLifeOpportunity, type NpcLifeState, type NpcRelationshipEvent } from "./npcLifeProtocol.js";
export declare const NPC_MEMORY_VERSION: "aurion-npc-memory.v2";
export declare const NPC_RECEIPT_VERSION: "aurion-npc-decision.v2";
export declare const NPC_LIFE_RECEIPT_VERSION: "aurion-npc-decision.v3";
export declare const NPC_MEMORY_CAPACITY = 24;
export declare const NPC_MEMORY_AGE_TICKS = 3500;
export declare const npcNeedsSchema: z.ZodObject<{
    safety: z.ZodNumber;
    resources: z.ZodNumber;
    belonging: z.ZodNumber;
    status: z.ZodNumber;
    wealth: z.ZodNumber;
    power: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    safety: number;
    resources: number;
    belonging: number;
    status: number;
    wealth: number;
    power: number;
}, {
    safety: number;
    resources: number;
    belonging: number;
    status: number;
    wealth: number;
    power: number;
}>;
export type NpcRequest = Readonly<{
    npcId: string;
    regionId: string;
    resolutionIndex: number;
    needEvents: readonly Readonly<{
        id: string;
        need: (typeof npcNeedKeys)[number];
        delta: number;
        sourceReceiptId: string;
        resolutionIndex: number;
    }>[];
    observationIds: readonly string[];
    memory: readonly string[];
    languageProfileId?: string;
    roleId?: string;
    relationshipEvents?: readonly NpcRelationshipEvent[];
    opportunities?: readonly NpcLifeOpportunity[];
    economy?: NpcEconomyLifeState;
}>;
export declare const npcRequestSchema: z.ZodObject<{
    npcId: z.ZodString;
    regionId: z.ZodString;
    resolutionIndex: z.ZodNumber;
    needEvents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        need: z.ZodEnum<["safety", "resources", "belonging", "status", "wealth", "power"]>;
        delta: z.ZodNumber;
        sourceReceiptId: z.ZodString;
        resolutionIndex: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
        delta: number;
    }, {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
        delta: number;
    }>, "many">;
    observationIds: z.ZodArray<z.ZodString, "many">;
    memory: z.ZodArray<z.ZodString, "many">;
    languageProfileId: z.ZodDefault<z.ZodString>;
    roleId: z.ZodDefault<z.ZodString>;
    relationshipEvents: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }>, "many">>;
    opportunities: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }>, "many">>;
    economy: z.ZodOptional<z.ZodObject<{
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
    }>>;
}, "strict", z.ZodTypeAny, {
    resolutionIndex: number;
    npcId: string;
    memory: string[];
    regionId: string;
    roleId: string;
    observationIds: string[];
    relationshipEvents: {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        targetId: string;
        trustDeltaBps: number;
        affectionDeltaBps: number;
        fearDeltaBps: number;
        rivalryDeltaBps: number;
        debtDeltaCopper: number;
    }[];
    opportunities: {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        kind: "market" | "safe_hub" | "resource" | "social" | "reputation" | "influence";
        regionId: string;
        benefitBps: number;
        riskBps: number;
        distanceBps: number;
        targetId?: string | undefined;
    }[];
    needEvents: {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
        delta: number;
    }[];
    languageProfileId: string;
    economy?: {
        currentHubId: string;
        wealthCopper: number;
        hungerBps: number;
        fatigueBps: number;
        tradeProwessBps: number;
        harvestYieldBps: number;
    } | undefined;
}, {
    resolutionIndex: number;
    npcId: string;
    memory: string[];
    regionId: string;
    observationIds: string[];
    needEvents: {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
        delta: number;
    }[];
    roleId?: string | undefined;
    economy?: {
        currentHubId: string;
        wealthCopper: number;
        hungerBps: number;
        fatigueBps: number;
        tradeProwessBps: number;
        harvestYieldBps: number;
    } | undefined;
    relationshipEvents?: {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        targetId: string;
        trustDeltaBps?: number | undefined;
        affectionDeltaBps?: number | undefined;
        fearDeltaBps?: number | undefined;
        rivalryDeltaBps?: number | undefined;
        debtDeltaCopper?: number | undefined;
    }[] | undefined;
    opportunities?: {
        sourceReceiptId: string;
        resolutionIndex: number;
        id: string;
        kind: "market" | "safe_hub" | "resource" | "social" | "reputation" | "influence";
        regionId: string;
        benefitBps: number;
        riskBps: number;
        distanceBps: number;
        targetId?: string | undefined;
    }[] | undefined;
    languageProfileId?: string | undefined;
}>;
export declare function npcHash(value: unknown): string;
export declare function normalizeNpcRequest(input: unknown): {
    economy?: Readonly<{
        currentHubId: string;
        wealthCopper: number;
        hungerBps: number;
        fatigueBps: number;
        tradeProwessBps: number;
        harvestYieldBps: number;
    }> | undefined;
    npcId: string;
    regionId: string;
    resolutionIndex: number;
    languageProfileId: string;
    roleId: string;
    observationIds: string[];
    memory: string[];
    needEvents: {
        id: string;
        need: "safety" | "resources" | "belonging" | "status" | "wealth" | "power";
        delta: number;
        sourceReceiptId: string;
        resolutionIndex: number;
    }[];
    relationshipEvents: Readonly<{
        id: string;
        targetId: string;
        trustDeltaBps: number;
        affectionDeltaBps: number;
        fearDeltaBps: number;
        rivalryDeltaBps: number;
        debtDeltaCopper: number;
        sourceReceiptId: string;
        resolutionIndex: number;
    }>[];
    opportunities: Readonly<{
        id: string;
        kind: import("./npcLifeProtocol.js").NpcLifeOpportunityKind;
        regionId: string;
        targetId?: string;
        benefitBps: number;
        riskBps: number;
        distanceBps: number;
        sourceReceiptId: string;
        resolutionIndex: number;
    }>[];
};
export declare function npcRequestHash(input: ReturnType<typeof normalizeNpcRequest>, version: typeof NPC_RECEIPT_VERSION | typeof NPC_LIFE_RECEIPT_VERSION): string;
export declare function parseNpcJson(raw: string): unknown;
export type NpcMemory = Readonly<{
    version: typeof NPC_MEMORY_VERSION;
    entries: readonly Readonly<{
        id: string;
        text: string;
        lastSeenIndex: number;
    }>[];
}>;
export declare function parseNpcMemory(raw: string, lastIndex: number): NpcMemory;
export declare function advanceNpcMemory(current: NpcMemory, texts: readonly string[], resolutionIndex: number): NpcMemory;
export declare function parseNpcNeeds(value: unknown): NpcNeedState;
export type LegacyNpcSnapshot = Readonly<{
    npcId: string;
    regionId: string;
    needs: NpcNeedState;
    memory: readonly string[];
    memoryState: NpcMemory;
    decision: ReturnType<typeof decideNpcGoal>;
}>;
export type NpcLifeSnapshot = Readonly<{
    npcId: string;
    regionId: string;
    needs: NpcNeedState;
    memory: readonly string[];
    memoryState: NpcMemory;
    lifeState: NpcLifeState;
    decision: NpcLifeDecision;
}>;
export type NpcSnapshot = LegacyNpcSnapshot | NpcLifeSnapshot;
/** Legacy constructor is intentionally retained so v2 receipts remain exactly re-verifiable. */
export declare function createNpcSnapshot(input: {
    npcId: string;
    regionId: string;
    needs: NpcNeedState;
    memoryState: NpcMemory;
    observationIds: readonly string[];
    resolutionIndex: number;
}): LegacyNpcSnapshot;
export declare function createNpcLifeSnapshot(input: ReturnType<typeof normalizeNpcRequest> & {
    needs: NpcNeedState;
    memoryState: NpcMemory;
    previousLifeState?: NpcLifeState;
}): NpcLifeSnapshot;
export declare function encodeNpcReceipt(requestHash: string, snapshot: LegacyNpcSnapshot): string;
export declare function encodeNpcLifeReceipt(requestHash: string, snapshot: NpcLifeSnapshot): string;
export declare function npcReceiptVersion(raw: string): typeof NPC_RECEIPT_VERSION | typeof NPC_LIFE_RECEIPT_VERSION;
export declare function decodeNpcReceipt(raw: string, expected: {
    npcId: string;
    regionId: string;
    resolutionIndex: number;
    decisionHash: string;
    goal: string;
    requestHash?: string;
}): NpcSnapshot;
