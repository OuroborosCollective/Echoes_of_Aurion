import { createHash } from "node:crypto";
import type { PublicNpcSemanticGraph } from "../../shared/npcSemanticGraphReadmodel";

export const AURION_INTERNAL_GRAPH_ANALYSIS_VERSION = "aurion.internal-graph-analysis.v1" as const;

export type InternalGraphAnalysis = Readonly<{
  schemaVersion: typeof AURION_INTERNAL_GRAPH_ANALYSIS_VERSION;
  graphHash: string;
  resultHash: string;
  nodeCount: number;
  edgeCount: number;
  relationKindCounts: Readonly<Record<string, number>>;
  degreeByNode: readonly Readonly<{ nodeId: string; degree: number }>[];
  connectedComponents: readonly (readonly string[])[];
  articulationNodeIds: readonly string[];
  averageFiniteDistance: number;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return current;
  });
}

function adjacency(graph: PublicNpcSemanticGraph): Map<string, Set<string>> {
  const ids = graph.nodes.map((node) => node.nodeId).sort(compare);
  const result = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const edge of graph.relations) {
    result.get(edge.fromNodeId)?.add(edge.toNodeId);
    result.get(edge.toNodeId)?.add(edge.fromNodeId);
  }
  return result;
}

function connectedComponents(adj: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>();
  const components: string[][] = [];

  for (const id of [...adj.keys()].sort(compare)) {
    if (seen.has(id)) continue;
    const queue = [id];
    const component: string[] = [];
    seen.add(id);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of [...(adj.get(current) ?? [])].sort(compare)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component.sort(compare));
  }

  return components.sort((a, b) => compare(a[0]!, b[0]!));
}

function articulationNodes(adj: Map<string, Set<string>>): string[] {
  let time = 0;
  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const result = new Set<string>();

  const visit = (u: string) => {
    discovery.set(u, ++time);
    low.set(u, discovery.get(u)!);
    let childCount = 0;

    for (const v of [...(adj.get(u) ?? [])].sort(compare)) {
      if (!discovery.has(v)) {
        parent.set(v, u);
        childCount++;
        visit(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));

        const p = parent.get(u) ?? null;
        if (p === null && childCount > 1) result.add(u);
        if (p !== null && low.get(v)! >= discovery.get(u)!) result.add(u);
      } else if ((parent.get(u) ?? null) !== v) {
        low.set(u, Math.min(low.get(u)!, discovery.get(v)!));
      }
    }
  };

  for (const id of [...adj.keys()].sort(compare)) {
    if (!discovery.has(id)) {
      parent.set(id, null);
      visit(id);
    }
  }

  return [...result].sort(compare);
}

function averageFiniteDistance(adj: Map<string, Set<string>>): number {
  let total = 0;
  let pairs = 0;

  for (const start of [...adj.keys()].sort(compare)) {
    const distances = new Map<string, number>([[start, 0]]);
    const queue = [start];

    while (queue.length) {
      const current = queue.shift()!;
      for (const neighbor of [...(adj.get(current) ?? [])].sort(compare)) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, distances.get(current)! + 1);
          queue.push(neighbor);
        }
      }
    }

    for (const [target, distance] of [...distances.entries()].sort(([a], [b]) => compare(a, b))) {
      if (target > start) {
        total += distance;
        pairs += 1;
      }
    }
  }

  return pairs ? Number((total / pairs).toFixed(9)) : 0;
}

/**
 * Read-only structural analysis over the already-verified public graph packet.
 * No source text, persistence row, gameplay state or source authority is copied.
 */
export function analyzeInternalSemanticGraph(graph: PublicNpcSemanticGraph): InternalGraphAnalysis {
  const relationKindCounts = Object.fromEntries(
    Object.entries(
      graph.relations.reduce<Record<string, number>>((counts, edge) => {
        counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([a], [b]) => compare(a, b)),
  );

  const adj = adjacency(graph);
  const degreeByNode = [...adj.entries()]
    .map(([nodeId, peers]) => ({ nodeId, degree: peers.size }))
    .sort((a, b) => b.degree - a.degree || compare(a.nodeId, b.nodeId));

  const components = connectedComponents(adj);
  const articulationNodeIds = articulationNodes(adj);
  const graphHash = sha256(canonical({
    graphHash: graph.graphHash,
    resultHash: graph.resultHash,
    nodes: graph.nodes.map((node) => [node.nodeId, node.kind, node.payloadHash]),
    relations: graph.relations.map((edge) => [edge.kind, edge.fromNodeId, edge.toNodeId]),
  }));
  const draft = {
    schemaVersion: AURION_INTERNAL_GRAPH_ANALYSIS_VERSION,
    graphHash,
    nodeCount: graph.nodes.length,
    edgeCount: graph.relations.length,
    relationKindCounts,
    degreeByNode,
    connectedComponents: components,
    articulationNodeIds,
    averageFiniteDistance: averageFiniteDistance(adj),
  };
  return Object.freeze({
    ...draft,
    resultHash: sha256(canonical(draft)),
  });
}

/**
 * Internal analysis format only. It intentionally contains opaque node IDs and
 * relation kinds, never source text or mutable gameplay state.
 */
export function toWolframLanguageGraph(analysis: InternalGraphAnalysis, graph: PublicNpcSemanticGraph): string {
  const safeNodes = new Set(graph.nodes.map((node) => node.nodeId));
  const edges = graph.relations
    .filter((edge) => safeNodes.has(edge.fromNodeId) && safeNodes.has(edge.toNodeId))
    .sort((a, b) => compare(a.fromNodeId, b.fromNodeId) || compare(a.toNodeId, b.toNodeId) || compare(a.kind, b.kind))
    .map((edge) => "DirectedEdge[\"" + edge.fromNodeId + "\", \"" + edge.toNodeId + "\"]");

  return [
    "(* " + AURION_INTERNAL_GRAPH_ANALYSIS_VERSION + " *)",
    "Graph[{" + edges.join(", ") + "}, VertexLabels -> \"Name\"]",
    "(* nodeCount=" + analysis.nodeCount + "; edgeCount=" + analysis.edgeCount + "; resultHash=" + analysis.resultHash + " *)",
  ].join("\n");
}
