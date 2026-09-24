import { createHash } from "node:crypto";
import type { PublicNpcSemanticGraph } from "../../shared/npcSemanticGraphReadmodel";
import {
  analyzeInternalSemanticGraph,
  type InternalGraphAnalysis,
} from "./internalGraphAnalysis";

export const AURION_INTERNAL_GRAPH_HEALTH_VERSION = "aurion.internal-graph-health.v1" as const;

export const INTERNAL_GRAPH_CHANGE_THRESHOLDS = Object.freeze({
  nodeChurnRatio: 0.20,
  edgeChurnRatio: 0.25,
  densityDelta: 0.15,
});

export type InternalGraphStructuralSnapshot = Readonly<{
  schemaVersion: typeof AURION_INTERNAL_GRAPH_HEALTH_VERSION;
  graphHash: string;
  analysisHash: string;
  nodeCount: number;
  relationCount: number;
  uniqueUndirectedEdgeCount: number;
  componentCount: number;
  isolatedNodeIds: readonly string[];
  leafNodeCount: number;
  maxDegree: number;
  averageDegree: number;
  density: number;
  selfLoopCount: number;
  duplicateUndirectedPairCount: number;
  articulationNodeCount: number;
  averageFiniteDistance: number;
}>;

export type InternalGraphGenerationComparison = Readonly<{
  schemaVersion: typeof AURION_INTERNAL_GRAPH_HEALTH_VERSION;
  previousGraphHash: string;
  currentGraphHash: string;
  addedNodeCount: number;
  removedNodeCount: number;
  addedRelationCount: number;
  removedRelationCount: number;
  nodeChurnRatio: number;
  edgeChurnRatio: number;
  densityDelta: number;
  componentCountDelta: number;
  isolatedNodeDelta: number;
  articulationNodeDelta: number;
  averageFiniteDistanceDelta: number;
  changeSignals: readonly string[];
  comparisonHash: string;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compare).map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function clampMetric(value: number): number {
  return Number(value.toFixed(9));
}

function relationKey(
  relation: PublicNpcSemanticGraph["relations"][number],
): string {
  return stable([relation.kind, relation.fromNodeId, relation.toNodeId]);
}

function undirectedPairKey(fromNodeId: string, toNodeId: string): string {
  return fromNodeId < toNodeId
    ? `${fromNodeId}\0${toNodeId}`
    : `${toNodeId}\0${fromNodeId}`;
}

