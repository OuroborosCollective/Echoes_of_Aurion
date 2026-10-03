import { describe, expect, it } from 'vitest';
import { fixedOperationalClock, operationalDate } from '../../shared/operationalClock';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestRuntimeEngine } from './runtime';

describe('QuestRuntimeEngine temporal determinism and receipt identity (AIM-298)', () => {
  const fixedEpoch = 1_750_000_000_000;
  const expectedIso = new Date(fixedEpoch).toISOString();

  function setupEngines(epochMs: number = fixedEpoch) {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: 'evt_init',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });

    const registry = new QuestTemplateRegistry();
    const clock = fixedOperationalClock(epochMs);
    const runtime = new QuestRuntimeEngine(factEngine, registry, clock);

    return { factEngine, registry, runtime, clock };
  }

  it('samples OperationalClock once per operation across offer, accept, progress, complete', () => {
    const { runtime } = setupEngines(fixedEpoch);

    // 1. Offer
    const { instance: offeredInstance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    expect(offeredInstance.createdAt).toBe(expectedIso);
    expect(offeredInstance.updatedAt).toBe(expectedIso);

    // 2. Accept
    const { updatedInstance: acceptedInstance, receipt: acceptReceipt } = runtime.acceptQuest(offeredInstance, plan);
    expect(acceptedInstance.updatedAt).toBe(expectedIso);
    expect(acceptReceipt.createdAt).toBe(expectedIso);

    // 3. Progress
    const objectiveKey = plan.nodes.find(node => node.id === acceptedInstance.currentNodeId)?.objective?.key;
    if (!objectiveKey) throw new Error("fixture objective missing");
    const { updatedInstance: progressedInstance, receipt: progressReceipt } = runtime.progressObjective(
      acceptedInstance,
      plan,
      objectiveKey,
      1,
      { eventSequence: 2 },
    );
    expect(progressedInstance.updatedAt).toBe(expectedIso);
    expect(progressReceipt.createdAt).toBe(expectedIso);

    // 4. Progress again to complete objective
    const { updatedInstance: progressedInstance2 } = runtime.progressObjective(
      progressedInstance,
      plan,
      objectiveKey,
      2,
      { eventSequence: 3 },
    );

    // 5. Complete
    const source = {
      triggerEventId: progressedInstance2.triggerEventId!,
      triggerEventDigest: progressedInstance2.triggerEventDigest!,
      sourceEvidenceId: progressedInstance2.triggerEventId!,
      sourceEvidenceDigest: progressedInstance2.triggerEventDigest!,
      sourceLogicalRevision: progressedInstance2.worldStateRevision!,
      compilerVersion: progressedInstance2.compilerVersion!,
      sourceRevision: progressedInstance2.sourceRevision!,
      templateSetHash: progressedInstance2.templateSetHash!,
      candidateSetHash: progressedInstance2.candidateSetHash!,
      seedDigest: progressedInstance2.seedDigest,
      roleBindingHash: progressedInstance2.roleBindingHash!,
    };
    const { updatedInstance: completedInstance, receipt: completeReceipt } = runtime.completeQuest(
      progressedInstance2,
      plan,
      { source, eventSequence: 4 }
    );
    expect(completedInstance.state).toBe('completed');
    expect(completedInstance.updatedAt).toBe(expectedIso);
    expect(completeReceipt.createdAt).toBe(expectedIso);
  });

  it('produces byte-identical results and hashes across 100 consecutive executions with same clock', () => {
    const runs: Array<{
      updatedInstance: string;
      receiptId: string;
      receiptHash: string;
      resultStateHash: string;
      idempotencyKey: string;
    }> = [];

    for (let i = 0; i < 100; i++) {
      const { runtime } = setupEngines(fixedEpoch);
      const { instance, plan } = runtime.compileAndOfferQuest({
        worldId: 'world_1',
        playerUserId: 1,
        giverNpcId: 'npc_merchant_kaelen',
        triggerEventId: 'evt_init',
      });
      const { updatedInstance: accepted } = runtime.acceptQuest(instance, plan);
      const { updatedInstance: progressed, receipt } = runtime.progressObjective(
        accepted,
        plan,
        plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key,
        1,
        { eventSequence: 2 },
      );

      runs.push({
        updatedInstance: JSON.stringify(progressed),
        receiptId: receipt.id,
        receiptHash: receipt.receiptHash,
        resultStateHash: receipt.resultStateHash,
        idempotencyKey: receipt.idempotencyKey,
      });
    }

    const firstRun = runs[0];
    for (let i = 1; i < 100; i++) {
      expect(runs[i]).toEqual(firstRun);
    }
  });

  it('derives progress receipt ID deterministically without wall-clock timestamps', () => {
    const { runtime } = setupEngines(fixedEpoch);
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });
    const { updatedInstance: accepted } = runtime.acceptQuest(instance, plan);
    const { receipt } = runtime.progressObjective(
      accepted,
      plan,
      plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key,
      1,
      { eventSequence: 2 },
    );

    // Receipt ID must follow the deterministic format rcpt_<24-hex-identity>
    expect(receipt.id).toMatch(/^rcpt_[0-9a-f]{24}$/);
    expect(receipt.id).not.toContain('progress_');
    expect(receipt.id).not.toContain(String(fixedEpoch));
    expect(receipt.idempotencyKey).toBe(`progress:${instance.id}:${plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key}:1`);
  });

  it('guarantees identical receipt ID and idempotent hash on command retry', () => {
    const { runtime } = setupEngines(fixedEpoch);
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });
    const { updatedInstance: accepted } = runtime.acceptQuest(instance, plan);

    // Initial progress
    const run1 = runtime.progressObjective(accepted, plan, plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key, 1, { eventSequence: 2 });

    // Retry on same input state
    const run2 = runtime.progressObjective(accepted, plan, plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key, 1, { eventSequence: 2 });

    expect(run1.receipt.id).toBe(run2.receipt.id);
    expect(run1.receipt.resultStateHash).toBe(run2.receipt.resultStateHash);
    expect(run1.receipt.receiptHash).toBe(run2.receipt.receiptHash);
    expect(run1.receipt.idempotencyKey).toBe(run2.receipt.idempotencyKey);
  });

  it.each([
    { amount: 1, label: '5 + 1 = 6' },
    { amount: 2, label: '5 + 2 = 6' },
  ])('caps numeric objective progress at its validated target ($label)', ({ amount }) => {
    const { runtime } = setupEngines();
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1', playerUserId: 1, triggerEventId: 'evt_init',
    });
    const { updatedInstance: accepted } = runtime.acceptQuest(instance, plan);
    const objectiveNode = plan.nodes.find(node => node.id === accepted.currentNodeId)!;
    const objectiveKey = objectiveNode.objective!.key;
    const targetPlan = {
      ...plan,
      nodes: plan.nodes.map(node => node.id === objectiveNode.id
        ? { ...node, objective: { ...node.objective!, targetValue: 6 } }
        : node),
    };
    const atFive = { ...accepted, objectiveProgress: { ...accepted.objectiveProgress, [objectiveKey]: 5 } };

    const result = runtime.progressObjective(atFive, targetPlan, objectiveKey, amount, { eventSequence: 7 });

    expect(result.completedNode).toBe(true);
    expect(result.updatedInstance.objectiveProgress[objectiveKey]).toBe(6);
    expect(result.updatedInstance.completedNodeIds.filter(id => id === objectiveNode.id)).toHaveLength(1);
  });

  it('rejects progress on an already completed objective without creating a mutated result', () => {
    const { runtime } = setupEngines();
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1', playerUserId: 1, triggerEventId: 'evt_init',
    });
    const { updatedInstance: accepted } = runtime.acceptQuest(instance, plan);
    const objectiveNode = plan.nodes.find(node => node.id === accepted.currentNodeId)!;
    const completed = { ...accepted, completedNodeIds: [...accepted.completedNodeIds, objectiveNode.id] };

    expect(() => runtime.progressObjective(
      completed, plan, objectiveNode.objective!.key, 1, { eventSequence: 3, idempotencyKey: 'late-event' },
    )).toThrow('QUEST_OBJECTIVE_ALREADY_COMPLETED');
    expect(completed.objectiveProgress).toEqual(accepted.objectiveProgress);
  });
});
