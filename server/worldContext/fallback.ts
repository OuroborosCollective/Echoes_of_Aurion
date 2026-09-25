import { eq, and, inArray } from "drizzle-orm";
import {
  aurionWorldContextCapsuleReceipts,
  aurionWorldContextCapsuleSources,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type {
  CanonicalContextSource,
  WorldContextExpansion,
} from "../../shared/aurionWorldContextContract";

export interface ExpandWorldContextSourcesInput {
  capsuleId: string;
  requestedSourceIds: readonly string[];
  expectedCapsuleHash: string;
  availableSources?: readonly CanonicalContextSource[];
}

type PersistedCapsuleSourceRow = {
  sourceId: string;
  sourceHash: string;
  kind: string;
  evidenceClass: string;
  worldId: string;
  logicalSequence: number;
};

export function reconstructPersistedSelectedSource(
  capsuleJson: string,
  row: PersistedCapsuleSourceRow,
): CanonicalContextSource | null {
  let storedCapsule: {
    selected?: Array<{
      canonicalText?: string;
      sourceRefs?: Array<{
        sourceId: string;
        sourceHash: string;
        kind: string;
        evidenceClass: string;
        worldId: string;
        actorIds: string[];
        logicalSequence: number;
      }>;
    }>;
  };
  try {
    storedCapsule = JSON.parse(capsuleJson);
  } catch {
    return null;
  }

  const match = storedCapsule.selected
    ?.flatMap(entry =>
      (entry.sourceRefs ?? []).map(ref => ({ ref, canonicalText: entry.canonicalText ?? "" })),
    )
    .find(entry => entry.ref.sourceId === row.sourceId);

  if (!match || !match.canonicalText) return null;
  if (
    match.ref.sourceHash !== row.sourceHash ||
    match.ref.worldId !== row.worldId ||
    match.ref.logicalSequence !== row.logicalSequence
  ) return null;

  return {
    sourceId: match.ref.sourceId,
    sourceHash: match.ref.sourceHash,
    kind: match.ref.kind as CanonicalContextSource["kind"],
    evidenceClass: match.ref.evidenceClass as CanonicalContextSource["evidenceClass"],
    worldId: match.ref.worldId,
    actorIds: [...match.ref.actorIds],
    logicalSequence: match.ref.logicalSequence,
    canonicalText: match.canonicalText,
  };
}

/**
 * Reversibly expands requested source entries from a WorldContextCapsule.
 * Fails closed if the capsule hash does not match or if sources cannot be verified.
 */
export async function expandWorldContextSources(
  input: ExpandWorldContextSourcesInput
): Promise<WorldContextExpansion> {
  const expanded: CanonicalContextSource[] = [];
  const unprovable: string[] = [];

  // If in-memory sources are provided, resolve from memory first
  if (input.availableSources && input.availableSources.length > 0) {
    const sourceMap = new Map<string, CanonicalContextSource>();
    for (const s of input.availableSources) {
      sourceMap.set(s.sourceId, s);
    }

    for (const id of input.requestedSourceIds) {
      const src = sourceMap.get(id);
      if (src) {
        expanded.push(src);
      } else {
        unprovable.push(id);
      }
    }

    const status =
      unprovable.length === 0
        ? "COMPLETE"
        : expanded.length > 0
        ? "PARTIAL"
        : "UNPROVABLE";

    return {
      capsuleId: input.capsuleId,
      capsuleHash: input.expectedCapsuleHash,
      expandedSources: expanded,
      unprovableSources: unprovable,
      status,
    };
  }

  try {
    const db = await getDb();
    if (!db) {
      return {
        capsuleId: input.capsuleId,
        capsuleHash: input.expectedCapsuleHash,
        expandedSources: [],
        unprovableSources: [...input.requestedSourceIds],
        status: "UNPROVABLE",
      };
    }

    // 1. Verify receipt existence and capsuleHash
    const [receipt] = await db
      .select()
      .from(aurionWorldContextCapsuleReceipts)
      .where(eq(aurionWorldContextCapsuleReceipts.id, input.capsuleId))
      .limit(1);

    if (!receipt || receipt.capsuleHash !== input.expectedCapsuleHash) {
      return {
        capsuleId: input.capsuleId,
        capsuleHash: input.expectedCapsuleHash,
        expandedSources: [],
        unprovableSources: [...input.requestedSourceIds],
        status: "UNPROVABLE",
      };
    }

    // 2. Fetch source records
    const sourceRows = await db
      .select()
      .from(aurionWorldContextCapsuleSources)
      .where(
        and(
          eq(aurionWorldContextCapsuleSources.capsuleId, input.capsuleId),
          inArray(aurionWorldContextCapsuleSources.sourceId, [...input.requestedSourceIds])
        )
      );

    // The persisted capsule contains the authoritative selected entry text and source refs.
    // Never synthesize placeholder content: expansion must remain reversible and provenance-bound.
    const selectedBySourceId = new Map<string, CanonicalContextSource>();
    for (const row of sourceRows) {
      const reconstructed = reconstructPersistedSelectedSource(receipt.capsuleJson, row);
      if (reconstructed) selectedBySourceId.set(row.sourceId, reconstructed);
    }

    const foundIds = new Set(sourceRows.map(r => r.sourceId));
    for (const id of input.requestedSourceIds) {
      if (!foundIds.has(id)) {
        unprovable.push(id);
        continue;
      }
      if (!selectedBySourceId.has(id)) {
        // Omitted-source linkage proves the identity was considered, but the capsule
        // itself intentionally does not contain enough raw text to reconstruct it.
        unprovable.push(id);
      }
    }

    for (const r of sourceRows) {
      const selected = selectedBySourceId.get(r.sourceId);
      if (selected) expanded.push(selected);
    }

    const status =
      unprovable.length === 0
        ? "COMPLETE"
        : expanded.length > 0
        ? "PARTIAL"
        : "UNPROVABLE";

    return {
      capsuleId: input.capsuleId,
      capsuleHash: input.expectedCapsuleHash,
      expandedSources: expanded,
      unprovableSources: unprovable,
      status,
    };
  } catch {
    return {
      capsuleId: input.capsuleId,
      capsuleHash: input.expectedCapsuleHash,
      expandedSources: [],
      unprovableSources: [...input.requestedSourceIds],
      status: "UNPROVABLE",
    };
  }
}
