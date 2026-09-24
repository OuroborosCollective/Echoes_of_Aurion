import { describe, expect, it } from "vitest";
import type { PublicNpcSemanticGraph } from "../../shared/npcSemanticGraphReadmodel";
import type { WolframCagClient, WolframCagEvidence } from "../wolframCag";
import { runInternalWolframStructuralProbe } from "./internalGraphWolfram";

const graph = {
  npcId: "npc_wolfram",
  generation: 3,
  graphHash: "a".repeat(64),
  sourceResultHash: "b".repeat(64),
  resultHash: "c".repeat(64),
  sourceRevision: "d".repeat(40),
  provenanceStatus: "VERIFIED" as const,
  bounds: { maxDepth: 4, maxCandidates: 64, maxResults: 32 },
  nodes: [
    {
      nodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "actor" as const,
      semanticKey: "npc_secret_semantic_key",
      status: "active" as const,
      depth: 0,
      score: 100,
      payloadHash: "e".repeat(64),
    },
    {
      nodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      kind: "goal" as const,
      semanticKey: "goal_secret_semantic_key",
      status: "active" as const,
      depth: 1,
      score: 90,
      payloadHash: "f".repeat(64),
    },
  ],
  relations: [
    {
      kind: "selected_goal" as const,
      fromNodeId: "smn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      toNodeId: "smn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      status: "active" as const,
    },
  ],
  excluded: { expired: 0, contradicted: 0, superseded: 0 },
} satisfies PublicNpcSemanticGraph;

describe("internal Wolfram graph probe", () => {
  it("sends only graph topology and records provider evidence", async () => {
    const codes: string[] = [];
    const evidence: WolframCagEvidence = {
      protocol: "aurion.wolfram-cag.v1",
      provider: "wolfram-cag",
      component: "language_compute",
      endpoint: "/api/cag/v1/WolframLanguageCompute",
      requestSha256: "1".repeat(64),
      responseSha256: "2".repeat(64),
      providerUuid: null,
      providerCode: 200,
      success: true,
      result: '<|"VertexCount" -> 2, "EdgeCount" -> 1, "ConnectedComponents" -> 1|>',
      resultChars: 73,
    };
    const client = {
      languageCompute: async (input: { code: string }) => {
        codes.push(input.code);
        return evidence;
      },
    } as WolframCagClient;

    const result = await runInternalWolframStructuralProbe(graph, client);
    expect(result.protocol).toBe("aurion.internal-wolfram-graph.v1");
    expect(result.mutationAuthority).toBe("none");
    expect(result.sourceBoundary).toBe("opaque_graph_topology_only");
    expect(codes).toHaveLength(1);
    expect(codes[0]).toContain("VertexCount");
    expect(codes[0]).toContain("DirectedEdge");
    expect(codes[0]).not.toContain("npc_secret_semantic_key");
    expect(codes[0]).not.toContain("goal_secret_semantic_key");
    expect(codes[0]).not.toContain("sourceRevision");
  });
});
