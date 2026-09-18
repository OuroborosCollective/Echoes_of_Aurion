import type {
  CanonicalContextSource,
  WorldContextCapsule,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import {
  hashWorldContextCapsule,
  hashWorldContextQuery,
} from "../../shared/aurionWorldContextCanonicalHash";
import {
  replayFirstDivergence,
  replayMatch,
  replayUnprovable,
  type ReplayVerdict,
  type ReplayVerdictContext,
} from "../../shared/aurionReplayContract";
import { activeProvenance } from "../aurionProvenance";
import { selectContextEntries } from "./selector";

export type WorldContextReplayVerdict = ReplayVerdict;

export interface ReplayContextCapsuleInput {
  expectedCapsule: WorldContextCapsule;
  query: WorldContextQuery;
  sources: readonly CanonicalContextSource[];
}

function contextFor(input: ReplayContextCapsuleInput): ReplayVerdictContext {
  return {
    domain: "WORLD_CONTEXT",
    sourceRevision: activeProvenance.sourceRevision,
    rulesetVersion: input.query.policyVersion,
    scopeIdentity: {
      worldId: input.query.worldId,
      actorId: input.query.actorId,
      capsuleHash: input.expectedCapsule.capsuleHash,
    },
    range: { fromTick: input.query.logicalTick, toTick: input.query.logicalTick },
  };
}

/**
 * Deterministically replays the construction of a WorldContextCapsule.
 * Every domain now emits the same fail-closed replay verdict contract.
 */
export function replayWorldContextCapsule(
  input: ReplayContextCapsuleInput
): WorldContextReplayVerdict {
  const context = contextFor(input);
  const verified: string[] = [];

  const expectedQueryHash = input.expectedCapsule.queryHash;
  const recomputedQueryHash = hashWorldContextQuery(input.query);
  if (recomputedQueryHash !== expectedQueryHash) {
    return replayFirstDivergence(context, verified, {
      stage: "QUERY_CONTRACT",
      expected: expectedQueryHash,
      observed: recomputedQueryHash,
      expectedHash: expectedQueryHash,
      observedHash: recomputedQueryHash,
    });
  }
  verified.push("QUERY_CONTRACT");

  if (input.sources.length === 0 && input.expectedCapsule.selectedSourceCount > 0) {
    return replayUnprovable(context, verified, "WORLD_CONTEXT_SOURCE_EVIDENCE_MISSING");
  }

  for (const source of input.sources) {
    if (source.worldId !== input.query.worldId) {
      return replayFirstDivergence(context, verified, {
        stage: "SOURCE_SCOPE",
        expected: input.query.worldId,
        observed: source.worldId,
      });
    }
  }
  verified.push("SOURCE_SCOPE");

  try {
    const selection = selectContextEntries(input.sources, input.query);

    if (selection.sourceRootHash !== input.expectedCapsule.sourceRootHash) {
      return replayFirstDivergence(context, verified, {
        stage: "SOURCE_ROOT_HASH",
        expected: input.expectedCapsule.sourceRootHash,
        observed: selection.sourceRootHash,
        expectedHash: input.expectedCapsule.sourceRootHash,
        observedHash: selection.sourceRootHash,
      });
    }
    verified.push("SOURCE_ROOT_HASH");

    if (selection.selectedSources.length !== input.expectedCapsule.selectedSourceCount) {
      return replayFirstDivergence(context, verified, {
        stage: "SELECTED_SOURCE_COUNT",
        expected: String(input.expectedCapsule.selectedSourceCount),
        observed: String(selection.selectedSources.length),
      });
    }
    verified.push("SELECTED_SOURCE_COUNT");

    if (selection.selectedSourceRootHash !== input.expectedCapsule.selectedSourceRootHash) {
      return replayFirstDivergence(context, verified, {
        stage: "SELECTED_SOURCE_ROOT_HASH",
        expected: input.expectedCapsule.selectedSourceRootHash,
        observed: selection.selectedSourceRootHash,
        expectedHash: input.expectedCapsule.selectedSourceRootHash,
        observedHash: selection.selectedSourceRootHash,
      });
    }
    verified.push("SELECTED_SOURCE_ROOT_HASH");

    if (selection.omittedSourceRootHash !== input.expectedCapsule.omittedSourceRootHash) {
      return replayFirstDivergence(context, verified, {
        stage: "OMITTED_SOURCE_ROOT_HASH",
        expected: input.expectedCapsule.omittedSourceRootHash,
        observed: selection.omittedSourceRootHash,
        expectedHash: input.expectedCapsule.omittedSourceRootHash,
        observedHash: selection.omittedSourceRootHash,
      });
    }
    verified.push("OMITTED_SOURCE_ROOT_HASH");

    const selectedEntryHashes = selection.selectedEntries.map(entry => entry.entryHash);
    const recomputedCapsuleHash = hashWorldContextCapsule({
      query: input.query,
      sourceRootHash: selection.sourceRootHash,
      selectedEntryHashes,
      omittedSourceRootHash: selection.omittedSourceRootHash,
    });

    if (recomputedCapsuleHash !== input.expectedCapsule.capsuleHash) {
      return replayFirstDivergence(context, verified, {
        stage: "CAPSULE_HASH",
        expected: input.expectedCapsule.capsuleHash,
        observed: recomputedCapsuleHash,
        expectedHash: input.expectedCapsule.capsuleHash,
        observedHash: recomputedCapsuleHash,
      });
    }
    verified.push("CAPSULE_HASH");

    return replayMatch(context, verified, { capsuleHash: recomputedCapsuleHash });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "WORLD_CONTEXT_REPLAY_SELECTION_FAILED";
    return replayUnprovable(context, verified, reason);
  }
}
