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
      triggerEventId: 'trig_replay',
      compilerVersion: '1.0.0',
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

    if (facts === null) {
      return finish(
        replayUnprovable(context, verified, 'QUEST_WORLD_FACT_EVIDENCE_MISSING'),
        'UNPROVABLE',
        plan.graphHash,
        'UNPROVABLE',
      );
    }

    const { eligibleTemplates, candidateSetHash } = CandidateResolver.resolveCandidates(activeTemplates, facts);
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

    const outcomeHash = computeCanonicalHash('aurion.quest.replay.v1', replayedPlan.outcomes);
    return finish(
      replayMatch(context, verified),
      replayedPlan.planHash,
      replayedPlan.graphHash,
      outcomeHash,
    );
  }
}
