import { resolveLivingWorldTick, socialMasteryEvidence, type LivingWorldSocialAction, type HubId, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol.js";
import type { NpcRequest, NpcSnapshot } from "./npcPersistenceProtocol.js";
import type { PolityGovernmentType, WorldSignal } from "./worldPolityRules.js";
export type MerchantDecisionRequests = Readonly<{
    resolution: ReturnType<typeof resolveLivingWorldTick>;
    npcRequest: NpcRequest;
    worldRequest: Readonly<{
        worldSeed: string;
        regionId: HubId;
        resolutionIndex: number;
        signals: readonly WorldSignal[];
    }>;
    polityRequest: Readonly<{
        polityId: string;
        governmentType: PolityGovernmentType;
        territoryIds: readonly string[];
        stability: number;
        activeDiplomacy: readonly ("alliance" | "trade" | "non_aggression" | "tribute" | "sanction")[];
        warSignals: readonly WorldSignal[];
    }>;
    socialEvidence?: ReturnType<typeof socialMasteryEvidence>;
    receiptId: string;
}>;
export declare const merchantBootstrapMarkets: Readonly<Record<HubId, MarketState>>;
export declare function npcIdentity(regionId: HubId): string;
export declare function confirmedNpcEconomy(homeRegionId: HubId, snapshot: NpcSnapshot | null): NpcEconomyState;
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
    resolution: ReturnType<typeof resolveLivingWorldTick>;
    npcRequest: NpcRequest;
    worldRequest: Readonly<{
        worldSeed: string;
        regionId: HubId;
        resolutionIndex: number;
        signals: readonly WorldSignal[];
    }>;
    polityRequest: Readonly<{
        polityId: string;
        governmentType: PolityGovernmentType;
        territoryIds: readonly string[];
        stability: number;
        activeDiplomacy: readonly ("alliance" | "trade" | "non_aggression" | "tribute" | "sanction")[];
        warSignals: readonly WorldSignal[];
    }>;
    socialEvidence?: ReturnType<typeof socialMasteryEvidence>;
    receiptId: string;
}>;
