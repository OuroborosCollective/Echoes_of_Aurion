import { describe, expect, it } from "vitest";
import type { PublicNpcSemanticGraph } from "../../shared/npcSemanticGraphReadmodel";
import {
  buildInternalGraphStructuralSnapshot,
  compareInternalSemanticGraphGenerations,
} from "./internalGraphHealth";

const node = (nodeId: string, kind: PublicNpcSemanticGraph["nodes"][number]["kind"]) => ({
  nodeId,
  kind,
  semanticKey: null,
  status: "active" as const,
  depth: 0,
  score: 100,
  payloadHash: "1".repeat(64),
});

const baseGraph = {
  npcId: "npc_health",
  generation: 10,
  graphHash: "a".repeat(64),
  sourceResultHash: "b".repeat(64),
  resultHash: "c".repeat(64),
  sourceRevision: "d".repeat(40),
  provenanceStatus: "VERIFIED" as const,
  bounds: { maxDepth: 4, maxCandidates: 64, maxResults: 32 },
  nodes: [
    node("smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "actor"),
    node("smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "goal"),
    node("smn_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "location"),
    node("smn_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "item_resource"),
  ],
  relations: [
    {
      kind: "selected_goal" as const,
      fromNodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      toNodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      status: "active" as const,
    },
    {
      kind: "located_in" as const,
      fromNodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      toNodeId: "smn_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: "active" as const,
    },
  ],
  excluded: { expired: 0, contradicted: 0, superseded: 0 },
} satisfies PublicNpcSemanticGraph;

describe("internal WorldContext structural health", () => {
  it("reports deterministic, factual graph structure without a composite health score", () => {
    const snapshot = buildInternalGraphStructuralSnapshot(baseGraph);
    expect(snapshot.schemaVersion).toBe("aurion.internal-graph-health.v1");
    expect(snapshot.nodeCount).toBe(4);
    expect(snapshot.relationCount).toBe(2);
    expect(snapshot.uniqueUndirectedEdgeCount).toBe(2);
    expect(snapshot.componentCount).toBe(2);
    expect(snapshot.isolatedNodeIds).toEqual([
      "smn_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    ]);
    expect(snapshot.leafNodeCount).toBe(2);
    expect(snapshot.maxDegree).toBe(2);
    expect(snapshot.averageDegree).toBe(1);
    expect(snapshot.density).toBe(0.333333333);
  });

  it("detects deterministic structural change between generations", () => {
    const current = {
      ...baseGraph,
      generation: 11,
      graphHash: "e".repeat(64),
      nodes: [
        ...baseGraph.nodes,
        node("smn_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "action"),
      ],
      relations: [
        ...baseGraph.relations,
        {
          kind: "supports" as const,
          fromNodeId: "smn_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          toNodeId: "smn_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          status: "active" as const,
        },
      ],
    } satisfies PublicNpcSemanticGraph;

    const comparison = compareInternalSemanticGraphGenerations(baseGraph, current);
    expect(comparison.schemaVersion).toBe("aurion.internal-graph-health.v1");
    expect(comparison.addedNodeCount).toBe(1);
    expect(comparison.removedNodeCount).toBe(0);
    expect(comparison.addedRelationCount).toBe(1);
    expect(comparison.removedRelationCount).toBe(0);
    expect(comparison.nodeChurnRatio).toBe(0.2);
    expect(comparison.edgeChurnRatio).toBe(0.333333333);
    expect(comparison.componentCountDelta).toBe(-1);
    expect(comparison.changeSignals).toEqual([
      "ARTICULATION_COUNT_CHANGED",
      "AVERAGE_DISTANCE_CHANGED",
      "EDGE_CHURN_THRESHOLD_REACHED",
      "NODE_CHURN_THRESHOLD_REACHED",
      "NODE_SET_CHANGED",
      "RELATION_SET_CHANGED",
    ]);
    expect(comparison.comparisonHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("flags graph-structure integrity events without mutating the graph", () => {
    const graph = {
      ...baseGraph,
      relations: [
        ...baseGraph.relations,
        {
          kind: "related_to" as const,
          fromNodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          toNodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          status: "active" as const,
        },
        {
          kind: "supports" as const,
          fromNodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          toNodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          status: "active" as const,
        },
      ],
    } satisfies PublicNpcSemanticGraph;
    const snapshot = buildInternalGraphStructuralSnapshot(graph);
    expect(snapshot.selfLoopCount).toBe(1);
    expect(snapshot.duplicateUndirectedPairCount).toBe(1);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.relations).toHaveLength(4);
  });
});
