import { and, desc, eq } from "drizzle-orm";
import {
  aurionWorldContextCapsuleReceipts,
  aurionWorldContextCapsuleSources,
  aurionWorldContextEpisodes,
  aurionWorldContextEpisodeSources,
  aurionWorldContextEvalRuns,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type {
  StructuredEpisode,
  WorldContextCapsule,
} from "../../shared/aurionWorldContextContract";
import type { SelectionResult } from "./selector";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Atomically persists a StructuredEpisode and its constituent source linkages.
 */
export async function persistStructuredEpisode(
  episode: StructuredEpisode
): Promise<{ success: boolean; episodeId: string }> {
  const db = await getDb();
  if (!db) return { success: false, episodeId: episode.episodeId };

  await db.transaction(async tx => {
    // 1. Insert or ignore episode
    await tx
      .insert(aurionWorldContextEpisodes)
      .values({
        id: episode.episodeId,
        schemaVersion: episode.schemaVersion,
        kind: episode.kind,
        worldId: episode.worldId,
        sourceSequenceMin: episode.sourceSequenceMin,
        sourceSequenceMax: episode.sourceSequenceMax,
        actorIdsJson: JSON.stringify(episode.actorIds),
        outcomesJson: JSON.stringify(episode.outcomes),
        relationshipEffectsJson: JSON.stringify(episode.relationshipEffects),
        tagsJson: JSON.stringify(episode.tags),
        canonicalSummary: episode.canonicalSummary,
        sourceRootHash: episode.sourceRootHash,
        episodeHash: episode.episodeHash,
      })
      .onDuplicateKeyUpdate({
        set: {
          canonicalSummary: episode.canonicalSummary,
          episodeHash: episode.episodeHash,
        },
      });

    // 2. Insert episode source linkages
    for (const ref of episode.sourceRefs) {
      await tx
        .insert(aurionWorldContextEpisodeSources)
        .values({
          id: `${episode.episodeId}_${ref.sourceId}`,
          episodeId: episode.episodeId,
          sourceId: ref.sourceId,
          sourceHash: ref.sourceHash,
          kind: ref.kind,
          evidenceClass: ref.evidenceClass,
          worldId: ref.worldId,
          logicalSequence: ref.logicalSequence,
        })
        .onDuplicateKeyUpdate({
          set: {
            sourceHash: ref.sourceHash,
          },
        });
    }
  });

  return { success: true, episodeId: episode.episodeId };
}

/**
 * Atomically persists a WorldContextCapsule receipt and its selected + omitted sources.
 */
export async function persistWorldContextCapsule(
  capsule: WorldContextCapsule,
  selectionResult?: SelectionResult
): Promise<{ success: boolean; capsuleId: string }> {
  const db = await getDb();
  const capsuleId = `wcc_${capsule.capsuleHash.slice(0, 32)}_${capsule.logicalTick}`;
  if (!db) return { success: false, capsuleId };

  await db.transaction(async tx => {
    // 1. Insert receipt
    await tx
      .insert(aurionWorldContextCapsuleReceipts)
      .values({
        id: capsuleId,
        schemaVersion: capsule.schemaVersion,
        worldId: capsule.worldId,
        worldRevision: capsule.worldRevision,
        logicalTick: capsule.logicalTick,
        actorId: capsule.actorId,
        purpose: capsule.purpose,
        queryHash: capsule.queryHash,
        policyVersion: capsule.policyVersion,
        tokenizerId: capsule.budget.tokenizerId,
        maxEstimatedTokens: capsule.budget.maxEstimatedTokens,
        maxUtf8Bytes: capsule.budget.maxUtf8Bytes,
        selectedSourceCount: capsule.selectedSourceCount,
        omittedSourceCount: capsule.omittedSourceCount,
        sourceRootHash: capsule.sourceRootHash,
        selectedSourceRootHash: capsule.selectedSourceRootHash,
        omittedSourceRootHash: capsule.omittedSourceRootHash,
        capsuleHash: capsule.capsuleHash,
        estimatedInputTokens: capsule.estimatedInputTokens,
        utf8Bytes: capsule.utf8Bytes,
        capsuleJson: JSON.stringify(capsule),
      })
      .onDuplicateKeyUpdate({
        set: {
          capsuleHash: capsule.capsuleHash,
        },
      });

    // 2. Insert source links if selectionResult provided
    if (selectionResult) {
      for (const s of selectionResult.selectedSources) {
        await tx
          .insert(aurionWorldContextCapsuleSources)
          .values({
            id: `${capsuleId}_${s.sourceId}_s`,
            capsuleId,
            sourceId: s.sourceId,
            sourceHash: s.sourceHash,
            kind: s.kind,
            evidenceClass: s.evidenceClass,
            worldId: s.worldId,
            logicalSequence: s.logicalSequence,
            selected: true,
          })
          .onDuplicateKeyUpdate({
            set: { sourceHash: s.sourceHash },
          });
      }

      for (const s of selectionResult.omittedSources) {
        await tx
          .insert(aurionWorldContextCapsuleSources)
          .values({
            id: `${capsuleId}_${s.sourceId}_o`,
            capsuleId,
            sourceId: s.sourceId,
            sourceHash: s.sourceHash,
            kind: s.kind,
            evidenceClass: s.evidenceClass,
            worldId: s.worldId,
            logicalSequence: s.logicalSequence,
            selected: false,
          })
          .onDuplicateKeyUpdate({
            set: { sourceHash: s.sourceHash },
          });
      }
    }
  });

  return { success: true, capsuleId };
}

/**
 * Reads a persisted WorldContextCapsule.
 */
export async function readWorldContextCapsule(
  capsuleId: string
): Promise<WorldContextCapsule | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(aurionWorldContextCapsuleReceipts)
    .where(eq(aurionWorldContextCapsuleReceipts.id, capsuleId))
    .limit(1);

  if (!row) return null;
  return JSON.parse(row.capsuleJson) as WorldContextCapsule;
}

