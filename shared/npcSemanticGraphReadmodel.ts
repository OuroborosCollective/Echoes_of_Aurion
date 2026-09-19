import { z } from "zod";

export const npcSemanticGraphNodeKinds = [
  "actor","location","world_event","goal","action","outcome","polity","item_resource","semantic_fact","procedural_competency",
] as const;
export const npcSemanticGraphEdgeKinds = [
  "observed_at","participated_in","selected_goal","performed_action","affected","related_to","member_of","located_in","supports","contradicts","supersedes","derived_from",
] as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nodeId = z.string().regex(/^smn_[a-f0-9]{60}$/);
const node = z.object({
  nodeId,
  kind:z.enum(npcSemanticGraphNodeKinds),
  semanticKey:z.string().max(128).nullable(),
  status:z.literal("active"),
  depth:z.number().int().min(0).max(4),
  score:z.number().int().min(0).max(20_000),
  payloadHash:hash,
}).strict();
const relation = z.object({
  kind:z.enum(npcSemanticGraphEdgeKinds),
  fromNodeId:nodeId,
  toNodeId:nodeId,
  status:z.literal("active"),
}).strict();
const graph = z.object({
  npcId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
  generation:z.number().int().min(0).max(2147483647),
  graphHash:hash,
  sourceResultHash:hash,
  resultHash:hash,
  sourceRevision:z.string().regex(/^[a-f0-9]{40}$/),
  provenanceStatus:z.literal("VERIFIED"),
  bounds:z.object({
    maxDepth:z.number().int().min(0).max(4),
    maxCandidates:z.number().int().min(1).max(64),
    maxResults:z.number().int().min(1).max(32),
  }).strict(),
  nodes:z.array(node).max(32),
  relations:z.array(relation).max(64),
  excluded:z.object({
    expired:z.number().int().min(0).max(160),
    contradicted:z.number().int().min(0).max(160),
    superseded:z.number().int().min(0).max(160),
  }).strict(),
}).strict();
const packet = z.object({
  userId:z.number().int().positive(),
  format:z.literal("aurion-public-npc-semantic-graph.v2"),
  graphs:z.array(graph).max(6),
}).strict();

export type PublicNpcSemanticGraph = z.infer<typeof graph>;

export function decodeOwnedNpcSemanticGraphs(input: unknown, userId: number) {
  const parsed=packet.parse(input);
  if(parsed.userId!==userId) throw new Error("NPC_SEMANTIC_GRAPH_PACKET_OWNER_MISMATCH");
  if(parsed.graphs.some((value,index)=>index>0&&parsed.graphs[index-1]!.npcId>=value.npcId)) throw new Error("NPC_SEMANTIC_GRAPH_PACKET_ORDER_INVALID");
  for(const value of parsed.graphs){
    const ids=new Set(value.nodes.map(node=>node.nodeId));
    if(ids.size!==value.nodes.length||value.relations.some(edge=>!ids.has(edge.fromNodeId)||!ids.has(edge.toNodeId))) throw new Error("NPC_SEMANTIC_GRAPH_PACKET_RELATION_INVALID");
    if(JSON.stringify(value.nodes.map(node=>node.nodeId))!==JSON.stringify([...value.nodes].map(node=>node.nodeId))) throw new Error("NPC_SEMANTIC_GRAPH_PACKET_INVALID");
  }
  return parsed;
}
