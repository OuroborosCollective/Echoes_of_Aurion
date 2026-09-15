import { describe, expect, it } from 'vitest';
import { CandidateResolver } from './candidateResolver';
import { DEFAULT_SEED_TEMPLATES } from './templateRegistry';
import { WorldFact } from '../../shared/aurionQuestContract';

describe('CandidateResolver (AIM-298)', () => {
  it('filters eligible templates and produces stable candidate set hashes', () => {
    const facts: WorldFact[] = [
      {
        id: 'f1',
        subject: 'caravan_default.status',
        predicate: 'status',
        value: 'damaged',
        provenance: { sourceEventId: 'evt_1', sequence: 1, source: 'test' },
      },
    ];

    const { eligibleTemplates, candidateSetHash } = CandidateResolver.resolveCandidates(DEFAULT_SEED_TEMPLATES, facts);

    expect(eligibleTemplates.length).toBeGreaterThan(0);
    expect(eligibleTemplates[0]!.templateId).toBe('tpl_caravan_investigation');
    expect(candidateSetHash).toBeTruthy();
  });

  it('selects winning template deterministically given a seed digest tuple', () => {
    const facts: WorldFact[] = [
      {
        id: 'f1',
        subject: 'caravan_default.status',
        predicate: 'status',
        value: 'damaged',
        provenance: { sourceEventId: 'evt_1', sequence: 1, source: 'test' },
      },
    ];

    const { eligibleTemplates } = CandidateResolver.resolveCandidates(DEFAULT_SEED_TEMPLATES, facts);
    const winning1 = CandidateResolver.selectWinningTemplate(eligibleTemplates, 'a1b2c3d4e5f6');
    const winning2 = CandidateResolver.selectWinningTemplate(eligibleTemplates, 'a1b2c3d4e5f6');

    expect(winning1).toBeDefined();
    expect(winning1?.templateId).toBe(winning2?.templateId);
  });
});
