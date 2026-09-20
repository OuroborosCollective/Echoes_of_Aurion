---
description: Step 28a binds committed chunk snapshots to versioned world roots before projection and client verification.
---

# Canonical Chunk State — Step 28a

This prerequisite precedes the world-chunk projection in Step 28 and client verification in Step 29. Aurion remains the sole authority. AX1 consumes a later projection; this change does not wire the renderer or make a client an authority.

## Contract and hash domains

All new hashes use the existing canonical JSON encoder and SHA-256 (`sha256:<64 lowercase hex>`). Existing generated chunk and delta FNV identities remain unchanged; an FNV string is never accepted as the new authority-state hash.

| Contract or field | Exact commitment |
| --- | --- |
| `aurion.chunk-universe.v1` | World ID, domain-separated world-seed hash, generator version, ruleset, base revision |
| `baseStateHash` | `aurion.chunk-base.v1` domain plus the complete deterministic generated base |
| `orderedDeltaHash` | `aurion.chunk-ordered-deltas.v1` domain plus every authoritative delta field, sorted by sequence |
| `authorityStateHash` | `aurion.chunk.state.v1`, universe, coordinate, sequence watermark, both hashes, complete materialized state |
| `receiptHash` | All unsigned `aurion.chunk.epoch-receipt.v1` fields: state commitments, world/epoch/source identity and predecessor chunk receipt |
| `chunkSetHash` | `aurion.chunk-epoch-set.v1`, universe, numerically sorted coordinates with sequence watermarks and receipt hashes |
| `worldRootHash` | Complete unsigned `aurion.world.causal-root.v2`: zone roots, previous world root, universe, chunk receipts and set hash |

Receipts have kind `EPOCH_SNAPSHOT`. They attest the persisted state observed by the epoch transaction, not a retroactively invented action or tick receipt. The source revision must be an observed full Git SHA. Actor identities, intent keys, payloads and seed bytes are hashed but not copied into the receipt.

Strict decoders reject extra fields, invalid identities, noncanonical chunk ordering, duplicate streams, missing sequence prefixes, foreign world/base coordinates and inconsistent hashes. State is detached from inputs and recursively frozen.

## Producer, persistence and historical reconstruction

`resolveAndRecordGlobalWorldEpoch` observes zone evidence and all committed world chunk deltas in its existing database transaction. It generates each touched chunk's base, applies the complete contiguous delta prefix, and stores the compact result in `aurionGlobalStateProofs.globalProofJson`. No new table or migration is introduced. Existing gameplay delta writes and the 10 Hz zone authority are unchanged.

The receipt set contains every nonempty chunk stream visible in that transaction's snapshot. A coordinate absent from that complete set is the deterministic base with an empty stream **at that epoch**, not a claim about the current live world. Readback labels these cases separately:

| Membership | Meaning |
| --- | --- |
| `COMMITTED_CHUNK_RECEIPT` | Receipt is included in the persisted world root |
| `GENERATOR_AND_EMPTY_STREAM` | State is derived from the committed generator universe and absence from the complete stream set; its derived receipt is not a separately persisted action receipt |

Readback replays the stored sequence watermarks, ignoring later appends. It reconstructs actual bytes and compares the complete root, checks the adjacent predecessor, and checks that prior chunk history has neither changed nor disappeared. Completeness of the historical set relies on the authoritative epoch producer's transaction, not on inferring historical absence from today's database.

Historical V1 roots keep their original bytes and hashes and remain readable as **zone-only** evidence. The first V2 root links to the preceding V1 hash; it never relabels V1 as chunk evidence. Missing or contradictory predecessors fail closed. No automatic repair, history rewrite or recovery baseline is authorized.

## Read-only interfaces

The admin-only `causality.readChunkState` query accepts `{ worldId, epoch, coordinate: { x, z } }`. It requires a matching reconstructed V2 world root before returning state and receipt. There is no new public raw-state endpoint.

For an authorized, configured database environment:

```bash
node --import tsx scripts/read-aurion-chunk-state.ts \
  --world echoes-of-aurion-global --epoch 1 --chunk-x 0 --chunk-z 0
```

The CLI prints receipt/hash evidence only, with `mutationAuthority: "none"`. Exit codes: `0` verified, `2` unprovable, `64` invalid arguments. It does not advance an epoch, create a receipt, repair data or export actor/intent fields. Set the runtime's genuine `AURION_RELEASE_SHA`; do not invent a SHA to make verification pass.

## Bounds and failure semantics

The initial complete snapshot is bounded to 64 touched chunks, 4,096 total committed deltas and 60,000 UTF-8 bytes in the existing MariaDB TEXT column. An overflow is `UNPROVABLE`, never a verified truncated set. These are evidence limits, not newly imposed gameplay limits; once exceeded, provable continuation needs a separately designed sharded/checkpoint contract. This implementation is not an unbounded-world scalability claim.

V2 reconstruction requires the exact source revision's generator. A different running revision returns `CHUNK_GENERATOR_REVISION_UNAVAILABLE`; old generator binaries are not fetched or executed automatically. Missing database evidence, changed payload bytes (even with a recomputed legacy FNV), gaps, source/seed mismatch and malformed roots fail closed. Reconciliation now requires actual replay rather than checking only the stored root's own hash.

## Verification and integration order

`server/causality/chunkWorldRoot.test.ts` covers canonicalization, immutable inputs, negative contracts, V1 transition, predecessor history and complete-set limits. These fixtures prove logic, not runtime execution.

The opt-in `server/worldEpochReaction.e2e.test.ts` lane uses the existing disposable MariaDB CI service and actual `AuthoritativeMovementZone.tick`, `recordWorldChunkDelta` and epoch producer. It checks persisted readback, a fresh CLI process, idempotency, historical replay after append, predecessor receipts, byte tampering with a valid legacy hash, missing rows and read-only behavior. `STEP28A_REAL_MARIADB_CLI` marks the hash-only CLI result in its CI log. Local skipped database tests are not runtime evidence.

Keep this prerequisite in a separate draft from projection PR #431 and client-verification PR #433. Their runtime adapters must consume this contract only after this prerequisite is reviewed, integrated and read back. No merge, production promotion or complete Step-28/29 claim follows from publishing this draft.
