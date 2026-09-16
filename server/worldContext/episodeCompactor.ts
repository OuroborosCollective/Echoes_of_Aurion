import type {
  CanonicalContextSource,
  ContextSourceRef,
  StructuredEpisode,
} from "../../shared/aurionWorldContextContract";
import {
  hashCanonicalSource,
  hashSourceRoot,
  hashStructuredEpisode,
} from "../../shared/aurionWorldContextCanonicalHash";

export interface EpisodeCompactionInput {
  episodeId: string;
  kind: string;
  worldId: string;
  actorIds: readonly string[];
  sources: readonly CanonicalContextSource[];
  outcomes: readonly string[];
  relationshipEffects?: readonly Array<{
    from: string;
    to: string;
    relation: string;
    confirmedDelta: number;
  }>;
  tags?: readonly string[];
  canonicalSummary: string;
}

/**
 * Compacts a window of canonical raw sources into an immutable, hash-bound StructuredEpisode.
 * Does NOT delete or overwrite original source evidence.
 */
export function compactStructuredEpisode(input: EpisodeCompactionInput): StructuredEpisode {
  if (input.sources.length === 0) {
    throw new Error("CANNOT_COMPACT_EMPTY_SOURCES");
  }

  // Verify all sources match worldId
  for (const s of input.sources) {
    if (s.worldId !== input.worldId) {
      throw new Error(`EPISODE_SCOPE_VIOLATION: source ${s.sourceId} has worldId ${s.worldId}, expected ${input.worldId}`);
    }
  }

  // Derive sequence bounds
  let seqMin = Number.MAX_SAFE_INTEGER;
  let seqMax = 0;
  const sourceRefs: ContextSourceRef[] = [];
  const sourceHashes: string[] = [];

  for (const s of input.sources) {
    if (s.logicalSequence < seqMin) seqMin = s.logicalSequence;
    const sMax = s.logicalSequenceMax ?? s.logicalSequence;
    if (sMax > seqMax) seqMax = sMax;

    sourceRefs.push({
      sourceId: s.sourceId,
      sourceHash: s.sourceHash,
      kind: s.kind,
      evidenceClass: s.evidenceClass,
      worldId: s.worldId,
      actorIds: [...s.actorIds],
      logicalSequence: s.logicalSequence,
    });
    sourceHashes.push(s.sourceHash);
  }

  const sourceRootHash = hashSourceRoot(sourceHashes);

  const episodeDraft: Omit<StructuredEpisode, "episodeHash"> = {
    schemaVersion: "aurion.context-episode.v1",
    episodeId: input.episodeId,
    kind: input.kind,
    worldId: input.worldId,
    actorIds: [...input.actorIds],
    sourceSequenceMin: seqMin === Number.MAX_SAFE_INTEGER ? 0 : seqMin,
    sourceSequenceMax: seqMax,
    sourceRefs,
    outcomes: [...input.outcomes],
    relationshipEffects: input.relationshipEffects ? [...input.relationshipEffects] : [],
    tags: input.tags ? [...input.tags] : [],
    canonicalSummary: input.canonicalSummary,
    sourceRootHash,
  };

  const episodeHash = hashStructuredEpisode(episodeDraft);

  return Object.freeze({
    ...episodeDraft,
    episodeHash,
  });
}

/**
 * Converts a StructuredEpisode into a CanonicalContextSource that can be fed into context capsules.
 */
export function episodeToCanonicalSource(episode: StructuredEpisode): CanonicalContextSource {
  const sourceData: Omit<CanonicalContextSource, "sourceHash"> = {
    sourceId: episode.episodeId,
    kind: "episode",
    evidenceClass: "verified",
    worldId: episode.worldId,
    actorIds: [...episode.actorIds],
    logicalSequence: episode.sourceSequenceMin,
    logicalSequenceMax: episode.sourceSequenceMax,
    canonicalText: `[Episode: ${episode.kind}] ${episode.canonicalSummary} (Outcomes: ${episode.outcomes.join(", ")}; Sources: ${episode.sourceRefs.length})`,
    metadata: {
      episodeHash: episode.episodeHash,
      sourceRootHash: episode.sourceRootHash,
      outcomes: episode.outcomes,
      tags: episode.tags,
      relationshipEffects: episode.relationshipEffects,
    },
  };

  return {
    ...sourceData,
    sourceHash: hashCanonicalSource(sourceData),
  };
}
