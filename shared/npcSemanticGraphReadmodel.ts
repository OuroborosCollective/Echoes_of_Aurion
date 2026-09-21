import { z } from "zod";

const semanticNode = z
  .object({
    nodeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
    kind: z.string(),
    semanticKey: z.string().nullable().optional(),
    status: z.string(),
    depth: z.number().int().min(0),
    score: z.number(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const semanticGraphRow = z
  .object({
    npcId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
    generation: z.number().int().min(0),
    graphHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceResultHash: z.string().regex(/^[a-f0-9]{64}$/),
    resultHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    provenanceStatus: z.literal("VERIFIED"),
    bounds: z
      .object({
        maxDepth: z.number().int(),
        maxCandidates: z.number().int(),
        maxResults: z.number().int(),
      })
      .strict(),
    nodes: z.array(semanticNode),
    relations: z.array(z.any()),
    excluded: z
      .object({
        expired: z.number().int().min(0),
        contradicted: z.number().int().min(0),
        superseded: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

const semanticGraphPacket = z
  .object({
    userId: z.number().int().positive(),
    format: z.literal("aurion-public-npc-semantic-graph.v2"),
    graphs: z.array(semanticGraphRow).max(6),
  })
  .strict();

export type PublicNpcSemanticGraph = z.infer<typeof semanticGraphRow>;

export function decodeOwnedNpcSemanticGraphs(
  input: unknown,
  userId: number
): { userId: number; format: "aurion-public-npc-semantic-graph.v2"; graphs: PublicNpcSemanticGraph[] } {
  // Reject if rawProvenance is present anywhere on the payload or graphs
  if (input && typeof input === "object") {
    const raw = input as Record<string, unknown>;
    if ("rawProvenance" in raw) throw new Error("RAW_PROVENANCE_FORBIDDEN");
    if (Array.isArray(raw.graphs)) {
      for (const g of raw.graphs) {
        if (g && typeof g === "object" && "rawProvenance" in g) {
          throw new Error("RAW_PROVENANCE_FORBIDDEN");
        }
      }
    }
  }

  const parsed = semanticGraphPacket.parse(input);
  if (parsed.userId !== userId) throw new Error("NPC_SEMANTIC_GRAPH_PACKET_INVALID");
  return parsed;
}
