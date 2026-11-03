import { z } from "zod";
import { canonicalJson, canonicalSha256 } from "./aurionCanonicalHash";

/** A descriptive index. Evaluating this graph never grants knowledge or effects. */
export const DISCOVERY_GRAPH_VERSION = "aurion.discovery-graph.v1" as const;
export const DISCOVERY_GRAPH_LIMITS = Object.freeze({ nodes: 512, edges: 1024, fanout: 32, depth: 16, evaluationUnits: 8192 });
export const discoveryRelations = ["OBSERVABLE_IN", "GROWS_UNDER", "HARVESTED_FROM", "USED_IN", "ENABLES_RECIPE", "AFFECTS", "COUNTERACTS"] as const;
export const discoveryKinds = ["material", "recipe", "resource_node", "region", "weather", "effect", "skill", "species", "profession"] as const;
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nodeSchema = z.strictObject({
  id: identifier, kind: z.enum(discoveryKinds), canonicalId: identifier,
  catalogVersion: identifier, definitionHash: hash,
});
const conditionSchema = z.strictObject({
  nodeId: identifier, predicate: z.enum(["consumed", "present", "observed", "level_at_least"]),
  quantityExact: z.string().regex(/^[1-9][0-9]{0,6}$/).refine(v => BigInt(v) <= 1_000_000n),
  unit: z.enum(["item", "node", "observation", "level"]),
}).superRefine((value, ctx) => {
  if ((value.predicate === "consumed" && value.unit !== "item") || (value.predicate === "observed" && value.unit !== "observation")
      || (value.predicate === "level_at_least" && value.unit !== "level")
      || (value.predicate === "present" && !["item", "node"].includes(value.unit)))
    ctx.addIssue({ code: "custom", message: "DISCOVERY_PRECONDITION_UNIT_INVALID" });
});
const edgeSchema = z.strictObject({
  id: identifier, from: identifier, to: identifier, relation: z.enum(discoveryRelations),
  ruleId: identifier, ruleVersion: identifier, ruleHash: hash,
  preconditions: z.array(conditionSchema).max(16),
});
const definitionsSchema = z.strictObject({ nodes: z.array(nodeSchema).max(DISCOVERY_GRAPH_LIMITS.nodes), edges: z.array(edgeSchema).max(DISCOVERY_GRAPH_LIMITS.edges) });
export type DiscoveryNode = z.infer<typeof nodeSchema>;
export type DiscoveryEdge = z.infer<typeof edgeSchema>;
export type DiscoveryDefinitions = z.infer<typeof definitionsSchema>;
export type DiscoveryGraph = ReturnType<typeof buildDiscoveryGraph>;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function discoveryNodeId(kind: DiscoveryNode["kind"], canonicalId: string): string {
  return `${kind}:${canonicalId}`;
}
function orderedConditions(conditions: DiscoveryEdge["preconditions"]) {
  return conditions.slice().sort((a, b) => compare(canonicalJson(a), canonicalJson(b)));
}
export function discoveryEdgeId(edge: Omit<DiscoveryEdge, "id">): string {
  // Ignore an existing id when regenerating a modified edge.
  return "relation:" + canonicalSha256({ from: edge.from, to: edge.to, relation: edge.relation,
    ruleId: edge.ruleId, ruleVersion: edge.ruleVersion, ruleHash: edge.ruleHash,
    preconditions: orderedConditions(edge.preconditions) }).slice(7);
}
function normalize(input: unknown): DiscoveryDefinitions {
  // Zod array limits still validate members; reject excessive work before parsing.
  if (!input || typeof input !== "object" || !Array.isArray((input as DiscoveryDefinitions).nodes)
    || !Array.isArray((input as DiscoveryDefinitions).edges)) throw new Error("DISCOVERY_DEFINITIONS_INVALID");
  const bounded = input as DiscoveryDefinitions;
  if (bounded.nodes.length > DISCOVERY_GRAPH_LIMITS.nodes || bounded.edges.length > DISCOVERY_GRAPH_LIMITS.edges)
    throw new Error("DISCOVERY_SIZE_EXCEEDED");
  for (const edge of bounded.edges) if (edge && Array.isArray(edge.preconditions) && edge.preconditions.length > 16)
    throw new Error("DISCOVERY_PRECONDITION_LIMIT");
  const value = definitionsSchema.parse(input);
  value.nodes.sort((a, b) => compare(a.id, b.id));
  value.edges.forEach(edge => { edge.preconditions = orderedConditions(edge.preconditions); });
  value.edges.sort((a, b) => compare(a.id, b.id));
  const nodeIds = new Set(value.nodes.map(n => n.id));
  if (nodeIds.size !== value.nodes.length || new Set(value.edges.map(e => e.id)).size !== value.edges.length) throw new Error("DISCOVERY_ID_DUPLICATE");
  for (const node of value.nodes) if (node.id !== discoveryNodeId(node.kind, node.canonicalId)) throw new Error("DISCOVERY_NODE_ID_INVALID");
  const byId = new Map(value.nodes.map(node => [node.id, node]));
  const rules = new Set<string>();
  for (const edge of value.edges) {
    if (edge.id !== discoveryEdgeId(edge)) throw new Error("DISCOVERY_EDGE_ID_INVALID");
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.preconditions.some(c => !nodeIds.has(c.nodeId))) throw new Error("DISCOVERY_REFERENCE_UNKNOWN");
    const source = byId.get(edge.from)!, target = byId.get(edge.to)!;
    if ((edge.relation === "USED_IN" && (source.kind !== "material" || target.kind !== "recipe"))
      || (edge.relation === "HARVESTED_FROM" && (source.kind !== "material" || !["resource_node", "species"].includes(target.kind)))
      || (edge.relation === "ENABLES_RECIPE" && target.kind !== "recipe")
      || (edge.relation === "OBSERVABLE_IN" && target.kind !== "region")
      || (edge.relation === "GROWS_UNDER" && !["species", "resource_node"].includes(source.kind))) throw new Error("DISCOVERY_RELATION_TYPE_INVALID");
    for (const condition of edge.preconditions) {
      const kind = byId.get(condition.nodeId)!.kind;
      if ((condition.predicate === "consumed" && kind !== "material")
        || (condition.predicate === "level_at_least" && kind !== "profession")) throw new Error("DISCOVERY_PRECONDITION_TYPE_INVALID");
    }
    if (new Set(edge.preconditions.map(c => c.nodeId)).size !== edge.preconditions.length) throw new Error("DISCOVERY_PRECONDITION_CONFLICT");
    // One concrete relation per versioned canonical rule; conflicting definitions fail closed.
    const ruleKey = canonicalJson([edge.ruleId, edge.ruleVersion]);
    if (rules.has(ruleKey)) throw new Error("DISCOVERY_RULE_CONFLICT");
    rules.add(ruleKey);
  }
  return value;
}

