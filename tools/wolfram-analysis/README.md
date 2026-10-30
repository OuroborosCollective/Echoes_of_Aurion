# Wolfram-inspired offline analysis helpers (Aurion-owned)

This module is **development tooling only**. It is not wired into the 100-ms
server tick, world-generation authority, transport, persistence, Godot client,
or release workflows. It makes no Wolfram network calls and requires no Wolfram
runtime dependency. Wolfram resource functions supply mathematical comparisons,
not decisions about canonical game state.

- cyclicBatches(items, lengths) follows Wolfram's CyclicPartition with
  "Remainder" -> True: every ordered item is retained. Zero, fractional,
  negative, and empty patterns are rejected rather than silently dropping work.
- padToMinLength(items, n, padding) follows the scalar behavior of
  PadRightToMinLength (negative n means left padding), with no truncation.
  Use immutable padding values, since references can be shared.
- createRevisionScopedMemo(maxEntries) provides an isolated bounded FIFO
  memo for **pure** analysis callbacks. Its identity includes the domain, world
  seed, full world revision, full rules revision, and a SHA-256 digest covering
  every other input. It never reads the wall clock or the network. It does not
  automatically discover hidden dependencies; callers MUST include all
  mutable inputs in that digest. The caller is responsible for computing the
  digest from canonical bytes. It does not prove that a supplied revision/digest
  corresponds to real production data.

These are development conveniences, **not gameplay truth, runtime receipts, or
speedup evidence**. Changing scope always results in a new cache entry; errors
are not cached. The cache is process-local and ephemeral.

## Verification

- pnpm exec vitest run tools/wolfram-analysis/revisionScopedAnalysis.test.ts
- pnpm check
- Do not claim live Aurion performance or replay parity from these offline
  synthetic regression cases. A production integration needs Aurion-specific
  replay, DB and runtime readbacks on its exact commit.

Original resource documentation:
https://resources.wolframcloud.com/FunctionRepository/resources/CyclicPartition/
https://resources.wolframcloud.com/FunctionRepository/resources/PadRightToMinLength/
https://resources.wolframcloud.com/FunctionRepository/resources/Memoize/
