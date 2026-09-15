import { describe, expect, it } from 'vitest';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestRuntimeEngine } from './runtime';
import { QuestReplayEngine } from './replay';

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
    expect(result.firstDivergenceDetails).toContain('PlanHash divergence');
  });
});