/**
 * canonicalDefinitions must come from the existing server catalog owners, never
 * a client, rumor or authoring proposal. A valid shape alone proves no fact.
 * v1 has no reaction evaluator: every directed cycle is rejected, including a
 * cycle introduced only by an edge's prerequisites.
 */
export function buildDiscoveryGraph(input: unknown, canonicalDefinitions: unknown) {
  const canonical = normalize(canonicalDefinitions);
  const value = normalize(input);
  const canonicalNodes = new Map(canonical.nodes.map(node => [node.id, canonicalJson(node)]));
  const canonicalEdges = new Map(canonical.edges.map(edge => [edge.id, canonicalJson(edge)]));
  for (const node of value.nodes) if (canonicalNodes.get(node.id) !== canonicalJson(node)) throw new Error("DISCOVERY_NODE_UNCONFIRMED");
  for (const edge of value.edges) if (canonicalEdges.get(edge.id) !== canonicalJson(edge)) throw new Error("DISCOVERY_RULE_UNCONFIRMED");

  const outgoing = new Map(value.nodes.map(node => [node.id, new Set<string>()]));
  const indegree = new Map(value.nodes.map(node => [node.id, 0]));
  let units = value.nodes.length + value.edges.length;
  const fanout = new Map(value.nodes.map(node => [node.id, 0]));
  for (const edge of value.edges) {
    const sources = new Set([edge.from, ...edge.preconditions.map(c => c.nodeId)]);
    for (const source of sources) {
      fanout.set(source, fanout.get(source)! + 1);
      if (fanout.get(source)! > DISCOVERY_GRAPH_LIMITS.fanout) throw new Error("DISCOVERY_FANOUT_EXCEEDED");
      const targets = outgoing.get(source)!;
      if (!targets.has(edge.to)) { targets.add(edge.to); indegree.set(edge.to, indegree.get(edge.to)! + 1); }
      if (targets.size > DISCOVERY_GRAPH_LIMITS.fanout) throw new Error("DISCOVERY_FANOUT_EXCEEDED");
      if (++units > DISCOVERY_GRAPH_LIMITS.evaluationUnits) throw new Error("DISCOVERY_EVALUATION_EXCEEDED");
    }
  }
  const ready = value.nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  const order: string[] = [];
  const depth = new Map(value.nodes.map(node => [node.id, 0]));
  // Input and outgoing targets are canonically ordered. This is linear bounded
  // Kahn traversal, rather than recursive/exponential path enumeration.
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index];
    order.push(id);
    for (const target of [...outgoing.get(id)!].sort(compare)) {
      const nextDepth = Math.max(depth.get(target)!, depth.get(id)! + 1);
      if (nextDepth > DISCOVERY_GRAPH_LIMITS.depth) throw new Error("DISCOVERY_DEPTH_EXCEEDED");
      depth.set(target, nextDepth);
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) ready.push(target);
      if (++units > DISCOVERY_GRAPH_LIMITS.evaluationUnits) throw new Error("DISCOVERY_EVALUATION_EXCEEDED");
    }
  }
  if (order.length !== value.nodes.length) throw new Error("DISCOVERY_DEPENDENCY_CYCLE");
  const nodes = Object.freeze(value.nodes.map(node => Object.freeze(node)));
  const edges = Object.freeze(value.edges.map(edge => Object.freeze({ ...edge,
    preconditions: Object.freeze(edge.preconditions.map(condition => Object.freeze(condition))) })));
  return Object.freeze({ schema: DISCOVERY_GRAPH_VERSION, scope: "canonical_catalog" as const, nodes, edges,
    topologicalOrder: Object.freeze(order), evaluationUnits: units,
    fingerprint: canonicalSha256({ schema: DISCOVERY_GRAPH_VERSION, scope: "canonical_catalog", nodes, edges }), mutationAuthority: "none" as const });
}
