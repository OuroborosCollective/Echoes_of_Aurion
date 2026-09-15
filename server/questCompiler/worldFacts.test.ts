import { describe, expect, it } from 'vitest';
import { WorldFactEngine } from './worldFacts';

describe('WorldFactEngine (AIM-298)', () => {
  it('reduces canonical WorldEvents into versioned WorldFacts with sequence provenance', () => {
    const engine = new WorldFactEngine();
    const { event, newFacts } = engine.recordEvent({
      id: 'evt_test_caravan',
      type: 'CARAVAN_ATTACKED',
      source: 'aurion_test',
      data: { caravanId: 'caravan_1', merchantId: 'merchant_1', playerUserId: 'p1' },
    });

    expect(event.sequence).toBe(1);
    expect(event.payloadHash).toBeTruthy();
    expect(newFacts.length).toBeGreaterThan(0);

    const facts = engine.getFacts();
    expect(facts.some(f => f.subject === 'caravan_1.status' && f.value === 'damaged')).toBe(true);
    expect(engine.getFactsHash()).toBeTruthy();
  });

  it('handles fact supersession and updates sequence sequence without wall-clock dependency', () => {
    const engine = new WorldFactEngine();
    engine.recordEvent({
      id: 'evt_1',
      type: 'CARAVAN_ATTACKED',
      source: 'test',
      data: { merchantId: 'merchant_kaelen', playerUserId: 'player_1' },
    });

    const initialTrust = engine.getFacts().find(f => f.subject === 'merchant_kaelen.trust.player_1');
    expect(initialTrust?.value).toBe('low');

    engine.recordEvent({
      id: 'evt_2',
      type: 'QUEST_COMPLETED_REVENGE',
      source: 'test',
      data: { merchantId: 'merchant_kaelen', playerUserId: 'player_1' },
    });

    const updatedTrust = engine.getFacts().find(f => f.subject === 'merchant_kaelen.trust.player_1');
    expect(updatedTrust?.value).toBe('restored');
  });
});
