import {
  QuestInstance,
  QuestPlan,
  QuestReplayReceipt,
  QuestReplayReceiptSchema,
  WorldFact,
} from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';
import {
  replayFirstDivergence,
  replayMatch,
  replayUnprovable,
  type ReplayVerdict,
  type ReplayVerdictContext,
} from '../../shared/aurionReplayContract';
import { OperationalClock, hostOperationalClock, operationalDate } from '../../shared/operationalClock';
import { activeProvenance } from '../aurionProvenance';
import { CandidateResolver } from './candidateResolver';
import { RoleResolver } from './roleResolver';
import { QuestComposer } from './composer';
import { QuestTemplateRegistry } from './templateRegistry';

export const AURION_QUEST_REPLAY_RULESET = 'aurion.quest.compiler.v1' as const;

function latestFactSequence(facts: readonly WorldFact[]): number {
  return facts.reduce((max, fact) => Math.max(max, fact.provenance.sequence), 0);
}

/**
 * AIM-298: Aurion Quest Replay & Causality Verification Engine.
 * All replay domains emit the shared fail-closed ReplayVerdict semantics.
 */
export class QuestReplayEngine {
  constructor(
    private templateRegistry: QuestTemplateRegistry,
    private clock: OperationalClock = hostOperationalClock
  ) {}

