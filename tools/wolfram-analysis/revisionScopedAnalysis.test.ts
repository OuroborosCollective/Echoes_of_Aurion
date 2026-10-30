import { describe, expect, it, vi } from 'vitest';
import { createRevisionScopedMemo, cyclicBatches, padToMinLength } from './revisionScopedAnalysis';

const revisionA = 'a'.repeat(40);
const revisionB = 'b'.repeat(40);
const baseScope = {
  worldSeed: 'seed-17', worldRevision: revisionA,
  rulesRevision: revisionA, domain: 'offline-terrain',
} as const;
const inputDigest = 'c'.repeat(64);

describe('offline Wolfram analysis parity', () => {
  it('preserves every ordered element including a short final group', () => {
    const source = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(cyclicBatches(source, [2, 3])).toEqual([
      [1, 2], [3, 4, 5], [6, 7], [8, 9, 10], [11],
    ]);
    expect(cyclicBatches(source, [2, 3]).flat()).toEqual(source);
    expect(cyclicBatches([], [2, 3])).toEqual([]);
  });

  it('fails closed on invalid cycling lengths', () => {
    for (const lengths of [[], [0], [1, -2], [1, 1.5], [Infinity]]) {
      expect(() => cyclicBatches([1, 2], lengths)).toThrow();
    }
  });

  it('pads without truncating (left/right supported)', () => {
    expect(padToMinLength([1, 2, 3], 2, 0)).toEqual([1, 2, 3]);
    expect(padToMinLength([1], 3, 0)).toEqual([1, 0, 0]);
    expect(padToMinLength([1], -3, 0)).toEqual([0, 0, 1]);
    expect(() => padToMinLength([1], Infinity, 0)).toThrow();
  });

  it('computes once per explicit revision/seed/rule/domain/input identity', () => {
    const memo = createRevisionScopedMemo<number>(2);
    const work = vi.fn(() => 3);
    expect(memo.evaluate(baseScope, inputDigest, work)).toBe(3);
    expect(memo.evaluate(baseScope, inputDigest, work)).toBe(3);
    expect(work).toHaveBeenCalledTimes(1);
    expect(memo.evaluate({ ...baseScope, rulesRevision: revisionB }, inputDigest, work)).toBe(3);
    expect(memo.evaluate({ ...baseScope, worldRevision: revisionB }, inputDigest, work)).toBe(3);
    expect(work).toHaveBeenCalledTimes(3);
    expect(memo.size).toBe(2);
  });

  it('invalidates on world seed, domain and input change', () => {
    const memo = createRevisionScopedMemo<number>();
    let count = 0;
    const work = () => ++count;
    expect(memo.evaluate(baseScope, inputDigest, work)).toBe(1);
    expect(memo.evaluate({ ...baseScope, worldSeed: 'seed-18' }, inputDigest, work)).toBe(2);
    expect(memo.evaluate({ ...baseScope, domain: 'offline-graph' }, inputDigest, work)).toBe(3);
    expect(memo.evaluate(baseScope, 'd'.repeat(64), work)).toBe(4);
  });

  it('does not cache failures or invalid identity arguments', () => {
    const memo = createRevisionScopedMemo<number>();
    const work = vi.fn(() => { throw Error('failure'); });
    expect(() => memo.evaluate(baseScope, inputDigest, work)).toThrow('failure');
    expect(() => memo.evaluate(baseScope, inputDigest, work)).toThrow('failure');
    expect(work).toHaveBeenCalledTimes(2);
    expect(memo.size).toBe(0);
    memo.clear();
    expect(memo.size).toBe(0);
    expect(() => memo.evaluate({ ...baseScope, rulesRevision: 'not-pinned' }, inputDigest, () => 1)).toThrow();
    expect(() => memo.evaluate(baseScope, 'not-a-digest', () => 1)).toThrow();
    expect(() => createRevisionScopedMemo(0)).toThrow();
  });
});
