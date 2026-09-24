import { describe, expect, it } from "vitest";
import {
  analyzeInternalSemanticGraph,
  toWolframLanguageGraph,
} from "./internalGraphAnalysis";
import type { PublicNpcSemanticGraph } from "../../shared/npcSemanticGraphReadmodel";

const graph = {
  npcId: "npc_test",
  generation: 7,
  graphHash: "1".repeat(64),
  sourceResultHash: "2".repeat(64),
  resultHash: "3".repeat(64),
  sourceRevision: "4".repeat(40),
  provenanceStatus: "VERIFIED",
  bounds: { maxDepth: 4, maxCandidates: 64, maxResults: 32 },
  nodes: [
    { nodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", kind: "actor", semanticKey: "npc_test", status: "active", depth: 0, score: 200, payloadHash: "5".repeat(64) },
    { nodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", kind: "goal", semanticKey: "goal_test", status: "active", depth: 1, score: 100, payloadHash: "6".repeat(64) },
    { nodeId: "smn_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", kind: "location", semanticKey: "location_test", status: "active", depth: 1, score: 90, payloadHash: "7".repeat(64) },
    { nodeId: "smn_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", kind: "item_resource", semanticKey: "item_test", status: "active", depth: 2, score: 80, payloadHash: "8".repeat(64) },
  ],
  relations: [
    { kind: "selected_goal", fromNodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", toNodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", status: "active" },
    { kind: "located_in", fromNodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", toNodeId: "smn_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", status: "active" },
    { kind: "supports", fromNodeId: "smn_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", toNodeId: "smn_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", status: "active" },
  ],
} satisfies PublicNpcSemanticGraph;

describe("internal WorldContext graph analysis", () => {
  it("produces deterministic structural diagnostics", () => {
    const a = analyzeInternalSemanticGraph(graph);
    const b = analyzeInternalSemanticGraph({ ...graph, nodes: [...graph.nodes].reverse(), relations: [...graph.relations].reverse() });
    expect(a).toEqual(b);
    expect(a.nodeCount).toBe(4);
    expect(a.edgeCount).toBe(3);
    expect(a.connectedComponents).toHaveLength(1);
    expect(a.articulationNodeIds).toEqual([
      "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "smn_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    ]);
    expect(a.degreeByNode[0]).toEqual({ nodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", degree: 2 });
    expect(a.averageFiniteDistance).toBe(1.666666667);
  });

  it("emits only opaque graph structure for Wolfram analysis", () => {
    const analysis = analyzeInternalSemanticGraph(graph);
    const wl = toWolframLanguageGraph(analysis, graph);
    expect(wl).toContain("aurion.internal-graph-analysis.v1");
    expect(wl).toContain("DirectedEdge");
    expect(wl).not.toContain("npc_test");
    expect(wl).not.toContain("goal_test");
    expect(wl).not.toContain("item_test");
  });
});