function metricFromAnalysis(
  graph: PublicNpcSemanticGraph,
  analysis: InternalGraphAnalysis,
): InternalGraphStructuralSnapshot {
  const degreeByNode = new Map(analysis.degreeByNode.map(item => [item.nodeId, item.degree] as const));
  const isolatedNodeIds = [...degreeByNode.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort(compare);
  const leafNodeCount = [...degreeByNode.values()].filter(degree => degree === 1).length;
  const maxDegree = Math.max(0, ...degreeByNode.values());
  const uniquePairs = new Set<string>();
  let selfLoopCount = 0;

  for (const relation of graph.relations) {
    if (relation.fromNodeId === relation.toNodeId) {
      selfLoopCount += 1;
      continue;
    }
    uniquePairs.add(undirectedPairKey(relation.fromNodeId, relation.toNodeId));
  }

  const duplicateUndirectedPairCount = Math.max(
    0,
    graph.relations.length - selfLoopCount - uniquePairs.size,
  );
  const nodeCount = analysis.nodeCount;
  const possiblePairs = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 0;

  const draft = {
    schemaVersion: AURION_INTERNAL_GRAPH_HEALTH_VERSION,
    graphHash: graph.graphHash,
    analysisHash: analysis.resultHash,
    nodeCount,
    relationCount: graph.relations.length,
    uniqueUndirectedEdgeCount: uniquePairs.size,
    componentCount: analysis.connectedComponents.length,
    isolatedNodeIds: Object.freeze(isolatedNodeIds),
    leafNodeCount,
    maxDegree,
    averageDegree: nodeCount ? clampMetric((2 * uniquePairs.size) / nodeCount) : 0,
    density: possiblePairs ? clampMetric(uniquePairs.size / possiblePairs) : 0,
    selfLoopCount,
    duplicateUndirectedPairCount,
    articulationNodeCount: analysis.articulationNodeIds.length,
    averageFiniteDistance: analysis.averageFiniteDistance,
  };

  return Object.freeze(draft);
}

export function buildInternalGraphStructuralSnapshot(
  graph: PublicNpcSemanticGraph,
): InternalGraphStructuralSnapshot {
  return metricFromAnalysis(graph, analyzeInternalSemanticGraph(graph));
}

function setDelta<T>(previous: readonly T[], current: readonly T[]): {
  added: readonly T[];
  removed: readonly T[];
} {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return {
    added: Object.freeze(current.filter(value => !previousSet.has(value))),
    removed: Object.freeze(previous.filter(value => !currentSet.has(value))),
  };
}

export function compareInternalSemanticGraphGenerations(
  previous: PublicNpcSemanticGraph,
  current: PublicNpcSemanticGraph,
): InternalGraphGenerationComparison {
  const previousAnalysis = buildInternalGraphStructuralSnapshot(previous);
  const currentAnalysis = buildInternalGraphStructuralSnapshot(current);
  const previousNodes = previous.nodes.map(node => node.nodeId).sort(compare);
  const currentNodes = current.nodes.map(node => node.nodeId).sort(compare);
  const previousRelations = previous.relations.map(relationKey).sort(compare);
  const currentRelations = current.relations.map(relationKey).sort(compare);
  const nodes = setDelta(previousNodes, currentNodes);
  const relations = setDelta(previousRelations, currentRelations);

  const nodeUnionCount = new Set([...previousNodes, ...currentNodes]).size;
  const relationUnionCount = new Set([...previousRelations, ...currentRelations]).size;
  const nodeChurnRatio = clampMetric(
    (nodes.added.length + nodes.removed.length) / Math.max(1, nodeUnionCount),
  );
  const edgeChurnRatio = clampMetric(
    (relations.added.length + relations.removed.length) / Math.max(1, relationUnionCount),
  );
  const densityDelta = clampMetric(currentAnalysis.density - previousAnalysis.density);
  const componentCountDelta = currentAnalysis.componentCount - previousAnalysis.componentCount;
  const isolatedNodeDelta = currentAnalysis.isolatedNodeIds.length - previousAnalysis.isolatedNodeIds.length;
  const articulationNodeDelta = currentAnalysis.articulationNodeCount - previousAnalysis.articulationNodeCount;
  const averageFiniteDistanceDelta = clampMetric(
    currentAnalysis.averageFiniteDistance - previousAnalysis.averageFiniteDistance,
  );

  const signals = new Set<string>();
  if (nodes.added.length || nodes.removed.length) signals.add("NODE_SET_CHANGED");
  if (relations.added.length || relations.removed.length) signals.add("RELATION_SET_CHANGED");
  if (componentCountDelta > 0) signals.add("COMPONENT_COUNT_INCREASED");
  if (isolatedNodeDelta > 0) signals.add("ISOLATED_NODE_COUNT_INCREASED");
  if (nodeChurnRatio >= INTERNAL_GRAPH_CHANGE_THRESHOLDS.nodeChurnRatio) {
    signals.add("NODE_CHURN_THRESHOLD_REACHED");
  }
  if (edgeChurnRatio >= INTERNAL_GRAPH_CHANGE_THRESHOLDS.edgeChurnRatio) {
    signals.add("EDGE_CHURN_THRESHOLD_REACHED");
  }
  if (Math.abs(densityDelta) >= INTERNAL_GRAPH_CHANGE_THRESHOLDS.densityDelta) {
    signals.add("DENSITY_DELTA_THRESHOLD_REACHED");
  }
  if (articulationNodeDelta !== 0) signals.add("ARTICULATION_COUNT_CHANGED");
  if (averageFiniteDistanceDelta !== 0) signals.add("AVERAGE_DISTANCE_CHANGED");
  if (currentAnalysis.selfLoopCount > 0) signals.add("SELF_LOOP_PRESENT");
  if (currentAnalysis.duplicateUndirectedPairCount > 0) signals.add("DUPLICATE_UNDIRECTED_PAIR_PRESENT");

  const changeSignals = Object.freeze([...signals].sort(compare));
  const draft = {
    schemaVersion: AURION_INTERNAL_GRAPH_HEALTH_VERSION,
    previousGraphHash: previous.graphHash,
    currentGraphHash: current.graphHash,
    addedNodeCount: nodes.added.length,
    removedNodeCount: nodes.removed.length,
    addedRelationCount: relations.added.length,
    removedRelationCount: relations.removed.length,
    nodeChurnRatio,
    edgeChurnRatio,
    densityDelta,
    componentCountDelta,
    isolatedNodeDelta,
    articulationNodeDelta,
    averageFiniteDistanceDelta,
    changeSignals,
  };

  return Object.freeze({
    ...draft,
    comparisonHash: sha256(stable(draft)),
  });
}
