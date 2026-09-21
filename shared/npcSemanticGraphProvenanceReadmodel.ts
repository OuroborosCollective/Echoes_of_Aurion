import { decodeOwnedNpcSemanticGraphs } from "./npcSemanticGraphReadmodel";

export interface PublicNpcProjectionProvenance {
  npcId: string;
  generation: number;
  sourceRevision: string;
  provenanceStatus: string;
  graphHash: string;
  resultHash: string;
}

export function projectOwnedNpcProjectionProvenance(
  input: unknown,
  userId: number
): { userId: number; format: "aurion-public-npc-semantic-graph.v2"; projections: PublicNpcProjectionProvenance[] } {
  const decoded = decodeOwnedNpcSemanticGraphs(input, userId);
  return {
    userId: decoded.userId,
    format: decoded.format,
    projections: decoded.graphs.map(g => ({
      npcId: g.npcId,
      generation: g.generation,
      sourceRevision: g.sourceRevision,
      provenanceStatus: g.provenanceStatus,
      graphHash: g.graphHash,
      resultHash: g.resultHash,
    })),
  };
}
