import { describe, expect, it } from 'vitest';
import { QuestValidator } from './validator';
import { QuestComposer } from './composer';
import { DEFAULT_SEED_TEMPLATES } from './templateRegistry';

describe('QuestValidator (AIM-298)', () => {
  it('validates a well-formed QuestPlan successfully', () => {
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

    const result = QuestValidator.validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects a plan with unreachable nodes fail-closed', () => {
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

    // Remove connecting edge to make end node unreachable
    plan.edges = [];
    const result = QuestValidator.validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNREACHABLE_NODE')).toBe(true);
  });
});
