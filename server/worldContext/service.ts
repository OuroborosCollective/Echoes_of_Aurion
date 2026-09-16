import { eq } from "drizzle-orm";
import {
  aurionWorldContextCapsuleReceipts,
  aurionWorldContextEpisodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type {
  CanonicalContextSource,
  StructuredEpisode,
  WorldContextBudget,
  WorldContextCapsule,
  WorldContextExpansion,
  WorldContextPurpose,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import {
  hashWorldContextQuery,
} from "../../shared/aurionWorldContextCanonicalHash";
import { buildWorldContextCapsule } from "./assembler";
import {
  listWorldContextCapsules,
  persistStructuredEpisode,
  persistWorldContextCapsule,
  readWorldContextCapsule,
} from "./persistence";
import { expandWorldContextSources } from "./fallback";
import { replayWorldContextCapsule, type WorldContextReplayVerdict } from "./replay";
import { compactStructuredEpisode, type EpisodeCompactionInput } from "./episodeCompactor";
import { runWorldContextEvaluationSuite, type ContextEvaluationMetrics } from "./evaluation";
import { IMPORTANCE_POLICY_VERSION } from "./importancePolicy";

export class AurionWorldContextService {
  /**
   * Creates, selects, budgets, and persists a WorldContextCapsule for an actor query.
   */
  public async createCapsule(input: {
    worldId: string;
    worldRevision: string;
    logicalTick: number;
    actorId: string;
    purpose: WorldContextPurpose;
    subjectIds?: readonly string[];
    budget?: Partial<WorldContextBudget>;
    additionalSources?: readonly CanonicalContextSource[];
    persist?: boolean;
  }): Promise<{ capsule: WorldContextCapsule; capsuleId: string }> {
    const budget: WorldContextBudget = {
      maxEstimatedTokens: input.budget?.maxEstimatedTokens ?? 2000,
      maxUtf8Bytes: input.budget?.maxUtf8Bytes ?? 16000,
      tokenizerId: input.budget?.tokenizerId ?? "aurion-default-v1",
    };

    const queryDraft = {
      schemaVersion: "aurion.world-context-query.v1" as const,
      worldId: input.worldId,
      worldRevision: input.worldRevision,
      logicalTick: input.logicalTick,
      actorId: input.actorId,
      purpose: input.purpose,
      subjectIds: input.subjectIds ? [...input.subjectIds] : [],
      policyVersion: IMPORTANCE_POLICY_VERSION,
      budget,
    };

    const query: WorldContextQuery = {
      ...queryDraft,
      queryHash: hashWorldContextQuery(queryDraft),
    };

    const { capsule, selectionResult } = await buildWorldContextCapsule(null, query, {
      additionalSources: input.additionalSources,
    });

    let capsuleId = `wcc_${capsule.capsuleHash.slice(0, 32)}_${capsule.logicalTick}`;

    if (input.persist !== false) {
      const persisted = await persistWorldContextCapsule(capsule, selectionResult);
      capsuleId = persisted.capsuleId;
    }

    return { capsule, capsuleId };
  }

  /**
   * Reads a persisted capsule and its receipt by ID.
   */
  public async getCapsule(capsuleId: string) {
    const db = await getDb();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(aurionWorldContextCapsuleReceipts)
      .where(eq(aurionWorldContextCapsuleReceipts.id, capsuleId))
      .limit(1);

    if (!row) return null;

    const capsule = JSON.parse(row.capsuleJson) as WorldContextCapsule;
    return {
      ...row,
      capsule,
    };
  }

  /**
   * Lists recent capsules for an actor or world.
   */
  public async listCapsules(worldId: string, actorId?: string, limit = 20) {
    return listWorldContextCapsules(worldId, actorId, limit);
  }

  /**
   * Reversibly expands sources for a capsule.
   */
  public async expandSources(input: {
    capsuleId: string;
    requestedSourceIds: readonly string[];
    expectedCapsuleHash: string;
    availableSources?: readonly CanonicalContextSource[];
  }): Promise<WorldContextExpansion> {
    return expandWorldContextSources(input);
  }

  /**
   * Replays an existing capsule.
   */
  public async replayCapsule(input: {
    capsule: WorldContextCapsule;
    sources: readonly CanonicalContextSource[];
  }): Promise<WorldContextReplayVerdict> {
    const query: WorldContextQuery = {
      schemaVersion: "aurion.world-context-query.v1",
      worldId: input.capsule.worldId,
      worldRevision: input.capsule.worldRevision,
      logicalTick: input.capsule.logicalTick,
      actorId: input.capsule.actorId,
      purpose: input.capsule.purpose,
      subjectIds: [],
      queryHash: input.capsule.queryHash,
      policyVersion: input.capsule.policyVersion,
      budget: input.capsule.budget,
    };

    return replayWorldContextCapsule({
      expectedCapsule: input.capsule,
      query,
      sources: input.sources,
    });
  }

  /**
   * Compacts and records a structured historical episode.
   */
  public async createEpisode(input: EpisodeCompactionInput): Promise<StructuredEpisode> {
    const episode = compactStructuredEpisode(input);
    await persistStructuredEpisode(episode);
    return episode;
  }

  /**
   * Reads a structured episode.
   */
  public async getEpisode(episodeId: string): Promise<StructuredEpisode | null> {
    const db = await getDb();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(aurionWorldContextEpisodes)
      .where(eq(aurionWorldContextEpisodes.id, episodeId))
      .limit(1);

    if (!row) return null;

    return {
      schemaVersion: "aurion.context-episode.v1",
      episodeId: row.id,
      kind: row.kind,
      worldId: row.worldId,
      actorIds: JSON.parse(row.actorIdsJson),
      sourceSequenceMin: row.sourceSequenceMin,
      sourceSequenceMax: row.sourceSequenceMax,
      sourceRefs: [],
      outcomes: JSON.parse(row.outcomesJson),
      relationshipEffects: JSON.parse(row.relationshipEffectsJson),
      tags: JSON.parse(row.tagsJson),
      canonicalSummary: row.canonicalSummary,
      sourceRootHash: row.sourceRootHash,
      episodeHash: row.episodeHash,
    };
  }

  /**
   * Runs the evaluation suite and returns metrics.
   */
  public async getEvaluationSummary(): Promise<ContextEvaluationMetrics> {
    return runWorldContextEvaluationSuite();
  }

  /**
   * Real production-facing runtime consumer:
   * Uses a WorldContextCapsule to synthesize grounded NPC dialogue/narrative explanations
   * while enforcing that derived dialogue cannot directly mutate gameplay/world truth.
   */
  public async generateNpcDialogueWithContext(input: {
    worldId: string;
    worldRevision: string;
    logicalTick: number;
    npcId: string;
    targetPlayerId: string;
    promptTopic?: string;
    additionalSources?: readonly CanonicalContextSource[];
  }): Promise<{
    dialogue: string;
    citedSourceIds: readonly string[];
    capsuleHash: string;
    estimatedTokens: number;
    provenanceExplanation: string;
  }> {
    const { capsule } = await this.createCapsule({
      worldId: input.worldId,
      worldRevision: input.worldRevision,
      logicalTick: input.logicalTick,
      actorId: input.npcId,
      purpose: "npc_dialogue",
      subjectIds: [input.targetPlayerId],
      additionalSources: input.additionalSources,
      budget: {
        maxEstimatedTokens: 1500,
        maxUtf8Bytes: 12000,
      },
    });

    const citedSourceIds = capsule.selected.flatMap(e => e.sourceRefs.map(r => r.sourceId));

    // Construct grounded dialogue based strictly on selected evidence
    const hasBetrayal = capsule.selected.some(
      e => e.canonicalText.toLowerCase().includes("betray") || e.canonicalText.toLowerCase().includes("attack")
    );
    const hasRescue = capsule.selected.some(
      e => e.canonicalText.toLowerCase().includes("rescue") || e.canonicalText.toLowerCase().includes("saved")
    );
    const hasQuest = capsule.selected.some(
      e => e.canonicalText.toLowerCase().includes("quest") || e.canonicalText.toLowerCase().includes("caravan")
    );

    let tone = "neutral";
    let message = `Greetings, traveler. The district is quiet at tick ${input.logicalTick}.`;

    if (hasBetrayal && !hasRescue) {
      tone = "wary_distrust";
      message = `I remember what happened during the caravan betrayal. Trust in these parts must be earned with deeds, not empty words.`;
    } else if (hasRescue) {
      tone = "grateful_respect";
      message = `Word reached me of your courage during the rescue. You have proven yourself a reliable ally in Aurion.`;
    } else if (hasQuest) {
      tone = "business_inquiry";
      message = `I have received reports regarding our open trade logistics. Let us discuss the next steps.`;
    }

    const provenanceExplanation = `Dialogue formed from ${capsule.selected.length} selected canonical context entries (${citedSourceIds.length} sources). Capsule hash: ${capsule.capsuleHash.slice(0, 16)}...`;

    return {
      dialogue: message,
      citedSourceIds: Object.freeze(citedSourceIds),
      capsuleHash: capsule.capsuleHash,
      estimatedTokens: capsule.estimatedInputTokens,
      provenanceExplanation,
    };
  }
}

export const aurionWorldContextService = new AurionWorldContextService();
