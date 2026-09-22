import { QuestTemplateVersion } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';

export const BASE_DEFAULT_SEED_TEMPLATES: QuestTemplateVersion[] = [
  {
    templateId: 'tpl_caravan_investigation',
    version: 1,
    title: 'Investigate the Shattered Caravan',
    description: 'A merchant caravan was ambushed on the northern road. Investigate the wreckage and recover the cargo manifest.',
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
        title: 'Speak with Merchant Kaelen',
        requirements: [],
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.caravan_investigation.start',
      },
      {
        id: 'node_crates',
        type: 'objective',
        title: 'Recover Caravan Crates',
        requirements: [],
        objective: { key: 'recover_crates', targetValue: 3, description: 'Examine the shattered cart and recover the supply crates' },
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.caravan_investigation.crates',
      },
      {
        id: 'node_end',
        type: 'end',
        title: 'Return to Merchant Kaelen',
        requirements: [],
        actionsOnEnter: [],
        actionsOnExit: [],
        narrativeKey: 'narrative.caravan_investigation.end',
      },
    ],
    edges: [
      { id: 'edge_1', fromNodeId: 'node_start', toNodeId: 'node_crates', priority: 1 },
      { id: 'edge_2', fromNodeId: 'node_crates', toNodeId: 'node_end', priority: 1 },
    ],
    outcomes: [
      {
        id: 'outcome_success',
        semanticFlag: 'caravan_ambush_investigated',
        factEffects: [
          { targetSubject: 'attackers.identified', predicate: 'status', value: true, effectType: 'assert_fact' },
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

const GAMEPLAY_QUEST_DEFINITIONS: Array<{
  key: string;
  title: string;
  description: string;
  giver: string;
}> = [
  { key: 'astral_call', title: 'Der Ruf der Sternwarte', description: 'Besiege den Asterion-Sentinel und bringe Lyra einen Resonanzsplitter.', giver: 'npc_lyra' },
  { key: 'archive_of_echoes', title: 'Das Archiv der Echos', description: 'Sichere die versunkene Archivhalle und entschlüssele die Echo-Tafel.', giver: 'npc_orun' },
  { key: 'ember_key', title: 'Schlüssel aus der letzten Flamme', description: 'Stabilisiere das Solarium. Der Glutschlüssel öffnet den ersten Dungeon.', giver: 'npc_lyra' },
  { key: 'starfall_resonance', title: 'Resonanz des Sternenfalls', description: 'Untersuche den Einschlagkrater und besiege den Sternenfall-Wächter.', giver: 'npc_lyra' },
  { key: 'clockwork_core', title: 'Das Herz des Uhrwerks', description: 'Dringe in die Clockwork Woods ein und besiege den Rootgear Foundry-Kernwächter.', giver: 'npc_orun' },
  { key: 'sunwatch_vanguard', title: 'Vorhut der Sonnenwacht', description: 'Errichte einen Vorposten in der Sonnenwacht-Bastion und sichere das Gebiet.', giver: 'npc_orun' },
];

export const GAMEPLAY_SEED_TEMPLATES: QuestTemplateVersion[] = GAMEPLAY_QUEST_DEFINITIONS.map(def => ({
  templateId: `tpl_${def.key}`,
  version: 1,
  title: def.title,
  description: def.description,
  prerequisiteFacts: [
    { subjectField: 'gameplayQuestKey', operator: 'eq', expectedValue: def.key },
  ],
  roles: [
    { roleName: 'giver', entityType: 'npc', optional: false, predicates: [{ subjectField: 'id', operator: 'eq', expectedValue: def.giver }] },
    { roleName: 'location', entityType: 'location', optional: false, predicates: [] },
  ],
  nodes: [
    {
      id: 'node_start',
      type: 'start',
      title: `Start: ${def.title}`,
      requirements: [],
      actionsOnEnter: [],
      actionsOnExit: [],
      narrativeKey: `narrative.gameplay.${def.key}.start`,
    },
    {
      id: 'node_objective',
      type: 'objective',
      title: def.title,
      requirements: [],
      objective: { key: `${def.key}_objective`, targetValue: 1, description: def.description },
      actionsOnEnter: [],
      actionsOnExit: [],
      narrativeKey: `narrative.gameplay.${def.key}.objective`,
    },
    {
      id: 'node_end',
      type: 'end',
      title: `Turn In: ${def.title}`,
      requirements: [],
      actionsOnEnter: [],
      actionsOnExit: [],
      narrativeKey: `narrative.gameplay.${def.key}.end`,
    },
  ],
  edges: [
    { id: 'edge_start_obj', fromNodeId: 'node_start', toNodeId: 'node_objective', priority: 1 },
    { id: 'edge_obj_end', fromNodeId: 'node_objective', toNodeId: 'node_end', priority: 1 },
  ],
  outcomes: [
    {
      id: `outcome_${def.key}`,
      semanticFlag: `gameplay_quest_${def.key}_completed`,
      factEffects: [
        { targetSubject: `quest.${def.key}.completed`, predicate: 'completed', value: true, effectType: 'assert_fact' },
      ],
      rewards: [
        { type: 'xp', amount: 200 },
      ],
      narrativeKey: `narrative.gameplay.${def.key}.outcome`,
    },
  ],
  maxCompositionDepth: 10,
  active: true,
  quarantined: false,
}));

export const DEFAULT_SEED_TEMPLATES: QuestTemplateVersion[] = [
  ...BASE_DEFAULT_SEED_TEMPLATES,
  ...GAMEPLAY_SEED_TEMPLATES,
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
    const active = Array.from(this.templates.values())
      .filter(t => t.active && !t.quarantined);

    const latestByTemplateId = new Map<string, QuestTemplateVersion>();
    for (const tpl of active) {
      const existing = latestByTemplateId.get(tpl.templateId);
      if (!existing || tpl.version > existing.version) {
        latestByTemplateId.set(tpl.templateId, tpl);
      }
    }

    return Array.from(latestByTemplateId.values())
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
