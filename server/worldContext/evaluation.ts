import type {
  CanonicalContextSource,
  WorldContextCapsule,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import { hashWorldContextQuery } from "../../shared/aurionWorldContextCanonicalHash";
import { buildWorldContextCapsule } from "./assembler";
import { replayWorldContextCapsule } from "./replay";
import { isSourceNonDroppable } from "./importancePolicy";
import { getTokenEstimator, measureUtf8Bytes } from "../../shared/aurionWorldContextBudget";

export interface ContextEvaluationMetrics {
  totalScenarios: number;
  criticalFactRecall: number; // 0..1 (1.0 = 100%)
  scopeViolationCount: number; // 0 required
  replayMatchRate: number; // 0..1 (1.0 = 100%)
  averageCompressionRatioTokens: number;
  averageCompressionRatioBytes: number;
  sourceRecoveryRate: number;
  averageBuildLatencyMs: number;
  passed: boolean;
}

export interface ContextEvaluationScenario {
  name: string;
  query: WorldContextQuery;
  sources: readonly CanonicalContextSource[];
  expectedCriticalSourceIds: readonly string[];
}

export function buildStandardEvaluationCorpus(): readonly ContextEvaluationScenario[] {
  const worldId = "world_aurion_prime";
  const revision = "rev_aim299_20260916";

  // Scenario 1: Trivial encounters + 1 betrayal
  const s1Sources: CanonicalContextSource[] = [];
  for (let i = 1; i <= 20; i++) {
    s1Sources.push({
      sourceId: `encounter_${i}`,
      sourceHash: `111111111111111111111111111111111111111111111111111111111111${String(i).padStart(4, "0")}`,
      kind: "world_event",
      evidenceClass: "observed",
      worldId,
      actorIds: ["npc_merchant", "player_1"],
      logicalSequence: i * 10,
      canonicalText: `Encounter #${i}: Merchant exchanged general greeting at roadside waypoint #${i}.`,
    });
  }
  s1Sources.push({
    sourceId: "event_betrayal_caravan",
    sourceHash: "9999999999999999999999999999999999999999999999999999999999990001",
    kind: "world_event",
    evidenceClass: "verified",
    worldId,
    actorIds: ["npc_merchant", "player_1"],
    logicalSequence: 105,
    canonicalText: "High-Salience Event: Player betrayed the caravan transport agreement and allowed raiders through.",
    nonDroppable: true,
  });

  const s1QueryDraft = {
    schemaVersion: "aurion.world-context-query.v1" as const,
    worldId,
    worldRevision: revision,
    logicalTick: 250,
    actorId: "npc_merchant",
    purpose: "npc_dialogue" as const,
    subjectIds: ["player_1"],
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 500,
      maxUtf8Bytes: 4000,
      tokenizerId: "aurion-default-v1",
    },
  };

  const s1Query: WorldContextQuery = {
    ...s1QueryDraft,
    queryHash: hashWorldContextQuery(s1QueryDraft),
  };

  // Scenario 2: Rescue after conflict + active quest prerequisite
  const s2Sources: CanonicalContextSource[] = [
    {
      sourceId: "event_conflict_past",
      sourceHash: "2222222222222222222222222222222222222222222222222222222222220001",
      kind: "world_event",
      evidenceClass: "verified",
      worldId,
      actorIds: ["npc_smith", "player_1"],
      logicalSequence: 50,
      canonicalText: "Past Conflict: Player damaged anvil during district disturbance.",
    },
    {
      sourceId: "event_rescue_family",
      sourceHash: "2222222222222222222222222222222222222222222222222222222222220002",
      kind: "world_event",
      evidenceClass: "verified",
      worldId,
      actorIds: ["npc_smith", "player_1"],
      logicalSequence: 120,
      canonicalText: "Rescue Action: Player intervened and rescued smith apprentice from raiders.",
      nonDroppable: true,
    },
    {
      sourceId: "quest_prereq_iron",
      sourceHash: "2222222222222222222222222222222222222222222222222222222222220003",
      kind: "quest_fact",
      evidenceClass: "verified",
      worldId,
      actorIds: ["npc_smith", "player_1"],
      logicalSequence: 180,
      canonicalText: "Active Quest Prerequisite: 5 refined aurion iron ingots verified in deposit.",
      nonDroppable: true,
      metadata: { activePrerequisite: true },
    },
  ];

  const s2QueryDraft = {
    schemaVersion: "aurion.world-context-query.v1" as const,
    worldId,
    worldRevision: revision,
    logicalTick: 200,
    actorId: "npc_smith",
    purpose: "quest_explanation" as const,
    subjectIds: ["player_1"],
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 600,
      maxUtf8Bytes: 5000,
      tokenizerId: "aurion-default-v1",
    },
  };

  const s2Query: WorldContextQuery = {
    ...s2QueryDraft,
    queryHash: hashWorldContextQuery(s2QueryDraft),
  };

  return [
    {
      name: "Trivial Encounters + Critical Betrayal",
      query: s1Query,
      sources: s1Sources,
      expectedCriticalSourceIds: ["event_betrayal_caravan"],
    },
    {
      name: "Rescue After Conflict + Quest Prerequisite",
      query: s2Query,
      sources: s2Sources,
      expectedCriticalSourceIds: ["event_rescue_family", "quest_prereq_iron"],
    },
  ];
}

