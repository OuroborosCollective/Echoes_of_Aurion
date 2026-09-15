import { BoundRole, QuestPlan } from '../../shared/aurionQuestContract';

/**
 * AIM-298: Aurion Narrative Presentation Adapter.
 * Resolves presentation story keys and bound role labels for display in the UI / Ink / Yarn Spinner formats.
 * Enforces zero authority mutation: narrative presentation never alters gameplay truth.
 */
export class NarrativeAdapter {
  private static NARRATIVE_DICTIONARY: Record<string, string> = {
    'narrative.caravan_investigation.start': 'Greetings, traveler. Bandit raiders ambushed our trade caravan along the southern pass. I need you to inspect the damaged cargo and identify who was behind the attack.',
    'narrative.caravan_investigation.cargo': 'Examine the scattered crate remains near the crossroads to uncover evidence of the raiders.',
    'narrative.caravan_investigation.end': 'Return to Merchant Kaelen with your findings to restore confidence in district trade safety.',
    'narrative.caravan_investigation.outcome': 'Merchant Kaelelen trusts your vigilance. The road remains guarded.',
    'narrative.bandit_retaliation.start': 'Scout Elena reported bandit scouts massing near the ravine. Lead a retaliation strike to clear the route.',
    'narrative.bandit_retaliation.objective': 'Defeat the bandit scouts operating near the hideout entrance.',
    'narrative.bandit_retaliation.end': 'Claim your bounty from Scout Elena.',
    'narrative.bandit_retaliation.outcome': 'The raider presence has been neutralized.',
  };

  public static renderNarrativeText(narrativeKey?: string, boundRoles: BoundRole[] = []): string {
    if (!narrativeKey) return '';
    let text = this.NARRATIVE_DICTIONARY[narrativeKey] || `[Narrative: ${narrativeKey}]`;

    // Substitute role parameters safely
    for (const role of boundRoles) {
      if (role.entityName) {
        text = text.replace(new RegExp(`{${role.roleName}}`, 'g'), role.entityName);
      }
    }

    return text;
  }

  public static formatPlanForPresentation(plan: QuestPlan): {
    title: string;
    description: string;
    nodesNarrative: Array<{ nodeId: string; title: string; text: string }>;
  } {
    const nodesNarrative = plan.nodes.map(node => ({
      nodeId: node.id,
      title: node.title,
      text: this.renderNarrativeText(node.narrativeKey, plan.boundRoles),
    }));

    return {
      title: plan.templateId,
      description: `Version ${plan.templateVersion} — Plan Hash ${plan.planHash.slice(0, 10)}`,
      nodesNarrative,
    };
  }
}
