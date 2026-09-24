import { createHash } from "node:crypto";
import type { PublicNpcSemanticGraph } from "../../shared/npcSemanticGraphReadmodel";
import {
  requireWolframCagClient,
  type WolframCagClient,
  type WolframCagEvidence,
} from "../wolframCag";
import {
  analyzeInternalSemanticGraph,
  toWolframLanguageGraph,
  type InternalGraphAnalysis,
} from "./internalGraphAnalysis";
import { buildInternalGraphStructuralSnapshot } from "./internalGraphHealth";

export const AURION_INTERNAL_WOLFRAM_GRAPH_VERSION = "aurion.internal-wolfram-graph.v1" as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function graphProbeCode(graph: PublicNpcSemanticGraph, analysis: InternalGraphAnalysis): string {
  const topology = toWolframLanguageGraph(analysis, graph)
    .replace(/\(\* nodeCount=.*? \*\)/, "")
    .trim();

  return [
    "Module[{g = " + topology + "},",
    " <|",
    '  "VertexCount" -> VertexCount[g],',
    '  "EdgeCount" -> EdgeCount[g],',
    '  "ConnectedComponents" -> Length[ConnectedComponents[g]],',
    '  "DegreeSequence" -> Reverse@Sort[VertexDegree[g]],',
    '  "AverageFiniteDistance" -> N[Mean@DeleteCases[Flatten[GraphDistanceMatrix[g]], Infinity]],',
    '  "GraphHash" -> "' + analysis.graphHash + '"',
    " |>]",
  ].join("\n");
}

export type InternalWolframGraphProbe = Readonly<{
  protocol: typeof AURION_INTERNAL_WOLFRAM_GRAPH_VERSION;
  graphHash: string;
  analysisHash: string;
  structuralHealthHash: string;
  evidence: WolframCagEvidence;
  mutationAuthority: "none";
  sourceBoundary: "opaque_graph_topology_only";
}>;

export async function runInternalWolframStructuralProbe(
  graph: PublicNpcSemanticGraph,
  client: WolframCagClient = requireWolframCagClient(),
): Promise<InternalWolframGraphProbe> {
  const analysis = analyzeInternalSemanticGraph(graph);
  const structuralHealth = buildInternalGraphStructuralSnapshot(graph);
  const code = graphProbeCode(graph, analysis);
  const evidence = await client.languageCompute({
    code,
    timeConstraint: 20,
    maxChars: 5_000,
  });

  if (!evidence.result.trim()) throw new Error("AURION_INTERNAL_WOLFRAM_EMPTY_RESULT");

  return Object.freeze({
    protocol: AURION_INTERNAL_WOLFRAM_GRAPH_VERSION,
    graphHash: graph.graphHash,
    analysisHash: analysis.resultHash,
    structuralHealthHash: sha256(JSON.stringify(structuralHealth)),
    evidence,
    mutationAuthority: "none",
    sourceBoundary: "opaque_graph_topology_only",
  });
}