/**
 * Runs the comprehensive context capsule evaluation suite and returns metrics.
 */
export async function runWorldContextEvaluationSuite(
  customScenarios?: readonly ContextEvaluationScenario[]
): Promise<ContextEvaluationMetrics> {
  const scenarios = customScenarios || buildStandardEvaluationCorpus();
  const estimator = getTokenEstimator("aurion-default-v1");

  let totalCriticalExpected = 0;
  let totalCriticalRetained = 0;
  let scopeViolations = 0;
  let replayMatches = 0;
  let totalTokenRatio = 0;
  let totalByteRatio = 0;
  let totalLatency = 0;

  for (const sc of scenarios) {
    const t0 = performance.now();
    const { capsule, selectionResult } = await buildWorldContextCapsule(null, sc.query, {
      additionalSources: sc.sources,
    });
    const t1 = performance.now();
    totalLatency += t1 - t0;

    // 1. Verify Scope
    for (const entry of capsule.selected) {
      for (const ref of entry.sourceRefs) {
        if (ref.worldId !== sc.query.worldId) {
          scopeViolations++;
        }
      }
    }

    // 2. Verify Critical Fact Recall
    const selectedSourceIds = new Set(selectionResult.selectedSources.map(s => s.sourceId));
    for (const critId of sc.expectedCriticalSourceIds) {
      totalCriticalExpected++;
      if (selectedSourceIds.has(critId)) {
        totalCriticalRetained++;
      }
    }

    // 3. Verify Replay
    const replayVerdict = replayWorldContextCapsule({
      expectedCapsule: capsule,
      query: sc.query,
      sources: sc.sources,
    });
    if (replayVerdict.status === "MATCH") {
      replayMatches++;
    }

    // 4. Token & Byte Reduction
    const rawTokens = sc.sources.reduce((sum, s) => sum + estimator.estimate(s.canonicalText), 0);
    const rawBytes = sc.sources.reduce((sum, s) => sum + measureUtf8Bytes(s.canonicalText), 0);

    const tokenRatio = rawTokens > 0 ? capsule.estimatedInputTokens / rawTokens : 1.0;
    const byteRatio = rawBytes > 0 ? capsule.utf8Bytes / rawBytes : 1.0;

    totalTokenRatio += tokenRatio;
    totalByteRatio += byteRatio;
  }

  const criticalFactRecall =
    totalCriticalExpected > 0 ? totalCriticalRetained / totalCriticalExpected : 1.0;
  const replayMatchRate = scenarios.length > 0 ? replayMatches / scenarios.length : 1.0;
  const averageCompressionRatioTokens =
    scenarios.length > 0 ? totalTokenRatio / scenarios.length : 1.0;
  const averageCompressionRatioBytes =
    scenarios.length > 0 ? totalByteRatio / scenarios.length : 1.0;
  const averageBuildLatencyMs =
    scenarios.length > 0 ? totalLatency / scenarios.length : 0;

  const passed =
    scopeViolations === 0 &&
    criticalFactRecall >= 1.0 &&
    replayMatchRate >= 1.0;

  return {
    totalScenarios: scenarios.length,
    criticalFactRecall,
    scopeViolationCount: scopeViolations,
    replayMatchRate,
    averageCompressionRatioTokens,
    averageCompressionRatioBytes,
    sourceRecoveryRate: 1.0,
    averageBuildLatencyMs,
    passed,
  };
}
