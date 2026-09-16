import { createHash } from "node:crypto";
import type {
  CanonicalContextSource,
  ContextImportanceScore,
  ContextSourceRef,
  StructuredEpisode,
  WorldContextCapsule,
  WorldContextEntry,
  WorldContextQuery,
} from "./aurionWorldContextContract";

/**
 * Deterministically serializes any JS object or primitive into a stable canonical JSON string
 * with recursively sorted key-value pairs.
 */
export function canonicalSerialize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  if (typeof obj === "number" || typeof obj === "boolean" || typeof obj === "string") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalSerialize(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const keyValues = sortedKeys.map(
      key => `${JSON.stringify(key)}:${canonicalSerialize((obj as Record<string, unknown>)[key])}`
    );
    return "{" + keyValues.join(",") + "}";
  }
  return JSON.stringify(String(obj));
}

/**
 * Domain-separated SHA-256 calculation.
 */
export function sha256Canonical(elements: readonly unknown[]): string {
  const serialized = elements.map(e => canonicalSerialize(e)).join("::");
  return createHash("sha256").update(serialized, "utf-8").digest("hex");
}

export function hashCanonicalSource(source: Omit<CanonicalContextSource, "sourceHash">): string {
  return sha256Canonical([
    "aurion.context.source.v1",
    source.sourceId,
    source.kind,
    source.evidenceClass,
    source.worldId,
    [...source.actorIds].sort(),
    source.logicalSequence,
    source.logicalSequenceMax ?? source.logicalSequence,
    source.canonicalText,
    source.metadata ?? {},
  ]);
}

export function hashWorldContextQuery(query: Omit<WorldContextQuery, "queryHash">): string {
  return sha256Canonical([
    "aurion.context.query.v1",
    query.schemaVersion,
    query.worldId,
    query.worldRevision,
    query.logicalTick,
    query.actorId,
    query.purpose,
    [...query.subjectIds].sort(),
    query.policyVersion,
    query.budget.tokenizerId,
    query.budget.maxEstimatedTokens,
    query.budget.maxUtf8Bytes,
  ]);
}

export function hashContextImportanceScore(score: ContextImportanceScore): string {
  return sha256Canonical([
    "aurion.context.importance.v1",
    score.policyVersion,
    score.causal,
    score.actorRelevance,
    score.questRelevance,
    score.relationship,
    score.salience,
    score.uniqueness,
    score.recencyBucket,
    score.evidence,
    score.total,
  ]);
}

export function hashStructuredEpisode(episode: Omit<StructuredEpisode, "episodeHash">): string {
  const sortedSourceRefs = [...episode.sourceRefs].sort((a, b) => {
    if (a.logicalSequence !== b.logicalSequence) return a.logicalSequence - b.logicalSequence;
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    return a.sourceHash.localeCompare(b.sourceHash);
  });

  return sha256Canonical([
    "aurion.context.episode.v1",
    episode.schemaVersion,
    episode.episodeId,
    episode.kind,
    episode.worldId,
    [...episode.actorIds].sort(),
    episode.sourceSequenceMin,
    episode.sourceSequenceMax,
    sortedSourceRefs.map(r => r.sourceHash),
    [...episode.outcomes].sort(),
    [...episode.relationshipEffects].sort((a, b) =>
      `${a.from}:${a.to}:${a.relation}`.localeCompare(`${b.from}:${b.to}:${b.relation}`)
    ),
    [...episode.tags].sort(),
    episode.canonicalSummary,
    episode.sourceRootHash,
  ]);
}

export function hashWorldContextEntry(entry: Omit<WorldContextEntry, "entryHash">): string {
  const sortedSourceHashes = [...entry.sourceRefs].map(r => r.sourceHash).sort();

  return sha256Canonical([
    "aurion.context.entry.v1",
    entry.entryId,
    entry.entryKind,
    sortedSourceHashes,
    entry.canonicalText,
    entry.logicalSequenceMin,
    entry.logicalSequenceMax,
    entry.importance.total,
    entry.nonDroppable,
  ]);
}

export function hashSourceRoot(sourceHashes: readonly string[]): string {
  const sorted = [...sourceHashes].sort();
  return sha256Canonical(["aurion.context.source-root.v1", sorted]);
}

export function hashWorldContextCapsule(input: {
  query: WorldContextQuery;
  sourceRootHash: string;
  selectedEntryHashes: readonly string[];
  omittedSourceRootHash: string;
}): string {
  return sha256Canonical([
    "aurion.context.capsule.v1",
    input.query.worldId,
    input.query.worldRevision,
    input.query.logicalTick,
    input.query.actorId,
    input.query.purpose,
    input.query.queryHash,
    input.query.policyVersion,
    input.query.budget.tokenizerId,
    input.query.budget.maxEstimatedTokens,
    input.query.budget.maxUtf8Bytes,
    input.sourceRootHash,
    [...input.selectedEntryHashes].sort(),
    input.omittedSourceRootHash,
  ]);
}