  public replayInstance(
    instance: QuestInstance,
    plan: QuestPlan,
    facts: WorldFact[] | null,
    expectedPlanHash: string,
    worldStateSequence?: number,
    options?: { receipts?: QuestReceipt[] }
  ): QuestReplayReceipt {
    const replayTimestamp = operationalDate(this.clock).toISOString();
    const sequence = worldStateSequence ?? (facts ? latestFactSequence(facts) : 0);
    const activeTemplates = this.templateRegistry.getActiveTemplates();
    const templateSetHash = this.templateRegistry.getTemplateSetHash();
    const context: ReplayVerdictContext = {
      domain: 'QUEST_COMPILER',
      sourceRevision: activeProvenance.sourceRevision,
      rulesetVersion: AURION_QUEST_REPLAY_RULESET,
      scopeIdentity: { worldId: instance.worldId, instanceId: instance.id },
      range: { fromSequence: sequence, toSequence: sequence },
    };
    const verified: string[] = [];

    const sourceTuple = {
      worldId: instance.worldId,
      worldStateRevision: sequence,
      triggerEventId: instance.triggerEventId || 'trig_replay',
      compilerVersion: instance.compilerVersion || '1.0.0',
      templateSetHash,
      candidateSetHash: plan.candidateSetHash,
      seedDigest: instance.seedDigest,
      roleBindingHash: plan.roleBindingHash,
      expectedPlanHash,
    };

    const finish = (
      replayVerdict: ReplayVerdict,
      replayedPlanHash: string,
      replayedGraphHash: string,
      replayedOutcomeHash: string,
    ): QuestReplayReceipt => QuestReplayReceiptSchema.parse({
      instanceId: instance.id,
      sourceTuple,
      replayedPlanHash,
      replayedGraphHash,
      replayedOutcomeHash,
      replayVerdict,
      verdict: replayVerdict.status,
      firstDivergenceDetails:
        replayVerdict.status === 'FIRST_DIVERGENCE'
          ? replayVerdict.diffDetails ?? `${replayVerdict.firstDivergentStage}: expected ${replayVerdict.expected}, got ${replayVerdict.observed}`
          : undefined,
      timestamp: replayTimestamp,
    });

    // Stage 1: SOURCE_SCOPE
    if (!instance.worldId || instance.worldId.trim().length === 0) {
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'SOURCE_SCOPE',
        expected: 'valid_world_id',
        observed: String(instance.worldId),
        diffDetails: 'Missing or empty worldId in source instance',
      });
      return finish(replayVerdict, 'DIVERGED_AT_SOURCE_SCOPE', plan.graphHash, 'N/A');
    }

    if (facts === null) {
      return finish(
        replayUnprovable(context, verified, 'QUEST_WORLD_FACT_EVIDENCE_MISSING'),
        'UNPROVABLE',
        plan.graphHash,
        'UNPROVABLE',
      );
    }
    verified.push('SOURCE_SCOPE');

    // Stage 2: TEMPLATE_SET
    if (plan.templateSetHash && templateSetHash !== plan.templateSetHash) {
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'TEMPLATE_SET',
        expected: plan.templateSetHash,
        observed: templateSetHash,
        expectedHash: plan.templateSetHash,
        observedHash: templateSetHash,
        diffDetails: `TemplateSetHash divergence: expected ${plan.templateSetHash}, got ${templateSetHash}`,
      });
      return finish(replayVerdict, 'DIVERGED_AT_TEMPLATE_SET', plan.graphHash, 'N/A');
    }
    verified.push('TEMPLATE_SET');

    // Stage 3: CANDIDATE_SET
    let { eligibleTemplates, candidateSetHash } = CandidateResolver.resolveCandidates(activeTemplates, facts);
    if (candidateSetHash !== plan.candidateSetHash && instance.templateId) {
      const scopedPool = activeTemplates.filter(t => t.templateId === instance.templateId);
      const scoped = CandidateResolver.resolveCandidates(scopedPool, facts);
      if (scoped.candidateSetHash === plan.candidateSetHash) {
        eligibleTemplates = scoped.eligibleTemplates;
        candidateSetHash = scoped.candidateSetHash;
      }
    }
    if (candidateSetHash !== plan.candidateSetHash) {
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'CANDIDATE_SET',
        expected: plan.candidateSetHash,
        observed: candidateSetHash,
        expectedHash: plan.candidateSetHash,
        observedHash: candidateSetHash,
        diffDetails: `CandidateSetHash divergence: expected ${plan.candidateSetHash}, got ${candidateSetHash}`,
      });
      return finish(replayVerdict, 'DIVERGED_AT_CANDIDATE_SET', plan.graphHash, 'N/A');
    }
    verified.push('CANDIDATE_SET');

    // Stage 4: TEMPLATE_SELECTION
    const winningTemplate = CandidateResolver.selectWinningTemplate(eligibleTemplates, instance.seedDigest);
    if (!winningTemplate || winningTemplate.templateId !== instance.templateId) {
      const observed = winningTemplate?.templateId ?? 'MISSING';
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'TEMPLATE_SELECTION',
        expected: instance.templateId,
        observed,
        diffDetails: `Winning template divergence: expected ${instance.templateId}, got ${observed}`,
      });
      return finish(replayVerdict, 'DIVERGED_AT_TEMPLATE_SELECTION', plan.graphHash, 'N/A');
    }
    verified.push('TEMPLATE_SELECTION');

    // Stage 5: SEED_DIGEST
    if (!instance.seedDigest || instance.seedDigest.length < 8) {
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'SEED_DIGEST',
        expected: 'valid_seed_digest_hex',
        observed: String(instance.seedDigest),
        diffDetails: 'Invalid or missing seed digest',
      });
      return finish(replayVerdict, 'DIVERGED_AT_SEED_DIGEST', plan.graphHash, 'N/A');
    }
    verified.push('SEED_DIGEST');

    // Stage 6: ROLE_BINDING
    const { boundRoles, roleBindingHash } = RoleResolver.resolveRoles(winningTemplate.roles, undefined, instance.giverNpcId);
    if (roleBindingHash !== plan.roleBindingHash) {
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'ROLE_BINDING',
        expected: plan.roleBindingHash,
        observed: roleBindingHash,
        expectedHash: plan.roleBindingHash,
        observedHash: roleBindingHash,
        diffDetails: `RoleBindingHash divergence: expected ${plan.roleBindingHash}, got ${roleBindingHash}`,
      });
      return finish(replayVerdict, 'DIVERGED_AT_ROLE_BINDING', plan.graphHash, 'N/A');
    }
    verified.push('ROLE_BINDING');

    // Stage 7: PLAN_HASH
    const replayedPlan = QuestComposer.composePlan({
      template: winningTemplate,
      templateSetHash,
      candidateSetHash,
      seedDigest: instance.seedDigest,
      boundRoles,
      roleBindingHash,
    });

    if (replayedPlan.planHash !== expectedPlanHash) {
      const outcomeHash = computeCanonicalHash('aurion.quest.replay.v1', replayedPlan.outcomes);
      const replayVerdict = replayFirstDivergence(context, verified, {
        stage: 'PLAN_HASH',
        expected: expectedPlanHash,
        observed: replayedPlan.planHash,
        expectedHash: expectedPlanHash,
        observedHash: replayedPlan.planHash,
        diffDetails: `PlanHash divergence: expected ${expectedPlanHash}, got ${replayedPlan.planHash}`,
      });
      return finish(replayVerdict, replayedPlan.planHash, replayedPlan.graphHash, outcomeHash);
    }
    verified.push('PLAN_HASH');

    // Stage 8: RUNTIME_EVENTS (if receipts provided)
    if (options?.receipts && options.receipts.length > 0) {
      for (let i = 0; i < options.receipts.length; i++) {
        const rcpt = options.receipts[i]!;
        const expectedSeq = i + 1;
        if (rcpt.eventSequence !== expectedSeq) {
          const replayVerdict = replayFirstDivergence(context, verified, {
            stage: 'RUNTIME_EVENTS',
            expected: String(expectedSeq),
            observed: String(rcpt.eventSequence),
            diffDetails: `EventSequence mismatch: expected ${expectedSeq}, got ${rcpt.eventSequence}`,
          });
          return finish(replayVerdict, replayedPlan.planHash, replayedPlan.graphHash, 'DIVERGED_AT_RUNTIME_EVENTS');
        }
        if (i > 0) {
          const prev = options.receipts[i - 1]!;
          if (rcpt.previousStateHash !== prev.resultStateHash) {
            const replayVerdict = replayFirstDivergence(context, verified, {
              stage: 'RUNTIME_EVENTS',
              expected: prev.resultStateHash,
              observed: rcpt.previousStateHash,
              diffDetails: `State hash chain break: expected ${prev.resultStateHash}, got ${rcpt.previousStateHash}`,
            });
            return finish(replayVerdict, replayedPlan.planHash, replayedPlan.graphHash, 'DIVERGED_AT_RUNTIME_EVENTS');
          }
        }
      }
      verified.push('RUNTIME_EVENTS');
    }

    // Stage 9: SEMANTIC_OUTCOME
    const outcomeHash = computeCanonicalHash('aurion.quest.replay.v1', replayedPlan.outcomes);
    verified.push('SEMANTIC_OUTCOME');

    return finish(
      replayMatch(context, verified),
      replayedPlan.planHash,
      replayedPlan.graphHash,
      outcomeHash,
    );
  }
}
