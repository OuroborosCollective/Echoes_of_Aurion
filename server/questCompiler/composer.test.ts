import { describe, expect, it } from 'vitest';
import { QuestComposer } from './composer';
import { DEFAULT_SEED_TEMPLATES } from './templateRegistry';

describe('QuestComposer (AIM-298)', () => {
  it('composes a valid QuestPlan and generates domain-separated hashes', () => {
    const template = DEFAULT_SEED_TEMPLATES[0]!;
    const plan = QuestComposer.composePlan({
      template,
      templateSetHash: 'hash_tpl_set_1',
      candidateSetHash: 'hash_cand_set_1',
      seedDigest: 'seed_digest_1',
      boundRoles: [
        { roleName: 'giver', entityId: 'npc_merchant_kaelen', entityType: 'npc' },
      ],
      roleBindingHash: 'hash_roles_1',
    });

    expect(plan.templateId).toBe('tpl_caravan_investigation');
    expect(plan.planHash).toBeTruthy();
    expect(plan.graphHash).toBeTruthy();
    expect(plan.nodes.length).toBeGreaterThan(0);
  });
});
