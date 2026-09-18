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
      it('requires confirmed Aurion event bindings for authored objective nodes', () => {
    const template = structuredClone(DEFAULT_SEED_TEMPLATES[0]!);
    expect(QuestValidator.validateTemplate(template).diagnostics.map(d => d.code)).toContain('OBJECTIVE_EVENT_BINDING_REQUIRED');
    const objective = template.nodes.find(node => node.type === 'objective')!.objective!;
    objective.eventBinding = { source: 'world_chunk_delta', event: 'resource_depleted', matchField: 'resourceKind', matchValue: 'ore' };
    const result = QuestValidator.validateTemplate(template);
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects duplicate, unreachable and over-bounded authored templates fail-closed', () => {
    const template = structuredClone(DEFAULT_SEED_TEMPLATES[0]!);
    const objective = template.nodes.find(node => node.type === 'objective')!.objective!;
    objective.eventBinding = { source: 'world_chunk_delta', event: 'resource_depleted', matchField: null, matchValue: null };
    template.nodes.push({ ...template.nodes[2]!, id: 'orphan_end' });
    template.outcomes[0]!.rewards[0]!.amount = 1_000_001;
    const result = QuestValidator.validateTemplate(template);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['UNREACHABLE_NODE', 'REWARD_BOUND_EXCEEDED']));
  });
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
