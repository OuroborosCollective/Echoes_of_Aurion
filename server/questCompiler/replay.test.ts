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
      'CANDIDATE_SET',
      'TEMPLATE_SELECTION',
      'ROLE_BINDING',
      'PLAN_HASH',
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
      'CANDIDATE_SET',
      'TEMPLATE_SELECTION',
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
});
