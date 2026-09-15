import { QuestTemplateVersion } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';

/**
 * AIM-298: Aurion Quest Template Version Registry.
 * Manages active, validated quest templates with immutable versioning and template set hashing.
 */

export const DEFAULT_SEED_TEMPLATES: QuestTemplateVersion[] = [
  {
    templateId: 'tpl_caravan_investigation',
    version: 1,
    title: 'Caravan Ambush Investigation',
    description: 'Investigate the damaged merchant caravan and restore trust in the local district.',
    prerequisiteFacts: [
      { subjectField: 'status', operator: 'eq', expectedValue: 'damaged' },
    ],
    roles: [
      { roleName: 'giver', entityType: 'npc', optional: false, predicates: [] },
      { roleName: 'victim', entityType: 'npc', optional: false, predicates: [] },
      { roleName: 'location', entityType: 'location', optional: false, predicates: [] },
    ],
    nodes: [
      {
        id: 'node_start',
        type: 'start',
        title: 'Report to Merchant',
        requirements: [],
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.caravan_investigation.start',
      },
      {
        id: 'node_investigate',
        type: 'objective',
        title: 'Inspect Damaged Cargo',
        requirements: [],
        objective: { key: 'cargo_inspected', targetValue: 3, description: 'Examine 3 cargo boxes' },
        actionsOnEnter: [],
        actionsOnExit: [
          { targetSubject: 'attackers.identified', predicate: 'status', value: true, effectType: 'assert_fact' },
        ],
        narrativeKey: 'narrative.caravan_investigation.cargo',
      },
      {
        id: 'node_end',
        type: 'end',
        title: 'Report Findings to Giver',
        requirements: [],
        actionsOnEnter: [],
        actionsOnExit: [
          { targetSubject: 'merchant_kaelen.trust.player_1', predicate: 'trust', value: 'restored', effectType: 'assert_fact' },
        ],
        narrativeKey: 'narrative.caravan_investigation.end',
      },
    ],
    edges: [
      { id: 'edge_1', fromNodeId: 'node_start', toNodeId: 'node_investigate', priority: 1 },
      { id: 'edge_2', fromNodeId: 'node_investigate', toNodeId: 'node_end', priority: 1 },
    ],
    outcomes: [
      {
        id: 'outcome_success',
        semanticFlag: 'merchant_trust_restored',
        factEffects: [
          { targetSubject: 'merchant_kaelen.trust.player_1', predicate: 'trust', value: 'restored', effectType: 'assert_fact' },
        ],
        rewards: [
          { type: 'xp', amount: 500 },
          { type: 'gold', amount: 150 },
        ],
        narrativeKey: 'narrative.caravan_investigation.outcome',
      },
    ],
    maxCompositionDepth: 10,
    active: true,
    quarantined: false,
  },
  {
    templateId: 'tpl_bandit_retaliation',
    version: 1,
    title: 'Bandit Retaliation Strike',
    description: 'Track down the ambushers and clear the trade route.',
    prerequisiteFacts: [
      { subjectField: 'status', operator: 'eq', expectedValue: true },
    ],
    roles: [
      { roleName: 'giver', entityType: 'npc', optional: false, predicates: [] },
      { roleName: 'antagonist', entityType: 'npc', optional: false, predicates: [] },
      { roleName: 'location', entityType: 'location', optional: false, predicates: [] },
    ],
    nodes: [
      {
        id: 'node_start',
        type: 'start',
        title: 'Accept Retaliation Bounty',
        requirements: [],
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.bandit_retaliation.start',
      },
      {
        id: 'node_defeat_bandits',
        type: 'objective',
        title: 'Defeat Bandit Scouts',
        requirements: [],
        objective: { key: 'bandits_defeated', targetValue: 5, description: 'Defeat 5 bandit scouts' },
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.bandit_retaliation.objective',
      },
      {
        id: 'node_end',
        type: 'end',
        title: 'Claim Retaliation Reward',
        requirements: [],
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.bandit_retaliation.end',
      },
    ],
    edges: [
      { id: 'edge_1', fromNodeId: 'node_start', toNodeId: 'node_defeat_bandits', priority: 1 },
      { id: 'edge_2', fromNodeId: 'node_defeat_bandits', toNodeId: 'node_end', priority: 1 },
    ],
    outcomes: [
      {
        id: 'outcome_success',
        semanticFlag: 'trade_route_secured',
        factEffects: [
          { targetSubject: 'area.caravan_road.danger', predicate: 'level', value: 'low', effectType: 'assert_fact' },
        ],
        rewards: [
          { type: 'xp', amount: 850 },
          { type: 'gold', amount: 300 },
        ],
        narrativeKey: 'narrative.bandit_retaliation.outcome',
      },
    ],
    maxCompositionDepth: 10,
    active: true,
    quarantined: false,
  },
];

export class QuestTemplateRegistry {
  private templates: Map<string, QuestTemplateVersion> = new Map();

  constructor(initialTemplates: QuestTemplateVersion[] = DEFAULT_SEED_TEMPLATES) {
    for (const tpl of initialTemplates) {
      this.registerTemplate(tpl);
    }
  }

  public registerTemplate(template: QuestTemplateVersion): void {
    const key = `${template.templateId}:v${template.version}`;
    this.templates.set(key, template);
  }

  public getActiveTemplates(): QuestTemplateVersion[] {
    return Array.from(this.templates.values())
      .filter(t => t.active && !t.quarantined)
      .sort((a, b) => `${a.templateId}:v${a.version}`.localeCompare(`${b.templateId}:v${b.version}`));
  }

  public getTemplate(templateId: string, version: number): QuestTemplateVersion | undefined {
    return this.templates.get(`${templateId}:v${version}`);
  }

  public getTemplateSetHash(): string {
    const active = this.getActiveTemplates();
    return computeCanonicalHash('aurion.quest.template.v1', active);
  }

  public setQuarantined(templateId: string, version: number, quarantined: boolean): boolean {
    const tpl = this.getTemplate(templateId, version);
    if (!tpl) return false;
    tpl.quarantined = quarantined;
    return true;
  }
}
