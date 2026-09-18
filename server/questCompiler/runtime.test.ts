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
      1
    );
    expect(progressedInstance.updatedAt).toBe(expectedIso);
    expect(progressReceipt.createdAt).toBe(expectedIso);

    // 4. Progress again to complete objective
    const { updatedInstance: progressedInstance2 } = runtime.progressObjective(
      progressedInstance,
      plan,
      objectiveKey,
      2
    );

    // 5. Complete
    const { updatedInstance: completedInstance, receipt: completeReceipt, emittedWorldEvent } = runtime.completeQuest(
      progressedInstance2,
      plan
    );
    expect(completedInstance.state).toBe('completed');
    expect(completedInstance.updatedAt).toBe(expectedIso);
    expect(completeReceipt.createdAt).toBe(expectedIso);
    expect(emittedWorldEvent.type).toBe('QUEST_COMPLETED_REVENGE');
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
        1
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
      1
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
    const run1 = runtime.progressObjective(accepted, plan, plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key, 1);

    // Retry on same input state
    const run2 = runtime.progressObjective(accepted, plan, plan.nodes.find(node => node.id === accepted.currentNodeId)!.objective!.key, 1);

    expect(run1.receipt.id).toBe(run2.receipt.id);
    expect(run1.receipt.resultStateHash).toBe(run2.receipt.resultStateHash);
    expect(run1.receipt.receiptHash).toBe(run2.receipt.receiptHash);
    expect(run1.receipt.idempotencyKey).toBe(run2.receipt.idempotencyKey);
  });
});
