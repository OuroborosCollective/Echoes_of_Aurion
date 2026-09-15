import { QuestTemplateVersion, WorldFact } from '../../shared/aurionQuestContract';
import { computeCanonicalHash, computeSeedDigest } from '../../shared/aurionQuestCanonicalHash';

/**
 * AIM-298: Aurion Quest Candidate Resolver.
 * Filters eligible templates deterministically based on world facts and stable seed digests.
 */
export class CandidateResolver {
  public static evaluateEligibility(
    template: QuestTemplateVersion,
    facts: WorldFact[]
  ): boolean {
    if (!template.active || template.quarantined) return false;
    if (template.prerequisiteFacts.length === 0) return true;

    for (const prereq of template.prerequisiteFacts) {
      const matchingFact = facts.find(
        f => f.predicate === prereq.subjectField || f.subject.includes(prereq.subjectField)
      );

      if (!matchingFact) return false;

      if (prereq.operator === 'eq' && matchingFact.value !== prereq.expectedValue) {
        return false;
      }
      if (prereq.operator === 'neq' && matchingFact.value === prereq.expectedValue) {
        return false;
      }
    }

    return true;
  }

  public static resolveCandidates(
    templates: QuestTemplateVersion[],
    facts: WorldFact[]
  ): { eligibleTemplates: QuestTemplateVersion[]; candidateSetHash: string } {
    const eligible = templates
      .filter(t => this.evaluateEligibility(t, facts))
      .sort((a, b) => `${a.templateId}:v${a.version}`.localeCompare(`${b.templateId}:v${b.version}`));

    const candidateSetHash = computeCanonicalHash('aurion.quest.template.v1', eligible);
    return { eligibleTemplates: eligible, candidateSetHash };
  }

  public static selectWinningTemplate(
    eligibleTemplates: QuestTemplateVersion[],
    seedDigest: string
  ): QuestTemplateVersion | null {
    if (eligibleTemplates.length === 0) return null;

    // Convert hex seed digest into a deterministic index offset
    const seedInt = parseInt(seedDigest.slice(0, 8), 16);
    const winningIndex = seedInt % eligibleTemplates.length;
    return eligibleTemplates[winningIndex]!;
  }
}
