export declare const npcNeedKeys: readonly ["safety", "resources", "belonging", "status", "wealth", "power"];
export type NpcNeedKey = (typeof npcNeedKeys)[number];
export type NpcNeedState = Readonly<Record<NpcNeedKey, number>>;
export type NpcNeedEvent = {
    id: string;
    need: NpcNeedKey;
    delta: number;
    sourceReceiptId: string;
    resolutionIndex: number;
};
export type NpcGoal = "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
export type NpcDecision = {
    npcId: string;
    goal: NpcGoal;
    needs: NpcNeedState;
    observationIds: readonly string[];
    decisionHash: string;
    resolutionIndex: number;
};
export declare function resolveNpcNeeds(input: {
    current?: Partial<NpcNeedState>;
    events: readonly NpcNeedEvent[];
}): NpcNeedState;
export declare function decideNpcGoal(input: {
    npcId: string;
    needs: NpcNeedState;
    observationIds: readonly string[];
    resolutionIndex: number;
}): NpcDecision;