/**
 * Lists recent capsules for an actor in a world.
 */
export async function listWorldContextCapsules(
  worldId: string,
  actorId?: string,
  limit = 20
): Promise<readonly (typeof aurionWorldContextCapsuleReceipts.$inferSelect)[]> {
  const db = await getDb();
  if (!db) return [];

  const query = db.select().from(aurionWorldContextCapsuleReceipts);

  if (actorId) {
    return query
      .where(
        and(
          eq(aurionWorldContextCapsuleReceipts.worldId, worldId),
          eq(aurionWorldContextCapsuleReceipts.actorId, actorId)
        )
      )
      .orderBy(desc(aurionWorldContextCapsuleReceipts.createdAt))
      .limit(limit);
  }

  return query
    .where(eq(aurionWorldContextCapsuleReceipts.worldId, worldId))
    .orderBy(desc(aurionWorldContextCapsuleReceipts.createdAt))
    .limit(limit);
}

/**
 * Records an operational evaluation run.
 */
export async function recordEvalRun(input: {
  id: string;
  evalSuite: string;
  sourceRevision: string;
  criticalFactRecall: number;
  scopeViolationCount: number;
  replayMatchRate: number;
  metrics: Record<string, unknown>;
  passed: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(aurionWorldContextEvalRuns)
    .values({
      id: input.id,
      evalSuite: input.evalSuite,
      sourceRevision: input.sourceRevision,
      criticalFactRecall: input.criticalFactRecall,
      scopeViolationCount: input.scopeViolationCount,
      replayMatchRate: input.replayMatchRate,
      metricsJson: JSON.stringify(input.metrics),
      passed: input.passed,
    })
    .onDuplicateKeyUpdate({
      set: {
        passed: input.passed,
        metricsJson: JSON.stringify(input.metrics),
      },
    });
}
