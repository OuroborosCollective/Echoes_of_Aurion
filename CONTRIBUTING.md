# Contributing to Echoes of Aurion

## Architecture boundary

**Aurion is the only owner and truth source.** All gameplay, world, NPC, quest, combat, progression, loot, crafting, economy, group/dungeon, guild, housing, database, persistence, receipts, account, community, assets and operations are authoritative inside Aurion.

AX1 and WASD are historical projects whose useful code has been migrated into Aurion. Their names may remain in file names or provenance metadata, but they are not live owners, external authorities or required runtime services.

## Development principles

1. Implement active behavior in Aurion.
2. Keep migrated legacy provenance explicit but non-authoritative.
3. Make gameplay changes deterministic, typed, receipt-backed and replayable.
4. Never let client/rendering state become gameplay truth.
5. Never create a second database or state authority to support a legacy path.
6. Require exact-head regression and runtime/readback evidence for non-trivial integrations.
7. Preserve the Memory.md → integration → evidence → merge → main readback workflow.
