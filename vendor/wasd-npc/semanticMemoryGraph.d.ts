import { npcAuthority } from "./authority.js";
import { type ConfirmedNpcDecision, type NpcMemoryV4 } from "./multiMemory.js";
import { type MerchantActionReceipt } from "./actionGateway.js";
export declare const NPC_SEMANTIC_GRAPH_VERSION: "wasd-npc-semantic-graph.v2";
export declare const NPC_SEMANTIC_RETRIEVAL_VERSION: "wasd-npc-semantic-retrieval.v1";
export declare const NPC_SEMANTIC_GRAPH_LIMITS: Readonly<{
    nodes: 160;
    edges: 384;
    provenanceRefs: 160;
    performedActions: 16;
    traversalDepth: 4;
    candidates: 64;
    results: 32;
    startKeys: 16;
    filterValues: 16;
    bytes: 524288;
}>;
export type NpcSemanticNodeKind = "actor" | "location" | "world_event" | "goal" | "action" | "outcome" | "polity" | "item_resource" | "semantic_fact" | "procedural_competency";
export type NpcSemanticEdgeKind = "observed_at" | "participated_in" | "selected_goal" | "performed_action" | "affected" | "related_to" | "member_of" | "located_in" | "supports" | "contradicts" | "supersedes" | "derived_from";
export type NpcSemanticValidity = "active" | "expired" | "contradicted" | "superseded";
export type NpcSemanticProvenanceKind = "decision_receipt" | "action_receipt" | "effect_readback" | "memory_link";
export type NpcSemanticProvenanceRef = Readonly<{
    kind: NpcSemanticProvenanceKind;
    id: string;
    hash: string;
    logicalIndex: number;
    sourceRevision: string;
    sourceSha256: string;
}>;
export type NpcSemanticGraphNode = Readonly<{
    version: typeof NPC_SEMANTIC_GRAPH_VERSION;
    id: string;
    kind: NpcSemanticNodeKind;
    key: string;
    status: NpcSemanticValidity;
    validFromIndex: number;
    validUntilIndex: number | null;
    provenance: readonly NpcSemanticProvenanceRef[];
    payloadHash: string;
}>;
export type NpcSemanticGraphEdge = Readonly<{
    version: typeof NPC_SEMANTIC_GRAPH_VERSION;
    id: string;
    kind: NpcSemanticEdgeKind;
    relationKey: string;
    fromNodeId: string;
    toNodeId: string;
    status: NpcSemanticValidity;
    validFromIndex: number;
    validUntilIndex: number | null;
    provenance: readonly NpcSemanticProvenanceRef[];
    payloadHash: string;
}>;
export type NpcSemanticMemoryGraph = Readonly<{
    version: typeof NPC_SEMANTIC_GRAPH_VERSION;
    retrievalVersion: typeof NPC_SEMANTIC_RETRIEVAL_VERSION;
    npcId: string;
    generation: number;
    authority: ReturnType<typeof npcAuthority>;
    memoryHash: string;
    previousGraphHash: string | null;
    nodes: readonly NpcSemanticGraphNode[];
    edges: readonly NpcSemanticGraphEdge[];
    graphHash: string;
}>;
export type NpcActionEffectReadbackEvidence = Readonly<{
    id: string;
    actionReceiptId: string;
    effectsHash: string;
    npcReceiptId: string;
    npcDecisionHash: string;
    worldReceiptId: string;
    worldReactionHash: string;
    polityId: string;
    polityStateHash: string;
    marketStateHash: string;
    inventoryStateHash: string;
    sourceRevision: string;
    readbackHash: string;
}>;
export type NpcActionMemoryLinkEvidence = Readonly<{
    id: string;
    actionReceiptId: string;
    effectReadbackId: string;
    memoryReceiptId: string;
    npcId: string;
    resolutionIndex: number;
    linkHash: string;
}>;
export type VerifiedPerformedActionEvidence = Readonly<{
    sourceDecision: ConfirmedNpcDecision;
    successorDecision: ConfirmedNpcDecision;
    actionReceipt: MerchantActionReceipt;
    effectReadback: NpcActionEffectReadbackEvidence;
    memoryLink: NpcActionMemoryLinkEvidence;
}>;
export type NpcSemanticGraphQuery = Readonly<{
    logicalIndex: number;
    startKeys?: readonly string[];
    nodeKinds?: readonly NpcSemanticNodeKind[];
    edgeKinds?: readonly NpcSemanticEdgeKind[];
    maxDepth?: number;
    maxCandidates?: number;
    maxResults?: number;
}>;
export type NpcSemanticGraphQueryResult = Readonly<{
    version: typeof NPC_SEMANTIC_RETRIEVAL_VERSION;
    graphHash: string;
    query: Readonly<{
        logicalIndex: number;
        startKeys: readonly string[];
        nodeKinds: readonly NpcSemanticNodeKind[];
        edgeKinds: readonly NpcSemanticEdgeKind[];
        maxDepth: number;
        maxCandidates: number;
        maxResults: number;
    }>;
    results: readonly Readonly<{
        nodeId: string;
        kind: NpcSemanticNodeKind;
        key: string;
        status: "active";
        depth: number;
        score: number;
        payloadHash: string;
    }>[];
    resultHash: string;
}>;
export declare function verifyPerformedActionEvidence(input: Readonly<{
    sourceDecision: ConfirmedNpcDecision;
    successorDecision: ConfirmedNpcDecision;
    actionReceipt: MerchantActionReceipt;
    effectReadback: NpcActionEffectReadbackEvidence;
    memoryLink: NpcActionMemoryLinkEvidence;
}>): VerifiedPerformedActionEvidence;
export declare function isVerifiedPerformedActionEvidence(value: unknown): value is VerifiedPerformedActionEvidence;
export type NpcSemanticGraphBuildInput = Readonly<{
    memory: NpcMemoryV4;
    memoryReceipts: readonly ConfirmedNpcDecision[];
    performedActions?: readonly VerifiedPerformedActionEvidence[];
    previousGraph?: NpcSemanticMemoryGraph | null;
}>;
export declare function compileNpcSemanticMemoryGraph(input: NpcSemanticGraphBuildInput): NpcSemanticMemoryGraph;
export declare function parseNpcSemanticMemoryGraph(value: unknown): NpcSemanticMemoryGraph;
export declare function verifyNpcSemanticMemoryGraph(value: unknown, evidence: NpcSemanticGraphBuildInput): NpcSemanticMemoryGraph;
export declare function isVerifiedNpcSemanticMemoryGraph(value: unknown): value is NpcSemanticMemoryGraph;
export declare function retrieveNpcSemanticMemoryGraph(graphValue: NpcSemanticMemoryGraph, queryValue: NpcSemanticGraphQuery): NpcSemanticGraphQueryResult;
