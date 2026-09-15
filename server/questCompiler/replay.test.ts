import { describe, expect, it } from 'vitest';
import { fixedOperationalClock, operationalDate } from '../../shared/operationalClock';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestRuntimeEngine } from './runtime';
import { QuestReplayEngine } from './replay';

const CLOCK_A = fixedOperationalClock(1_800_000_000_000);
const CLOCK_B = fixedOperationalClock(1_800_000_123_456);

function fixture() {
  const factEngine = new WorldFactEngine();
  factEngine.recordEvent({
    id: 'evt_init',
    type: 'CARAVAN_ATTACKED',
    source: 'test',
    data: { caravanId: 'c1', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
  });
  const registry = new QuestTemplateRegistry();
  return { factEngine, registry };
}

describe('QuestReplayEngine (AIM-298)', () => {
  it('reproduces exact MATCH verdict on valid source input tuple with an explicit clock', () => {
    const { factEngine, registry } = fixture();
    const runtime = new QuestRuntimeEngine(factEngine, registry, CLOCK_A);

    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const replayEngine = new QuestReplayEngine(registry, CLOCK_A);
    const result = replayEngine.replayInstance(instance, plan, factEngine.getFacts(), plan.planHash);

    expect(result.verdict).toBe('MATCH');
    expect(result.replayedPlanHash).toBe(plan.planHash);
    expect(result.timestamp).toBe(operationalDate(CLOCK_A).toISOString());
  });

  it('detects FIRST_DIVERGENCE when plan hash diverges', () => {
    const { factEngine, registry } = fixture();
    const runtime = new QuestRuntimeEngine(factEngine, registry, CLOCK_A);

    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const replayEngine = new QuestReplayEngine(registry, CLOCK_A);
    const result = replayEngine.replayInstance(instance, plan, factEngine.getFacts(), 'tampered_expected_hash');

    expect(result.verdict).toBe('FIRST_DIVERGENCE');
    expect(result.firstDivergenceDetails).toContain('PlanHash divergence');
  });

  it('keeps canonical transition and receipt hashes invariant across operational timestamps', () => {
    const { factEngine, registry } = fixture();
    const runtimeA = new QuestRuntimeEngine(factEngine, registry, CLOCK_A);
    const runtimeB = new QuestRuntimeEngine(factEngine, registry, CLOCK_B);

    const { instance } = runtimeA.compileAndOfferQuest({
      worldId: 'world_1',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init',
    });

    const a = runtimeA.acceptQuest(instance);
    const b = runtimeB.acceptQuest(instance);

    expect(a.updatedInstance.updatedAt).not.toBe(b.updatedInstance.updatedAt);
    expect(a.receipt.previousStateHash).toBe(b.receipt.previousStateHash);
    expect(a.receipt.resultStateHash).toBe(b.receipt.resultStateHash);
    expect(a.receipt.receiptHash).toBe(b.receipt.receiptHash);
    expect(a.receipt.idempotencyKey).toBe(b.receipt.idempotencyKey);
  });
});
