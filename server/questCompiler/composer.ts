import { BoundRole, QuestPlan, QuestTemplateVersion } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';

/**
 * AIM-298: Aurion Quest Compiler & Composer.
 * Composes a bounded directed QuestGraph / QuestPlan from atomic template nodes, edges, and bound roles.
 */
export class QuestComposer {
  public static composePlan(params: {
    template: QuestTemplateVersion;
    templateSetHash: string;
    candidateSetHash: string;
    seedDigest: string;
    boundRoles: BoundRole[];
    roleBindingHash: string;
  }): QuestPlan {
    const { template, templateSetHash, candidateSetHash, seedDigest, boundRoles, roleBindingHash } = params;

    const graphPayload = {
      templateId: template.templateId,
      templateVersion: template.version,
      boundRoles,
      nodes: template.nodes,
      edges: template.edges,
      outcomes: template.outcomes,
    };

    const graphHash = computeCanonicalHash('aurion.quest.plan.v1', graphPayload);
    const planHash = computeCanonicalHash('aurion.quest.plan.v1', {
      ...graphPayload,
      templateSetHash,
      candidateSetHash,
      seedDigest,
      roleBindingHash,
      graphHash,
    });

    return {
      templateId: template.templateId,
      templateVersion: template.version,
      templateSetHash,
      candidateSetHash,
      seedDigest,
      roleBindingHash,
      planHash,
      graphHash,
      boundRoles,
      nodes: template.nodes,
      edges: template.edges,
      outcomes: template.outcomes,
    };
  }
}
