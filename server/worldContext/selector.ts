import type {
  CanonicalContextSource,
  ContextImportanceScore,
  ContextSourceRef,
  WorldContextEntry,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import {
  hashSourceRoot,
  hashWorldContextEntry,
} from "../../shared/aurionWorldContextCanonicalHash";
import {
  getTokenEstimator,
  measureUtf8Bytes,
} from "../../shared/aurionWorldContextBudget";
import {
  compareContextSources,
  isSourceNonDroppable,
  scoreContextSource,
} from "./importancePolicy";

export interface SelectionResult {
  selectedEntries: readonly WorldContextEntry[];
  selectedSources: readonly CanonicalContextSource[];
  omittedSources: readonly CanonicalContextSource[];
  sourceRootHash: string;
  selectedSourceRootHash: string;
  omittedSourceRootHash: string;
  estimatedInputTokens: number;
  utf8Bytes: number;
}

export function selectContextEntries(
  sources: readonly CanonicalContextSource[],
  query: WorldContextQuery
): SelectionResult {
  const estimator = getTokenEstimator(query.budget.tokenizerId);

  // 1. Score and classify all sources
  const evaluated = sources.map(source => {
    const importance = scoreContextSource(source, query);
    const nonDroppable = isSourceNonDroppable(source, query);
    const tokens = estimator.estimate(source.canonicalText);
    const bytes = measureUtf8Bytes(source.canonicalText);
    return {
      source,
      importance,
      nonDroppable,
      tokens,
      bytes,
    };
  });

  // 2. Stable deterministic sort
  evaluated.sort(compareContextSources);

  // 3. Check critical budget requirement
  const criticalItems = evaluated.filter(e => e.nonDroppable);
  const criticalTokens = criticalItems.reduce((sum, item) => sum + item.tokens, 0);
  const criticalBytes = criticalItems.reduce((sum, item) => sum + item.bytes, 0);

  if (
    criticalTokens > query.budget.maxEstimatedTokens ||
    criticalBytes > query.budget.maxUtf8Bytes
  ) {
    throw new Error(
      `BUDGET_TOO_SMALL_FOR_CRITICAL_CONTEXT: Critical context requires ${criticalTokens} tokens and ${criticalBytes} bytes, but budget allows max ${query.budget.maxEstimatedTokens} tokens and ${query.budget.maxUtf8Bytes} bytes.`
    );
  }

  // 4. Perform deterministic selection
  const selectedSources: CanonicalContextSource[] = [];
  const selectedEntries: WorldContextEntry[] = [];
  const omittedSources: CanonicalContextSource[] = [];

  let accumulatedTokens = 0;
  let accumulatedBytes = 0;

  // First pass: add all non-droppable items
  const nonDroppableIds = new Set<string>();
  for (const item of criticalItems) {
    selectedSources.push(item.source);
    nonDroppableIds.add(item.source.sourceId);
    accumulatedTokens += item.tokens;
    accumulatedBytes += item.bytes;

    const sourceRef: ContextSourceRef = {
      sourceId: item.source.sourceId,
      sourceHash: item.source.sourceHash,
      kind: item.source.kind,
      evidenceClass: item.source.evidenceClass,
      worldId: item.source.worldId,
      actorIds: [...item.source.actorIds],
      logicalSequence: item.source.logicalSequence,
    };

    const entryDraft: Omit<WorldContextEntry, "entryHash"> = {
      entryId: `entry_${item.source.sourceId}`,
      entryKind: item.source.kind === "episode" ? "episode" : "source",
      sourceRefs: [sourceRef],
      canonicalText: item.source.canonicalText,
      logicalSequenceMin: item.source.logicalSequence,
      logicalSequenceMax: item.source.logicalSequenceMax ?? item.source.logicalSequence,
      importance: item.importance,
      nonDroppable: true,
    };

    selectedEntries.push(
      Object.freeze({
        ...entryDraft,
        entryHash: hashWorldContextEntry(entryDraft),
      })
    );
  }

  // Second pass: fill remaining budget with highest-scoring droppable items
  for (const item of evaluated) {
    if (nonDroppableIds.has(item.source.sourceId)) continue;

    if (
      accumulatedTokens + item.tokens <= query.budget.maxEstimatedTokens &&
      accumulatedBytes + item.bytes <= query.budget.maxUtf8Bytes
    ) {
      selectedSources.push(item.source);
      accumulatedTokens += item.tokens;
      accumulatedBytes += item.bytes;

      const sourceRef: ContextSourceRef = {
        sourceId: item.source.sourceId,
        sourceHash: item.source.sourceHash,
        kind: item.source.kind,
        evidenceClass: item.source.evidenceClass,
        worldId: item.source.worldId,
        actorIds: [...item.source.actorIds],
        logicalSequence: item.source.logicalSequence,
      };

      const entryDraft: Omit<WorldContextEntry, "entryHash"> = {
        entryId: `entry_${item.source.sourceId}`,
        entryKind: item.source.kind === "episode" ? "episode" : "source",
        sourceRefs: [sourceRef],
        canonicalText: item.source.canonicalText,
        logicalSequenceMin: item.source.logicalSequence,
        logicalSequenceMax: item.source.logicalSequenceMax ?? item.source.logicalSequence,
        importance: item.importance,
        nonDroppable: false,
      };

      selectedEntries.push(
        Object.freeze({
          ...entryDraft,
          entryHash: hashWorldContextEntry(entryDraft),
        })
      );
    } else {
      omittedSources.push(item.source);
    }
  }

  // 5. Calculate source root hashes
  const allSourceHashes = sources.map(s => s.sourceHash);
  const selectedSourceHashes = selectedSources.map(s => s.sourceHash);
  const omittedSourceHashes = omittedSources.map(s => s.sourceHash);

  const sourceRootHash = hashSourceRoot(allSourceHashes);
  const selectedSourceRootHash = hashSourceRoot(selectedSourceHashes);
  const omittedSourceRootHash = hashSourceRoot(omittedSourceHashes);

  return {
    selectedEntries: Object.freeze(selectedEntries),
    selectedSources: Object.freeze(selectedSources),
    omittedSources: Object.freeze(omittedSources),
    sourceRootHash,
    selectedSourceRootHash,
    omittedSourceRootHash,
    estimatedInputTokens: accumulatedTokens,
    utf8Bytes: accumulatedBytes,
  };
}
