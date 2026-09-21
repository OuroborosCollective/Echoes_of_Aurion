import { z } from "zod/v3";
import { npcAuthority } from "./authority.js";
import { decodeNpcReceipt, type NpcLifeSnapshot } from "./npcPersistenceProtocol.js";
export declare const NPC_MULTI_MEMORY_VERSION: "wasd-npc-multi-memory.v4";
export declare const NPC_MULTI_MEMORY_LIMITS: Readonly<{
    episodes: 24;
    facts: 64;
    competencies: 8;
    seenReceipts: 64;
    evidenceReceipts: 160;
    horizon: 3500;
    bytes: 262144;
    replayReceipts: 4096;
}>;
declare const provenanceSchema: z.ZodObject<{
    receiptId: z.ZodString;
    receiptSha256: z.ZodString;
    decisionHash: z.ZodString;
    logicalIndex: z.ZodNumber;
    authority: z.ZodObject<{
        rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
        sourceRevision: z.ZodString;
        sourceSha256: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    }, {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    }>;
}, "strict", z.ZodTypeAny, {
    decisionHash: string;
    receiptId: string;
    receiptSha256: string;
    logicalIndex: number;
    authority: {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    };
}, {
    decisionHash: string;
    receiptId: string;
    receiptSha256: string;
    logicalIndex: number;
    authority: {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    };
}>;
declare const factSchema: z.ZodObject<{
    id: z.ZodString;
    subjectId: z.ZodString;
    predicate: z.ZodEnum<["selected_goal", "current_hub"]>;
    value: z.ZodString;
    version: z.ZodLiteral<"wasd-npc-fact.v1">;
    validFromIndex: z.ZodNumber;
    validUntilIndex: z.ZodNumber;
    provenance: z.ZodArray<z.ZodObject<{
        receiptId: z.ZodString;
        receiptSha256: z.ZodString;
        decisionHash: z.ZodString;
        logicalIndex: z.ZodNumber;
        authority: z.ZodObject<{
            rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
            sourceRevision: z.ZodString;
            sourceSha256: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        }, {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        }>;
    }, "strict", z.ZodTypeAny, {
        decisionHash: string;
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
    }, {
        decisionHash: string;
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
    }>, "many">;
    status: z.ZodEnum<["active", "expired", "conflicted"]>;
    conflictsWith: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    status: "active" | "expired" | "conflicted";
    value: string;
    id: string;
    version: "wasd-npc-fact.v1";
    subjectId: string;
    predicate: "selected_goal" | "current_hub";
    validFromIndex: number;
    validUntilIndex: number;
    provenance: {
        decisionHash: string;
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
    }[];
    conflictsWith: string[];
}, {
    status: "active" | "expired" | "conflicted";
    value: string;
    id: string;
    version: "wasd-npc-fact.v1";
    subjectId: string;
    predicate: "selected_goal" | "current_hub";
    validFromIndex: number;
    validUntilIndex: number;
    provenance: {
        decisionHash: string;
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
    }[];
    conflictsWith: string[];
}>;
declare const stateSchema: z.ZodObject<{
    version: z.ZodLiteral<"wasd-npc-multi-memory.v4">;
    npcId: z.ZodString;
    authority: z.ZodObject<{
        rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
        sourceRevision: z.ZodString;
        sourceSha256: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    }, {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    }>;
    lastResolutionIndex: z.ZodNumber;
    lastReceiptId: z.ZodNullable<z.ZodString>;
    working: z.ZodObject<{
        goal: z.ZodNullable<z.ZodEnum<["seek_safety", "gather_resources", "socialize", "gain_reputation", "trade", "expand_influence"]>>;
        plan: z.ZodNullable<z.ZodObject<{
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
        }>>;
        reservations: z.ZodArray<z.ZodObject<{
            receiptId: z.ZodString;
            targetId: z.ZodString;
            expiresAtIndex: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            targetId: string;
            receiptId: string;
            expiresAtIndex: number;
        }, {
            targetId: string;
            receiptId: string;
            expiresAtIndex: number;
        }>, "many">;
        confirmedEventIds: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence" | null;
        plan: {
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
        } | null;
        reservations: {
            targetId: string;
            receiptId: string;
            expiresAtIndex: number;
        }[];
        confirmedEventIds: string[];
    }, {
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence" | null;
        plan: {
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
        } | null;
        reservations: {
            targetId: string;
            receiptId: string;
            expiresAtIndex: number;
        }[];
        confirmedEventIds: string[];
    }>;
    episodic: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        logicalIndex: z.ZodNumber;
        regionId: z.ZodString;
        participants: z.ZodArray<z.ZodString, "many">;
        outcome: z.ZodLiteral<"goal_selected">;
        goal: z.ZodEnum<["seek_safety", "gather_resources", "socialize", "gain_reputation", "trade", "expand_influence"]>;
        source: z.ZodObject<{
            receiptId: z.ZodString;
            receiptSha256: z.ZodString;
            decisionHash: z.ZodString;
            logicalIndex: z.ZodNumber;
            authority: z.ZodObject<{
                rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
                sourceRevision: z.ZodString;
                sourceSha256: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            }, {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            }>;
        }, "strict", z.ZodTypeAny, {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }, {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }>;
        expiresAtIndex: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        id: string;
        regionId: string;
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
        logicalIndex: number;
        participants: string[];
        outcome: "goal_selected";
        source: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        };
        expiresAtIndex: number;
    }, {
        id: string;
        regionId: string;
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
        logicalIndex: number;
        participants: string[];
        outcome: "goal_selected";
        source: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        };
        expiresAtIndex: number;
    }>, "many">;
    semantic: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        subjectId: z.ZodString;
        predicate: z.ZodEnum<["selected_goal", "current_hub"]>;
        value: z.ZodString;
        version: z.ZodLiteral<"wasd-npc-fact.v1">;
        validFromIndex: z.ZodNumber;
        validUntilIndex: z.ZodNumber;
        provenance: z.ZodArray<z.ZodObject<{
            receiptId: z.ZodString;
            receiptSha256: z.ZodString;
            decisionHash: z.ZodString;
            logicalIndex: z.ZodNumber;
            authority: z.ZodObject<{
                rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
                sourceRevision: z.ZodString;
                sourceSha256: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            }, {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            }>;
        }, "strict", z.ZodTypeAny, {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }, {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }>, "many">;
        status: z.ZodEnum<["active", "expired", "conflicted"]>;
        conflictsWith: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        status: "active" | "expired" | "conflicted";
        value: string;
        id: string;
        version: "wasd-npc-fact.v1";
        subjectId: string;
        predicate: "selected_goal" | "current_hub";
        validFromIndex: number;
        validUntilIndex: number;
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        conflictsWith: string[];
    }, {
        status: "active" | "expired" | "conflicted";
        value: string;
        id: string;
        version: "wasd-npc-fact.v1";
        subjectId: string;
        predicate: "selected_goal" | "current_hub";
        validFromIndex: number;
        validUntilIndex: number;
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        conflictsWith: string[];
    }>, "many">;
    procedural: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        competencyId: z.ZodEnum<["utility_goal_selection", "bounded_goal_planning"]>;
        mode: z.ZodLiteral<"configured">;
        rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
        authority: z.ZodObject<{
            rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
            sourceRevision: z.ZodString;
            sourceSha256: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        }, {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        }>;
        provenance: z.ZodArray<z.ZodObject<{
            receiptId: z.ZodString;
            receiptSha256: z.ZodString;
            decisionHash: z.ZodString;
            logicalIndex: z.ZodNumber;
            authority: z.ZodObject<{
                rulesetVersion: z.ZodLiteral<"wasd-aurion-npc-memory.v4">;
                sourceRevision: z.ZodString;
                sourceSha256: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            }, {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            }>;
        }, "strict", z.ZodTypeAny, {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }, {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        id: string;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        competencyId: "utility_goal_selection" | "bounded_goal_planning";
        mode: "configured";
    }, {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        id: string;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        competencyId: "utility_goal_selection" | "bounded_goal_planning";
        mode: "configured";
    }>, "many">;
    seenReceipts: z.ZodArray<z.ZodObject<{
        receiptId: z.ZodString;
        receiptSha256: z.ZodString;
        logicalIndex: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
    }, {
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
    }>, "many">;
    memoryHash: z.ZodString;
}, "strict", z.ZodTypeAny, {
    npcId: string;
    lastResolutionIndex: number;
    version: "wasd-npc-multi-memory.v4";
    seenReceipts: {
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
    }[];
    authority: {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    };
    lastReceiptId: string | null;
    working: {
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence" | null;
        plan: {
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
        } | null;
        reservations: {
            targetId: string;
            receiptId: string;
            expiresAtIndex: number;
        }[];
        confirmedEventIds: string[];
    };
    episodic: {
        id: string;
        regionId: string;
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
        logicalIndex: number;
        participants: string[];
        outcome: "goal_selected";
        source: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        };
        expiresAtIndex: number;
    }[];
    semantic: {
        status: "active" | "expired" | "conflicted";
        value: string;
        id: string;
        version: "wasd-npc-fact.v1";
        subjectId: string;
        predicate: "selected_goal" | "current_hub";
        validFromIndex: number;
        validUntilIndex: number;
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        conflictsWith: string[];
    }[];
    procedural: {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        id: string;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        competencyId: "utility_goal_selection" | "bounded_goal_planning";
        mode: "configured";
    }[];
    memoryHash: string;
}, {
    npcId: string;
    lastResolutionIndex: number;
    version: "wasd-npc-multi-memory.v4";
    seenReceipts: {
        receiptId: string;
        receiptSha256: string;
        logicalIndex: number;
    }[];
    authority: {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        sourceRevision: string;
        sourceSha256: string;
    };
    lastReceiptId: string | null;
    working: {
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence" | null;
        plan: {
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
        } | null;
        reservations: {
            targetId: string;
            receiptId: string;
            expiresAtIndex: number;
        }[];
        confirmedEventIds: string[];
    };
    episodic: {
        id: string;
        regionId: string;
        goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";
        logicalIndex: number;
        participants: string[];
        outcome: "goal_selected";
        source: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        };
        expiresAtIndex: number;
    }[];
    semantic: {
        status: "active" | "expired" | "conflicted";
        value: string;
        id: string;
        version: "wasd-npc-fact.v1";
        subjectId: string;
        predicate: "selected_goal" | "current_hub";
        validFromIndex: number;
        validUntilIndex: number;
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        conflictsWith: string[];
    }[];
    procedural: {
        rulesetVersion: "wasd-aurion-npc-memory.v4";
        id: string;
        authority: {
            rulesetVersion: "wasd-aurion-npc-memory.v4";
            sourceRevision: string;
            sourceSha256: string;
        };
        provenance: {
            decisionHash: string;
            receiptId: string;
            receiptSha256: string;
            logicalIndex: number;
            authority: {
                rulesetVersion: "wasd-aurion-npc-memory.v4";
                sourceRevision: string;
                sourceSha256: string;
            };
        }[];
        competencyId: "utility_goal_selection" | "bounded_goal_planning";
        mode: "configured";
    }[];
    memoryHash: string;
}>;
export type NpcMemoryV4 = Readonly<z.infer<typeof stateSchema>>;
export type NpcSemanticFact = Readonly<z.infer<typeof factSchema>>;
export type NpcMemoryProvenance = Readonly<z.infer<typeof provenanceSchema>>;
/** Strict rehydration; no defaults, clock reads, LLM text or implicit repair. */
export declare function parseNpcMemoryV4(value: unknown): NpcMemoryV4;
export declare function createNpcMemoryV4(npcId: string): NpcMemoryV4;
export type ConfirmedNpcDecision = Readonly<{
    receiptId: string;
    receiptSha256: string;
    snapshot: NpcLifeSnapshot;
    authority: ReturnType<typeof npcAuthority>;
}>;
/** Called on the actual persisted receipt readback, before a memory commit is permitted. */
export declare function verifyConfirmedNpcDecision(raw: string, expected: Parameters<typeof decodeNpcReceipt>[1] & {
    receiptId: string;
}): ConfirmedNpcDecision;
/** Decision episodes and typed facts only. A selected plan is not an executed action. */
export declare function commitNpcMemoryV4(currentValue: NpcMemoryV4, receipt: ConfirmedNpcDecision): Readonly<{
    status: "committed" | "duplicate" | "stale";
    memory: NpcMemoryV4;
}>;
export declare function replayNpcMemoryV4(npcId: string, receipts: readonly ConfirmedNpcDecision[]): NpcMemoryV4;
/** Exact bounded database lookup set, including provenance older than the recent delivery window. */
export declare function npcMemoryReceiptIds(value: NpcMemoryV4): readonly string[];
/** Recheck every retained assertion against actual source receipt readbacks, without relabelling historical authority. */
export declare function verifyNpcMemoryEvidence(value: NpcMemoryV4, receipts: readonly ConfirmedNpcDecision[]): NpcMemoryV4;
/** Bounded projection for AX1: no raw memories, source payloads or authoring capability. */
export declare function projectNpcMemoryV4(value: NpcMemoryV4): {
    version: "wasd-npc-memory-public.v4";
    npcId: string;
    resolutionIndex: number;
    goal: "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence" | null;
    planStatus: "planned" | "blocked" | null;
    memoryHash: string;
    sourceRevision: string;
    counts: {
        working: number;
        episodic: number;
        semantic: number;
        procedural: number;
    };
    conflictedFacts: number;
    expiredFacts: number;
};
export {};
