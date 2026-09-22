import { describe, expect, it } from 'vitest';
import { WorldFactEngine } from './worldFacts';
import { AdminQuestStudioService } from './adminService';
import { QuestPersistenceEngine } from './persistence';
import { QuestRuntimeEngine } from './runtime';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestReplayEngine } from './replay';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';
import { WorldEvent } from '../../shared/aurionQuestContract';

describe('AIM-298 Issue #465: Canonical Runtime Authority Bridge & World Event Readback', () => {
  it('rejects corrupt, unsequenced, or payload-mismatched world events with UNPROVABLE error', () => {
    const engine = new WorldFactEngine();

    // 1. Invalid sequence
    expect(() => {
      engine.ingestCanonicalEvent({
        id: 'evt_invalid_seq',
        sequence: -1,
        type: 'TEST_EVENT',
        payloadHash: 'dummy',
        data: {},
      });
    }).toThrow(/WORLD_EVENT_READBACK_UNPROVABLE: INVALID_EVENT_SEQUENCE/);

    // 2. Payload hash mismatch
    expect(() => {
      engine.ingestCanonicalEvent({
        id: 'evt_hash_mismatch',
        sequence: 1,
        type: 'TEST_EVENT',
        payloadHash: '0000000000000000000000000000000000000000000000000000000000000000',
        data: { foo: 'bar' },
      });
    }).toThrow(/WORLD_EVENT_READBACK_UNPROVABLE: PAYLOAD_HASH_MISMATCH/);

    // 3. Valid event ingests correctly
    const validData = { caravanId: 'caravan_99', merchantId: 'merchant_kaelen', playerUserId: 'player_42' };
    const validHash = computeCanonicalHash('aurion.world.event.v1', validData);
    const validEvent: WorldEvent = {
      id: 'evt_valid_1',
      sequence: 1,
      type: 'CARAVAN_ATTACKED',
      payloadHash: validHash,
      data: validData,
    };
    const { event, newFacts } = engine.ingestCanonicalEvent(validEvent);
    expect(event.id).toBe('evt_valid_1');
    expect(newFacts.length).toBeGreaterThan(0);

    // 4. Non-monotonic sequence rejected
    expect(() => {
      engine.ingestCanonicalEvent({
        id: 'evt_regression_seq',
        sequence: 0,
        type: 'TEST_EVENT',
        data: {},
      });
    }).toThrow(/WORLD_EVENT_READBACK_UNPROVABLE: NON_MONOTONIC_EVENT_SEQUENCE/);
  });

  it('bridges gameplay quest accept and complete through QuestRuntimeEngine with canonical receipts and emitted world events', async () => {
    const studioService = new AdminQuestStudioService();
    const persistenceEngine = studioService.getPersistenceEngine();
    const templateRegistry = studioService.getTemplateRegistry();
    const worldFactEngine = studioService.getWorldFactEngine();

    const userId = 777;
    const questKey = 'astral_call';

    // Bridge accept
    const acceptResult = await studioService.bridgeGameplayAcceptQuest({ userId, questKey });
    expect(acceptResult).not.toBeNull();
    const instance = acceptResult!.instance;
    const receipt = acceptResult!.receipt;

    expect(instance.templateId).toBe('tpl_astral_call');
    expect(instance.state).toBe('active');
    expect(instance.playerUserId).toBe(userId);
    expect(instance.triggerEventId).toBe(`evt_bridge_accept_${questKey}_${userId}`);
    expect(instance.triggerEventDigest).toBeDefined();
    expect(instance.sourceRevision).toBeDefined();
    expect(instance.worldStateRevision).toBeDefined();
    expect(receipt.instanceId).toBe(instance.id);

    // Duplicate accept is idempotent / returns null
    const duplicateAccept = await studioService.bridgeGameplayAcceptQuest({ userId, questKey });
    expect(duplicateAccept).toBeNull();

    // Bridge complete
    const completeResult = await studioService.bridgeGameplayCompleteQuest({
      userId,
      questKey,
      giver: 'Lyra',
    });
    expect(completeResult).not.toBeNull();
    const completedInstance = completeResult!.instance;
    const completionReceipt = completeResult!.receipt;

    expect(completedInstance.state).toBe('completed');
    expect(completionReceipt.resultStateHash).toBeDefined();

    // Emitted world events must be persisted
    const emittedEvents = persistenceEngine.getEmittedWorldEvents();
    expect(emittedEvents.length).toBeGreaterThan(0);
    const questEvent = emittedEvents.find(e => e.type === 'QUEST_COMPLETED_REVENGE' || e.data?.instanceId === completedInstance.id);
    expect(questEvent).toBeDefined();

    // Deterministic Replay Verification
    const plan = await persistenceEngine.getPlan(completedInstance.planHash);
    expect(plan).toBeDefined();

    const replayEngine = new QuestReplayEngine(templateRegistry);
    const replayReport = replayEngine.replayInstance(completedInstance, plan!, worldFactEngine.getFacts(), plan!.planHash);
    expect(replayReport.verdict).toBe('MATCH');
  });
});
