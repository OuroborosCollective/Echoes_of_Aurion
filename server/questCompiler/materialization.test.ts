import { describe, expect, it } from 'vitest';
import {
  compileMaterializationCommand,
  computeMaterializationIdentity,
  QuestMaterializationAuthority,
} from './materialization';
import { QuestComposer } from './composer';
import { DEFAULT_SEED_TEMPLATES, QuestTemplateRegistry } from './templateRegistry';
import { QuestPersistenceEngine } from './persistence';
import { WorldFactEngine } from './worldFacts';
import { QuestInstance } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';

function createMockInstance(plan: any, overrides?: Partial<QuestInstance>): QuestInstance {
  return {
    id: 'inst_test_mat_1',
    worldId: 'world_prime',
    playerUserId: 42,
    giverNpcId: 'npc_merchant_kaelen',
    templateId: plan.templateId,
    templateVersion: plan.templateVersion,
    seedDigest: 'seed_digest_mat_1',
    planHash: plan.planHash,
    graphHash: plan.graphHash,
    currentNodeId: 'node_end',
    completedNodeIds: ['node_start', 'node_investigate_cargo'],
    boundRoles: plan.boundRoles,
    state: 'active',
    objectiveProgress: { cargo_inspected: true },
    createdAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:05:00.000Z',
    ...overrides,
  };
}

describe('Quest Materialization Engine (AIM-298 / #459 / #460)', () => {
  const template = DEFAULT_SEED_TEMPLATES[0]!;
  const plan = QuestComposer.composePlan({
    template,
    templateSetHash: 'hash_tpl_set_1',
    candidateSetHash: 'hash_cand_set_1',
    seedDigest: 'seed_digest_mat_1',
    boundRoles: [
      { roleName: 'giver', entityId: 'npc_merchant_kaelen', entityType: 'npc' },
      { roleName: 'victim', entityId: 'npc_caravan_driver', entityType: 'npc' },
    ],
    roleBindingHash: 'hash_roles_1',
  });

  it('compiles deterministic materialization identity and domain command', () => {
    const instance = createMockInstance(plan);
    const cmd1 = compileMaterializationCommand({ instance, plan });
    const cmd2 = compileMaterializationCommand({ instance, plan });

    expect(cmd1.commandId).toBe(cmd2.commandId);
    expect(cmd1.effectsDigest).toBe(cmd2.effectsDigest);
    expect(cmd1.schemaVersion).toBe('aurion.quest.materialization-command.v1');
    expect(cmd1.effects.length).toBeGreaterThan(0);
    expect(cmd1.effects.some(e => e.kind === 'GRANT_XP')).toBe(true);
    expect(cmd1.effects.some(e => e.kind === 'EMIT_WORLD_EVENT')).toBe(true);
  });

  it('rejects materialization for inactive or non-active instance fail-closed', () => {
    const instance = createMockInstance(plan, { state: 'completed' });
    expect(() => compileMaterializationCommand({ instance, plan })).toThrow(/CANNOT_MATERIALIZE_QUEST_IN_STATE/);
  });

  it('rejects malformed plan with missing outcome fail-closed', () => {
    const malformedPlan = { ...plan, outcomes: [] };
    const instance = createMockInstance(malformedPlan);
    expect(() => compileMaterializationCommand({ instance, plan: malformedPlan as any })).toThrow(/QUEST_PLAN_VALIDATION_FAILED/);
  });

  it('rejects undeclared effects fail-closed', () => {
    const malformedPlan = structuredClone(plan);
    (malformedPlan.outcomes[0]!.rewards[0] as any).type = 'cosmic_super_power';
    const instance = createMockInstance(malformedPlan);
    expect(() => compileMaterializationCommand({ instance, plan: malformedPlan })).toThrow(/QUEST_PLAN_VALIDATION_FAILED/);
  });

  it('executes materialization and yields an immutable receipt', async () => {
    const persistence = new QuestPersistenceEngine();
    const worldFacts = new WorldFactEngine();
    const authority = new QuestMaterializationAuthority(persistence, worldFacts);

    const instance = createMockInstance(plan);
    await persistence.savePlan(plan);
    await persistence.saveInstance(instance);

    const command = compileMaterializationCommand({ instance, plan });
    const receipt = await authority.executeMaterialization(command);

    expect(receipt.replayed).toBe(false);
    expect(receipt.instanceId).toBe(instance.id);
    expect(receipt.commandId).toBe(command.commandId);
    expect(receipt.effectsDigest).toBe(command.effectsDigest);

    // Verify instance state updated to completed
    const updated = await persistence.getInstance(instance.id);
    expect(updated?.state).toBe('completed');
  });

  it('handles exact duplicate materialization idempotently returning the existing receipt', async () => {
    const persistence = new QuestPersistenceEngine();
    const worldFacts = new WorldFactEngine();
    const authority = new QuestMaterializationAuthority(persistence, worldFacts);

    const instance = createMockInstance(plan);
    await persistence.savePlan(plan);
    await persistence.saveInstance(instance);

    const command = compileMaterializationCommand({ instance, plan });
    const receipt1 = await authority.executeMaterialization(command);
    expect(receipt1.replayed).toBe(false);

    // Exact duplicate attempt
    const receipt2 = await authority.executeMaterialization(command);
    expect(receipt2.replayed).toBe(true);
    expect(receipt2.receiptId).toBe(receipt1.receiptId);
  });

  it('rejects conflicting reuse of an idempotency key fail-closed', async () => {
    const persistence = new QuestPersistenceEngine();
    const worldFacts = new WorldFactEngine();
    const authority = new QuestMaterializationAuthority(persistence, worldFacts);

    const instance = createMockInstance(plan);
    await persistence.savePlan(plan);
    await persistence.saveInstance(instance);

    const command1 = compileMaterializationCommand({ instance, plan });
    await authority.executeMaterialization(command1);

    // Conflicting command with same idempotency key but different instance
    const conflictingCommand = {
      ...command1,
      instanceId: 'inst_different',
    };

    await expect(authority.executeMaterialization(conflictingCommand as any)).rejects.toThrow(/QUEST_RECEIPT_IDEMPOTENCY_CONFLICT/);
  });

  it('rejects stale expected state hash fail-closed', async () => {
    const persistence = new QuestPersistenceEngine();
    const worldFacts = new WorldFactEngine();
    const authority = new QuestMaterializationAuthority(persistence, worldFacts);

    const instance = createMockInstance(plan);
    await persistence.savePlan(plan);
    await persistence.saveInstance(instance);

    const command = compileMaterializationCommand({ instance, plan });
    const staleCommand = {
      ...command,
      expectedStateHash: 'stale_hash_0000000000000000000000000000000000000000000000000000000000000000',
    };

    await expect(authority.executeMaterialization(staleCommand)).rejects.toThrow(/QUEST_RUNTIME_STALE_STATE/);
  });
});
