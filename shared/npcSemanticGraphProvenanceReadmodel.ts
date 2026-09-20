import { z } from "zod";
import { decodeOwnedNpcSemanticGraphs } from "./npcSemanticGraphReadmodel";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const npcId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/);
const projection = z.object({
  npcId,
  generation: z.number().int().min(0).max(2_147_483_647),
  graphHash: hash,
  sourceResultHash: hash,
  semanticGraphResultHash: hash,
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  provenanceStatus: z.literal("VERIFIED"),
}).strict();
const packet = z.object({
  userId: z.number().int().positive(),
  format: z.literal("aurion-public-npc-projection-provenance.v2"),
  projections: z.array(projection).max(6),
}).strict();

export type PublicNpcProjectionProvenance = z.infer<typeof projection>;

export function decodeOwnedNpcProjectionProvenance(input: unknown, userId: number) {
  const parsed = packet.parse(input);
  if (parsed.userId !== userId) throw new Error("NPC_PROJECTION_PROVENANCE_PACKET_OWNER_MISMATCH");
  if (parsed.projections.some((value, index) => index > 0 && parsed.projections[index - 1]!.npcId >= value.npcId)) {
    throw new Error("NPC_PROJECTION_PROVENANCE_PACKET_ORDER_INVALID");
  }
  return parsed;
}

/**
 * Produces a deliberately smaller public proof from the already verified V2 graph
 * packet. The mapper never receives raw database provenance rows or receipt JSON.
 */
export function projectOwnedNpcProjectionProvenance(input: unknown, userId: number) {
  const source = decodeOwnedNpcSemanticGraphs(input, userId);
  return decodeOwnedNpcProjectionProvenance({
    userId: source.userId,
    format: "aurion-public-npc-projection-provenance.v2",
    projections: source.graphs.map(graph => ({
      npcId: graph.npcId,
      generation: graph.generation,
      graphHash: graph.graphHash,
      sourceResultHash: graph.sourceResultHash,
      semanticGraphResultHash: graph.resultHash,
      sourceRevision: graph.sourceRevision,
      provenanceStatus: graph.provenanceStatus,
    })),
  }, userId);
}
