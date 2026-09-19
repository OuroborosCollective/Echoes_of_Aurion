import type { NpcNeedKey } from "./npcNeeds.js";
export declare const AURION_WASD_RULESET_VERSION = "aurion-wasd-rules-v1";
export declare const AURION_WASD_CONTENT_VERSION = "aurion-wasd-content-v1";
export declare const worldSignalKinds: readonly ["weather", "ecology", "hazard", "resonance", "economy", "politics", "war", "player_event"];
export type WorldSignalKind = (typeof worldSignalKinds)[number];
export type WorldSignal = {
    id: string;
    kind: WorldSignalKind;
    regionId: string;
    magnitude: number;
    sourceReceiptId: string;
    resolutionIndex: number;
};
export type WorldReaction = {
    id: string;
    regionId: string;
    ruleSetVersion: string;
    contentVersion: string;
    resolutionIndex: number;
    signalIds: readonly string[];
    weatherTone: "clear" | "rain" | "storm" | "ashfall";
    threatDelta: number;
    resourceDelta: number;
    npcNeedDeltas: Readonly<Record<NpcNeedKey, number>>;
    dialogueTone: "calm" | "guarded" | "urgent";
    deterministicHash: string;
};
export declare const polityGovernmentTypes: readonly ["monarchy", "council", "theocracy", "trade_republic", "warband"];
export type PolityGovernmentType = (typeof polityGovernmentTypes)[number];
export declare const diplomacyTypes: readonly ["alliance", "trade", "non_aggression", "tribute", "sanction"];
export type DiplomacyType = (typeof diplomacyTypes)[number];
export type PolityState = {
    polityId: string;
    governmentType: PolityGovernmentType;
    territoryIds: readonly string[];
    stability: number;
    activeDiplomacy: readonly DiplomacyType[];
    warPressure: number;
    reactionHash: string;
};
export declare function buildWorldSeedDigest(input: {
    worldSeed: string;
    regionId: string;
    resolutionIndex: number;
}): string;
/** Resolves bounded visual and gameplay read-model effects from already-confirmed signals. */
export declare function resolveWorldReaction(input: {
    worldSeed: string;
    regionId: string;
    resolutionIndex: number;
    signals: readonly WorldSignal[];
}): WorldReaction;
export declare function resolvePolityState(input: {
    polityId: string;
    governmentType: PolityGovernmentType;
    territoryIds: readonly string[];
    stability: number;
    activeDiplomacy: readonly DiplomacyType[];
    warSignals: readonly WorldSignal[];
}): PolityState;
