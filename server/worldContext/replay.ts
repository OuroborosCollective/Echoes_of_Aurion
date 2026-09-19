import type {
  CanonicalContextSource,
  WorldContextCapsule,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import {
  hashWorldContextCapsule,
  hashWorldContextQuery,
} from "../../shared/aurionWorldContextCanonicalHash";
import { selectContextEntries } from "./selector";

export type WorldContextReplayVerdict =
  | { status: "MATCH"; capsuleHash: string; stagesVerified: number }
  | { status: "FIRST_DIVERGENCE"; stage: string; expected: string; observed: string }
  | { status: "UNPROVABLE"; reason: string };

export interface ReplayContextCapsuleInput {
  expectedCapsule: WorldContextCapsule;
  query: WorldContextQuery;
  sources: readonly CanonicalContextSource[];
}

/**
 * Deterministically replays the construction of a WorldContextCapsule.
 * Verifies stage-by-stage causality and pinpoints first divergence.
 */
export function replayWorldContextCapsule(
  input: ReplayContextCapsuleInput
): WorldContextReplayVerdict {
  let stagesVerified = 0;

  // Stage 1: Query Contract & Query Hash
  const expectedQueryHash = input.expectedCapsule.queryHash;
  const recomputedQueryHash = hashWorldContextQuery(input.query);
  if (recomputedQueryHash !== expectedQueryHash) {
    return {
      status: "FIRST_DIVERGENCE",
      stage: "query_contract",
      expected: expectedQueryHash,
      observed: recomputedQueryHash,
    };
  }
  stagesVerified++;

  // Stage 2: Scope & Source Set Validation
  if (input.sources.length === 0 && input.expectedCapsule.selectedSourceCount > 0) {
    return {
      status: "UNPROVABLE",
      reason: "No sources provided for replay of non-empty capsule",
    };
  }

  for (const s of input.sources) {
    if (s.worldId !== input.query.worldId) {
      return {
        status: "FIRST_DIVERGENCE",
        stage: "source_scope",
        expected: input.query.worldId,
        observed: s.worldId,
      };
    }
  }
  stagesVerified++;

  // Stage 3: Selector Execution & Source Roots
  try {
    const selection = selectContextEntries(input.sources, input.query);

    // Check Source Root Hash
    if (selection.sourceRootHash !== input.expectedCapsule.sourceRootHash) {
      return {
        status: "FIRST_DIVERGENCE",
        stage: "source_root_hash",
        expected: input.expectedCapsule.sourceRootHash,
        observed: selection.sourceRootHash,
      };
    }
    stagesVerified++;

    // Check Selected Source Count
    if (selection.selectedSources.length !== input.expectedCapsule.selectedSourceCount) {
      return {
        status: "FIRST_DIVERGENCE",
        stage: "selected_source_count",
        expected: String(input.expectedCapsule.selectedSourceCount),
        observed: String(selection.selectedSources.length),
      };
    }
    stagesVerified++;

    // Check Selected Source Root Hash
    if (selection.selectedSourceRootHash !== input.expectedCapsule.selectedSourceRootHash) {
      return {
        status: "FIRST_DIVERGENCE",
        stage: "selected_source_root_hash",
        expected: input.expectedCapsule.selectedSourceRootHash,
        observed: selection.selectedSourceRootHash,
      };
    }
    stagesVerified++;

    // Check Omitted Source Root Hash
    if (selection.omittedSourceRootHash !== input.expectedCapsule.omittedSourceRootHash) {
      return {
        status: "FIRST_DIVERGENCE",
        stage: "omitted_source_root_hash",
        expected: input.expectedCapsule.omittedSourceRootHash,
        observed: selection.omittedSourceRootHash,
      };
    }
    stagesVerified++;

    // Stage 4: Capsule Hash
    const selectedEntryHashes = selection.selectedEntries.map(e => e.entryHash);
    const recomputedCapsuleHash = hashWorldContextCapsule({
      query: input.query,
      sourceRootHash: selection.sourceRootHash,
      selectedEntryHashes,
      omittedSourceRootHash: selection.omittedSourceRootHash,
    });

    if (recomputedCapsuleHash !== input.expectedCapsule.capsuleHash) {
      return {
        status: "FIRST_DIVERGENCE",
        stage: "capsule_hash",
        expected: input.expectedCapsule.capsuleHash,
        observed: recomputedCapsuleHash,
      };
    }
    stagesVerified++;

    return {
      status: "MATCH",
      capsuleHash: recomputedCapsuleHash,
      stagesVerified,
    };
  } catch (err: any) {
    return {
      status: "UNPROVABLE",
      reason: err?.message || "Unknown error during replay selection",
    };
  }
}
