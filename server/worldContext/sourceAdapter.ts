import { eq, and, inArray } from "drizzle-orm";
import {
  aurionNpcMemoryReceiptsV4,
  aurionNpcDecisionReceipts,
  aurionSemanticNodes,
  aurionQuestInstances,
  aurionQuestReceipts,
  aurionWorldContextEpisodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type {
  CanonicalContextSource,
  ContextSourceKind,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import { hashCanonicalSource } from "../../shared/aurionWorldContextCanonicalHash";

export interface WorldContextSourceAdapter {
  readonly kind: ContextSourceKind;
  collect(input: {
    tx?: unknown;
    query: WorldContextQuery;
    memorySources?: readonly CanonicalContextSource[];
  }): Promise<readonly CanonicalContextSource[]>;
}

/**
 * Adapter 1: NPC Multi-Memory and Decision Receipts
 */
export class NpcMemorySourceAdapter implements WorldContextSourceAdapter {
  public readonly kind: ContextSourceKind = "npc_memory";

  public async collect(input: {
    tx?: unknown;
    query: WorldContextQuery;
    memorySources?: readonly CanonicalContextSource[];
  }): Promise<readonly CanonicalContextSource[]> {
    const results: CanonicalContextSource[] = [];

    // Check memorySources first
    if (input.memorySources) {
      for (const s of input.memorySources) {
        if (s.kind === "npc_memory" && s.worldId === input.query.worldId) {
          results.push(s);
        }
      }
    }

    try {
      const db = await getDb();
      if (!db) return results;

      // Query confirmed NPC memories for this actor
      const receipts = await db
        .select()
        .from(aurionNpcMemoryReceiptsV4)
        .where(eq(aurionNpcMemoryReceiptsV4.npcId, input.query.actorId))
        .limit(32);

      for (const r of receipts) {
        const sourceData: Omit<CanonicalContextSource, "sourceHash"> = {
          sourceId: r.id,
          kind: "npc_memory",
          evidenceClass: "verified",
          worldId: input.query.worldId,
          actorIds: [r.npcId],
          logicalSequence: r.resolutionIndex,
          canonicalText: `NPC Memory [${r.npcId}] resolution ${r.resolutionIndex} hash ${r.memoryHash.slice(0, 16)}: ${r.memoryJson.slice(0, 240)}`,
          metadata: {
            sourceDecisionReceiptId: r.sourceDecisionReceiptId,
            ruleSetVersion: r.ruleSetVersion,
          },
        };
        results.push({
          ...sourceData,
          sourceHash: hashCanonicalSource(sourceData),
        });
      }
    } catch {
      // Fallback in headless / offline environments
    }

    return results;
  }
}

/**
 * Adapter 2: Semantic Memory Graph Adapter
 */
export class SemanticGraphSourceAdapter implements WorldContextSourceAdapter {
  public readonly kind: ContextSourceKind = "semantic_relation";

  public async collect(input: {
    tx?: unknown;
    query: WorldContextQuery;
    memorySources?: readonly CanonicalContextSource[];
  }): Promise<readonly CanonicalContextSource[]> {
    const results: CanonicalContextSource[] = [];

    if (input.memorySources) {
      for (const s of input.memorySources) {
        if (s.kind === "semantic_relation" && s.worldId === input.query.worldId) {
          results.push(s);
        }
      }
    }

    try {
      const db = await getDb();
      if (!db) return results;

      const nodes = await db
        .select()
        .from(aurionSemanticNodes)
        .where(eq(aurionSemanticNodes.npcId, input.query.actorId))
        .limit(64);

      for (const node of nodes) {
        const sourceData: Omit<CanonicalContextSource, "sourceHash"> = {
          sourceId: `sem_${node.id}_${node.graphReceiptId.slice(0, 12)}`,
          kind: "semantic_relation",
          evidenceClass: node.status === "conflicted" ? "contradicted" : "verified",
          worldId: input.query.worldId,
          actorIds: [node.npcId, node.subjectId].filter(Boolean),
          logicalSequence: node.validFromIndex,
          logicalSequenceMax: node.validUntilIndex,
          canonicalText: `Semantic Fact [${node.subjectId}] ${node.predicate} = ${node.value} (status: ${node.status}, valid ${node.validFromIndex}..${node.validUntilIndex})`,
          metadata: {
            predicate: node.predicate,
            value: node.value,
            status: node.status,
          },
        };
        results.push({
          ...sourceData,
          sourceHash: hashCanonicalSource(sourceData),
        });
      }
    } catch {
      // Offline fallback
    }

    return results;
  }
}

/**
 * Adapter 3: World Facts & Events Adapter
 */
export class WorldFactsSourceAdapter implements WorldContextSourceAdapter {
  public readonly kind: ContextSourceKind = "world_fact";

  public async collect(input: {
    tx?: unknown;
    query: WorldContextQuery;
    memorySources?: readonly CanonicalContextSource[];
  }): Promise<readonly CanonicalContextSource[]> {
    const results: CanonicalContextSource[] = [];

    if (input.memorySources) {
      for (const s of input.memorySources) {
        if (
          (s.kind === "world_fact" || s.kind === "world_event" || s.kind === "relationship" || s.kind === "location_fact") &&
          s.worldId === input.query.worldId
        ) {
          results.push(s);
        }
      }
    }

    return results;
  }
}

/**
 * Adapter 4: Quest Compiler Runtime Events & Facts
 */
export class QuestRuntimeSourceAdapter implements WorldContextSourceAdapter {
  public readonly kind: ContextSourceKind = "quest_fact";

  public async collect(input: {
    tx?: unknown;
    query: WorldContextQuery;
    memorySources?: readonly CanonicalContextSource[];
  }): Promise<readonly CanonicalContextSource[]> {
    const results: CanonicalContextSource[] = [];

    if (input.memorySources) {
      for (const s of input.memorySources) {
        if (
          (s.kind === "quest_fact" || s.kind === "quest_event") &&
          s.worldId === input.query.worldId
        ) {
          results.push(s);
        }
      }
    }

    try {
      const db = await getDb();
      if (!db) return results;

      const instances = await db
        .select()
        .from(aurionQuestInstances)
        .where(
          and(
            eq(aurionQuestInstances.worldId, input.query.worldId),
            eq(aurionQuestInstances.giverNpcId, input.query.actorId)
          )
        )
        .limit(16);

      for (const inst of instances) {
        const sourceData: Omit<CanonicalContextSource, "sourceHash"> = {
          sourceId: `quest_inst_${inst.id}`,
          kind: "quest_fact",
          evidenceClass: "verified",
          worldId: input.query.worldId,
          actorIds: [inst.giverNpcId, `player_${inst.playerUserId}`],
          logicalSequence: 0,
          canonicalText: `Quest Instance [${inst.templateId}] state=${inst.state}, current=${inst.currentNodeId}, plan=${inst.planHash.slice(0, 12)}`,
          metadata: {
            templateId: inst.templateId,
            state: inst.state,
            planHash: inst.planHash,
          },
        };
        results.push({
          ...sourceData,
          sourceHash: hashCanonicalSource(sourceData),
        });
      }
    } catch {
      // Offline fallback
    }

    return results;
  }
}

/**
 * Adapter 5: Structured Historical Episodes Adapter
 */
export class StructuredEpisodeSourceAdapter implements WorldContextSourceAdapter {
  public readonly kind: ContextSourceKind = "episode";

  public async collect(input: {
    tx?: unknown;
    query: WorldContextQuery;
    memorySources?: readonly CanonicalContextSource[];
  }): Promise<readonly CanonicalContextSource[]> {
    const results: CanonicalContextSource[] = [];

    if (input.memorySources) {
      for (const s of input.memorySources) {
        if (s.kind === "episode" && s.worldId === input.query.worldId) {
          results.push(s);
        }
      }
    }

    try {
      const db = await getDb();
      if (!db) return results;

      const rows = await db
        .select()
        .from(aurionWorldContextEpisodes)
        .where(eq(aurionWorldContextEpisodes.worldId, input.query.worldId))
        .limit(32);

      for (const r of rows) {
        const actorIds = JSON.parse(r.actorIdsJson) as string[];
        const sourceData: Omit<CanonicalContextSource, "sourceHash"> = {
          sourceId: r.id,
          kind: "episode",
          evidenceClass: "verified",
          worldId: r.worldId,
          actorIds,
          logicalSequence: r.sourceSequenceMin,
          logicalSequenceMax: r.sourceSequenceMax,
          canonicalText: `Structured Episode [${r.kind}]: ${r.canonicalSummary} (outcomes: ${r.outcomesJson})`,
          metadata: {
            outcomes: JSON.parse(r.outcomesJson),
            relationshipEffects: JSON.parse(r.relationshipEffectsJson),
            tags: JSON.parse(r.tagsJson),
            episodeHash: r.episodeHash,
            sourceRootHash: r.sourceRootHash,
          },
        };
        results.push({
          ...sourceData,
          sourceHash: hashCanonicalSource(sourceData),
        });
      }
    } catch {
      // Offline fallback
    }

    return results;
  }
}

/**
 * Composite Source Collector that gathers all canonical sources across adapters
 * and validates scope / provenance strictly.
 */
export async function collectCanonicalSources(input: {
  tx?: unknown;
  query: WorldContextQuery;
  additionalSources?: readonly CanonicalContextSource[];
}): Promise<readonly CanonicalContextSource[]> {
  // Strict Scope check: All additional sources must match query.worldId
  if (input.additionalSources) {
    for (const source of input.additionalSources) {
      if (source.worldId !== input.query.worldId) {
        throw new Error(
          `SCOPE_VIOLATION: Source [${source.sourceId}] worldId [${source.worldId}] does not match query worldId [${input.query.worldId}]`
        );
      }
    }
  }

  const adapters: WorldContextSourceAdapter[] = [
    new NpcMemorySourceAdapter(),
    new SemanticGraphSourceAdapter(),
    new WorldFactsSourceAdapter(),
    new QuestRuntimeSourceAdapter(),
    new StructuredEpisodeSourceAdapter(),
  ];

  const gathered: CanonicalContextSource[] = [];

  for (const adapter of adapters) {
    const res = await adapter.collect({
      tx: input.tx,
      query: input.query,
      memorySources: input.additionalSources,
    });
    for (const source of res) {
      // Scope invariant: Must match worldId exactly. Cross-world leakage fails closed.
      if (source.worldId !== input.query.worldId) {
        throw new Error(
          `SCOPE_VIOLATION: Source [${source.sourceId}] worldId [${source.worldId}] does not match query worldId [${input.query.worldId}]`
        );
      }
      gathered.push(source);
    }
  }

  // Deduplicate by sourceId + sourceHash
  const seen = new Map<string, CanonicalContextSource>();
  for (const s of gathered) {
    const key = `${s.sourceId}:${s.sourceHash}`;
    if (!seen.has(key)) {
      seen.set(key, s);
    }
  }

  // Sort deterministically by logicalSequence, kind, sourceId, sourceHash
  return Array.from(seen.values()).sort((a, b) => {
    if (a.logicalSequence !== b.logicalSequence) return a.logicalSequence - b.logicalSequence;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    return a.sourceHash.localeCompare(b.sourceHash);
  });
}
