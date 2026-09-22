import { describe, expect, it } from 'vitest';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestRuntimeEngine } from './runtime';
import { AURION_QUEST_REPLAY_RULESET, QuestReplayEngine } from './replay';
import { AURION_REPLAY_VERDICT_SCHEMA } from '../../shared/aurionReplayContract';

describe('QuestReplayEngine (AIM-298)', () => {
  it('reproduces exact MATCH verdict on valid source input tuple', () => {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: 'evt_init',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });

    const registry = new QuestTemplateRegistry();
    const runtime = new QuestRuntimeEngine(factEngine, registry);

    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const replayEngine = new QuestReplayEngine(registry);
    const result = replayEngine.replayInstance(instance, plan, factEngine.getFacts(), plan.planHash);

    expect(result.verdict).toBe('MATCH');
    expect(result.replayVerdict).toMatchObject({
      schemaVersion: AURION_REPLAY_VERDICT_SCHEMA,
      domain: 'QUEST_COMPILER',
      rulesetVersion: AURION_QUEST_REPLAY_RULESET,
      status: 'MATCH',
      verdict: 'MATCH',
      scopeIdentity: { worldId: 'world_1', instanceId: instance.id },
      firstDivergentStage: null,
      expectedHash: null,
      observedHash: null,
      reason: null,
    });
    expect(result.replayVerdict.verifiedStages).toEqual([
      'SOURCE_SCOPE',
      'TEMPLATE_SET',
      'CANDIDATE_SET',
      'TEMPLATE_SELECTION',
      'SEED_DIGEST',
      'ROLE_BINDING',
      'PLAN_HASH',
      'SEMANTIC_OUTCOME',
    ]);
    expect(result.replayedPlanHash).toBe(plan.planHash);
  });

  it('detects FIRST_DIVERGENCE when plan hash diverges', () => {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: 'evt_init',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });

    const registry = new QuestTemplateRegistry();
    const runtime = new QuestRuntimeEngine(factEngine, registry);

    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const replayEngine = new QuestReplayEngine(registry);
    const result = replayEngine.replayInstance(instance, plan, factEngine.getFacts(), 'tampered_expected_hash');

    expect(result.verdict).toBe('FIRST_DIVERGENCE');
    expect(result.replayVerdict.status).toBe('FIRST_DIVERGENCE');
    expect(result.replayVerdict.firstDivergentStage).toBe('PLAN_HASH');
    expect(result.replayVerdict.verifiedStages).toEqual([
      'SOURCE_SCOPE',
      'TEMPLATE_SET',
      'CANDIDATE_SET',
      'TEMPLATE_SELECTION',
      'SEED_DIGEST',
      'ROLE_BINDING',
    ]);
    expect(result.firstDivergenceDetails).toContain('PlanHash divergence');
  });

  it('returns UNPROVABLE when required world-fact evidence is unavailable', () => {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: 'evt_init',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });
    const registry = new QuestTemplateRegistry();
    const runtime = new QuestRuntimeEngine(factEngine, registry);
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const result = new QuestReplayEngine(registry).replayInstance(instance, plan, null, plan.planHash);
    expect(result.verdict).toBe('UNPROVABLE');
    expect(result.replayVerdict).toMatchObject({
      status: 'UNPROVABLE',
      verdict: 'UNPROVABLE',
      domain: 'QUEST_COMPILER',
      reason: 'QUEST_WORLD_FACT_EVIDENCE_MISSING',
      verifiedStages: [],
      firstDivergentStage: null,
      expectedHash: null,
      observedHash: null,
    });
  });

  it('detects FIRST_DIVERGENCE when runtime event sequence breaks', () => {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: 'evt_init',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });
    const registry = new QuestTemplateRegistry();
    const runtime = new QuestRuntimeEngine(factEngine, registry);
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const receipts = [
      {
        id: 'rcpt_1',
        instanceId: instance.id,
        eventSequence: 1,
        planHash: plan.planHash,
        graphHash: plan.graphHash,
        previousStateHash: 'hash_pre_1',
        resultStateHash: 'hash_res_1',
        idempotencyKey: 'key_1',
        receiptHash: 'rcpt_hash_1',
        createdAt: '2026-09-22T00:00:00.000Z',
      },
      {
        id: 'rcpt_2',
        instanceId: instance.id,
        eventSequence: 3, // Skipped sequence 2!
        planHash: plan.planHash,
        graphHash: plan.graphHash,
        previousStateHash: 'hash_res_1',
        resultStateHash: 'hash_res_2',
        idempotencyKey: 'key_2',
        receiptHash: 'rcpt_hash_2',
        createdAt: '2026-09-22T00:00:01.000Z',
      },
    ];

    const replayEngine = new QuestReplayEngine(registry);
    const result = replayEngine.replayInstance(instance, plan, factEngine.getFacts(), plan.planHash, undefined, { receipts });

    expect(result.verdict).toBe('FIRST_DIVERGENCE');
    expect(result.replayVerdict.firstDivergentStage).toBe('RUNTIME_EVENTS');
    expect(result.firstDivergenceDetails).toContain('EventSequence mismatch');
  });

  it('detects FIRST_DIVERGENCE when runtime state hash chain breaks', () => {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: 'evt_init',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });
    const registry = new QuestTemplateRegistry();
    const runtime = new QuestRuntimeEngine(factEngine, registry);
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const receipts = [
      {
        id: 'rcpt_1',
        instanceId: instance.id,
        eventSequence: 1,
        planHash: plan.planHash,
        graphHash: plan.graphHash,
        previousStateHash: 'hash_pre_1',
        resultStateHash: 'hash_res_1',
        idempotencyKey: 'key_1',
        receiptHash: 'rcpt_hash_1',
        createdAt: '2026-09-22T00:00:00.000Z',
      },
      {
        id: 'rcpt_2',
        instanceId: instance.id,
        eventSequence: 2,
        planHash: plan.planHash,
        graphHash: plan.graphHash,
        previousStateHash: 'broken_hash_does_not_match_res_1',
        resultStateHash: 'hash_res_2',
        idempotencyKey: 'key_2',
        receiptHash: 'rcpt_hash_2',
        createdAt: '2026-09-22T00:00:01.000Z',
      },
    ];

    const replayEngine = new QuestReplayEngine(registry);
    const result = replayEngine.replayInstance(instance, plan, factEngine.getFacts(), plan.planHash, undefined, { receipts });

    expect(result.verdict).toBe('FIRST_DIVERGENCE');
    expect(result.replayVerdict.firstDivergentStage).toBe('RUNTIME_EVENTS');
    expect(result.firstDivergenceDetails).toContain('State hash chain break');
  });
});
