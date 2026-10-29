/** Offline authoring/reference helpers, not imports into the Aurion tick or persistence path.
 * Wolfram parity: CyclicPartition with Remainder -> True, PadRightToMinLength and Memoize with
 * mandatory revision/seed/input scoping. No I/O, time, randomness or network.
 */
export interface AnalysisScope {
  readonly worldSeed: string;
  readonly worldRevision: string;
  readonly rulesRevision: string;
  readonly domain: string;
}

const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST = /^[0-9a-f]{64}$/;

function checkScope(scope: AnalysisScope, inputDigest: string): void {
  if (!scope ||
      typeof scope.worldSeed !== 'string' || !scope.worldSeed.trim() || scope.worldSeed.length > 256 ||
      typeof scope.domain !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(scope.domain) ||
      typeof scope.worldRevision !== 'string' || !REVISION.test(scope.worldRevision) ||
      typeof scope.rulesRevision !== 'string' || !REVISION.test(scope.rulesRevision) ||
      typeof inputDigest !== 'string' || !DIGEST.test(inputDigest)) {
    throw new Error('AURION_ANALYSIS_UNPINNED_INPUT');
  }
}

/** Lossless cyclic partitioning; unlike the Wolfram default it retains the tail. */
export function cyclicBatches<T>(items: readonly T[], lengths: readonly number[]): T[][] {
  if (!Array.isArray(items) || !Array.isArray(lengths) || lengths.length === 0 ||
      !lengths.every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new Error('AURION_ANALYSIS_INVALID_BATCH_PATTERN');
  }
  const groups: T[][] = [];
  for (let offset = 0, step = 0; offset < items.length; step++) {
    const length = lengths[step % lengths.length];
    groups.push(items.slice(offset, offset + length));
    offset += length;
  }
  return groups;
}

/** Grow to a minimum length without truncation, including left padding for negative targets.
 * Wolfram parity: PadRightToMinLength for scalar targets; padding values should
 * be immutable because the same reference is reused.
 */
export function padToMinLength<T>(items: readonly T[], minLength: number, padding: T): T[] {
  if (!Array.isArray(items) || !Number.isSafeInteger(minLength) || Math.abs(minLength) > 100_000) {
    throw new Error('AURION_ANALYSIS_INVALID_MIN_LENGTH');
  }
  const missing = Math.max(0, Math.abs(minLength) - items.length);
  const fill = Array<T>(missing).fill(padding);
  return minLength < 0 ? [...fill, ...items] : [...items, ...fill];
}

/** Bounded FIFO cache for pure offline computations, keyed by every mutable dependency.
 * Caller MUST hash/canonicalize all non-scope inputs into inputDigest. It is not
 * safe for effectful callbacks or calculations depending on hidden mutable state.
 */
export function createRevisionScopedMemo<T>(maxEntries = 512) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100_000) {
    throw new Error('AURION_ANALYSIS_CACHE_LIMIT');
  }
  const values = new Map<string, T>();
  return {
    evaluate(scope: AnalysisScope, inputDigest: string, compute: () => T): T {
      checkScope(scope, inputDigest);
      if (typeof compute !== 'function') throw new Error('AURION_ANALYSIS_CALLBACK');
      const key = JSON.stringify([
        scope.domain, scope.worldSeed, scope.worldRevision, scope.rulesRevision, inputDigest,
      ]);
      if (values.has(key)) return values.get(key)!;
      const result = compute(); // thrown failures are never cached
      if (values.size >= maxEntries) {
        const oldest = values.keys().next().value;
        if (oldest !== undefined) values.delete(oldest);
      }
      values.set(key, result);
      return result;
    },
    get size(): number { return values.size; },
    clear(): void { values.clear(); },
  };
}
