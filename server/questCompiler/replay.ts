import { QuestInstance, QuestPlan, QuestReplayReceipt, WorldFact } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';
import { CandidateResolver } from './candidateResolver';
import { RoleResolver } from './roleResolver';
import { QuestComposer } from './composer';
import { QuestTemplateRegistry } from './templateRegistry';

/**
 * AIM-298: Aurion Quest Replay & Causality Verification Engine.
 * Given source input tuples, reproduces candidate set, seed digest, role binding, and plan/graph hashes.
 * Returns MATCH, FIRST_DIVERGENCE, or UNPROVABLE.
 */
export class QuestReplayEngine {
  constructor(private templateRegistry: QuestTemplateRegistry) {}

  public replayInstance(
    instance: QuestInstance,
    plan: QuestPlan,
    facts: WorldFact[],
    expectedPlanHash: string
  ): QuestReplayReceipt {
    const activeTemplates = this.templateRegistry.getActiveTemplates();
    const templateSetHash = this.templateRegistry.getTemplateSetHash();

    // 1. Re-evaluate candidate resolution
    const { eligibleTemplates, candidateSetHash } = CandidateResolver.resolveCandidates(activeTemplates, facts);
    if (candidateSetHash !== plan.candidateSetHash) {
      return {
        instanceId: instance.id,
        sourceTuple: {
          worldId: instance.worldId,
          worldStateRevision: 1,
          triggerEventId: 'trig_replay',
          compilerVersion: '1.0.0',
          templateSetHash,
          candidateSetHash: plan.candidateSetHash,
          seedDigest: instance.seedDigest,
          roleBindingHash: plan.roleBindingHash,
          expectedPlanHash,
        },
        replayedPlanHash: 'DIVERGED_AT_CANDIDATE_SET',
        replayedGraphHash: plan.graphHash,
        replayedOutcomeHash: 'N/A',
        verdict: 'FIRST_DIVERGENCE',
        firstDivergenceDetails: `CandidateSetHash divergence: expected ${plan.candidateSetHash}, got ${candidateSetHash}`,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Re-select template
    const winningTemplate = CandidateResolver.selectWinningTemplate(eligibleTemplates, instance.seedDigest);
    if (!winningTemplate || winningTemplate.templateId !== instance.templateId) {
      return {
        instanceId: instance.id,
        sourceTuple: {
          worldId: instance.worldId,
          worldStateRevision: 1,
          triggerEventId: 'trig_replay',
          compilerVersion: '1.0.0',
          templateSetHash,
          candidateSetHash,
          seedDigest: instance.seedDigest,
          roleBindingHash: plan.roleBindingHash,
          expectedPlanHash,
        },
        replayedPlanHash: 'DIVERGED_AT_TEMPLATE_SELECTION',
        replayedGraphHash: plan.graphHash,
        replayedOutcomeHash: 'N/A',
        verdict: 'FIRST_DIVERGENCE',
        firstDivergenceDetails: `Winning template divergence: expected ${instance.templateId}, got ${winningTemplate?.templateId}`,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Re-resolve roles
    const { boundRoles, roleBindingHash } = RoleResolver.resolveRoles(winningTemplate.roles, undefined, instance.giverNpcId);
    if (roleBindingHash !== plan.roleBindingHash) {
      return {
        instanceId: instance.id,
        sourceTuple: {
          worldId: instance.worldId,
          worldStateRevision: 1,
          triggerEventId: 'trig_replay',
          compilerVersion: '1.0.0',
          templateSetHash,
          candidateSetHash,
          seedDigest: instance.seedDigest,
          roleBindingHash: plan.roleBindingHash,
          expectedPlanHash,
        },
        replayedPlanHash: 'DIVERGED_AT_ROLE_BINDING',
        replayedGraphHash: plan.graphHash,
        replayedOutcomeHash: 'N/A',
        verdict: 'FIRST_DIVERGENCE',
        firstDivergenceDetails: `RoleBindingHash divergence: expected ${plan.roleBindingHash}, got ${roleBindingHash}`,
        timestamp: new Date().toISOString(),
      };
    }

    // 4. Re-compose plan
    const replayedPlan = QuestComposer.composePlan({
      template: winningTemplate,
      templateSetHash,
      candidateSetHash,
      seedDigest: instance.seedDigest,
      boundRoles,
      roleBindingHash,
    });

    if (replayedPlan.planHash !== expectedPlanHash) {
      return {
        instanceId: instance.id,
        sourceTuple: {
          worldId: instance.worldId,
          worldStateRevision: 1,
          triggerEventId: 'trig_replay',
          compilerVersion: '1.0.0',
          templateSetHash,
          candidateSetHash,
          seedDigest: instance.seedDigest,
          roleBindingHash,
          expectedPlanHash,
        },
        replayedPlanHash: replayedPlan.planHash,
        replayedGraphHash: replayedPlan.graphHash,
        replayedOutcomeHash: computeCanonicalHash('aurion.quest.replay.v1', replayedPlan.outcomes),
        verdict: 'FIRST_DIVERGENCE',
        firstDivergenceDetails: `PlanHash divergence: expected ${expectedPlanHash}, got ${replayedPlan.planHash}`,
        timestamp: new Date().toISOString(),
      };
    }

    const outcomeHash = computeCanonicalHash('aurion.quest.replay.v1', replayedPlan.outcomes);

    return {
      instanceId: instance.id,
      sourceTuple: {
        worldId: instance.worldId,
        worldStateRevision: 1,
        triggerEventId: 'trig_replay',
        compilerVersion: '1.0.0',
        templateSetHash,
        candidateSetHash,
        seedDigest: instance.seedDigest,
        roleBindingHash,
        expectedPlanHash,
      },
      replayedPlanHash: replayedPlan.planHash,
      replayedGraphHash: replayedPlan.graphHash,
      replayedOutcomeHash: outcomeHash,
      verdict: 'MATCH',
      timestamp: new Date().toISOString(),
    };
  }
}
