import { type LivingWorldSocialAction, type HubId, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol.js";
import type { NpcRequest, NpcSnapshot } from "./npcPersistenceProtocol.js";
export declare function npcIdentity(regionId: HubId): string;
/** Pure WASD merchant decision input derivation. Aurion supplies only confirmed prior state. */
export declare function prepareMerchantNpcDecision(input: {
    worldSeed: string;
    resolutionIndex: number;
    regionId: HubId;
    prior: NpcSnapshot | null;
    social?: Readonly<{
        action: LivingWorldSocialAction;
        sourceReceiptId: string;
    }>;
}): Readonly<{
    resolution: Readonly<{
        resolutionIndex: number;
        market: MarketState;
        npc: NpcEconomyState;
        preferredGoal: import("./npcNeeds.js").NpcGoal | null;
        action: "consume" | "produce" | "trade" | "caravan" | "patrol" | "rest" | "socialize";
        commodity: import("./ax1LivingWorldProtocol.js").CommodityId;
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
    npcRequest: NpcRequest;
    worldRequest: Readonly<{
        worldSeed: string;
        regionId: HubId;
        resolutionIndex: number;
        signals: ({
            id: string;
            kind: "economy";
            regionId: HubId;
            magnitude: number;
            sourceReceiptId: string;
            resolutionIndex: number;
        } | {
            id: string;
            kind: "politics" | "war";
            regionId: HubId;
            magnitude: number;
            sourceReceiptId: string;
            resolutionIndex: number;
        })[];
    }>;
    polityRequest: Readonly<{
        polityId: "polity:observatory_threshold" | "polity:windhollow" | "polity:emberfall" | "polity:cinder_vault";
        governmentType: "council" | "trade_republic" | "warband";
        territoryIds: HubId[];
        stability: number;
        activeDiplomacy: "trade"[] | "non_aggression"[];
        warSignals: {
            id: string;
            kind: "politics" | "war";
            regionId: HubId;
            magnitude: number;
            sourceReceiptId: string;
            resolutionIndex: number;
        }[];
    }>;
    socialEvidence: Readonly<{
        disciplineId: "diplomacy" | "council" | "sovereignty" | "stewardship";
        amountExact: string;
        sourceReceiptId: string;
        resolutionIndex: number;
        reputationDelta: number;
    }> | undefined;
    receiptId: string;
}>;
