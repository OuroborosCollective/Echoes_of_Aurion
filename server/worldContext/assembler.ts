import type {
  CanonicalContextSource,
  WorldContextCapsule,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import { hashWorldContextCapsule } from "../../shared/aurionWorldContextCanonicalHash";
import { collectCanonicalSources } from "./sourceAdapter";
import { selectContextEntries, type SelectionResult } from "./selector";

export interface WorldContextBuildOptions {
  additionalSources?: readonly CanonicalContextSource[];
}

/**
 * Builds an immutable, deterministic WorldContextCapsule.
 * Derives the smallest sufficient provenance-bound view of history.
 */
export async function buildWorldContextCapsule(
  tx: unknown,
  query: WorldContextQuery,
  options?: WorldContextBuildOptions
): Promise<{ capsule: WorldContextCapsule; selectionResult: SelectionResult }> {
  // 1. Collect canonical sources across all registered adapters
  const allSources = await collectCanonicalSources({
    tx,
    query,
    additionalSources: options?.additionalSources,
  });

  // 2. Perform deterministic selection and budgeting
  const selectionResult = selectContextEntries(allSources, query);

  // 3. Compute domain-separated capsule hash
  const selectedEntryHashes = selectionResult.selectedEntries.map(e => e.entryHash);
  const capsuleHash = hashWorldContextCapsule({
    query,
    sourceRootHash: selectionResult.sourceRootHash,
    selectedEntryHashes,
    omittedSourceRootHash: selectionResult.omittedSourceRootHash,
  });

  // 4. Assemble final frozen capsule
  const capsule: WorldContextCapsule = Object.freeze({
    schemaVersion: "aurion.world-context-capsule.v1",
    worldId: query.worldId,
    worldRevision: query.worldRevision,
    logicalTick: query.logicalTick,
    actorId: query.actorId,
    purpose: query.purpose,
    queryHash: query.queryHash,
    policyVersion: query.policyVersion,
    budget: query.budget,

    selected: selectionResult.selectedEntries,
    selectedSourceCount: selectionResult.selectedSources.length,
    omittedSourceCount: selectionResult.omittedSources.length,

    sourceRootHash: selectionResult.sourceRootHash,
    selectedSourceRootHash: selectionResult.selectedSourceRootHash,
    omittedSourceRootHash: selectionResult.omittedSourceRootHash,
    capsuleHash,

    estimatedInputTokens: selectionResult.estimatedInputTokens,
    utf8Bytes: selectionResult.utf8Bytes,
    reversible: true,
  });

  return { capsule, selectionResult };
}
