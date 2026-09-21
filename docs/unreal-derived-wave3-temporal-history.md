# Unreal-derived Wave 3 — Steps 32–34: Temporal History

Wave 3 preserves the AI Studio architecture intent but replaces its in-memory history maps with append-only MariaDB evidence.

## Contract

`AurionTemporalEvent` binds a world epoch, sorted subjects, source receipt, replayable World Causal Root, exact source revision/ruleset, predecessor events and canonical payload/event hashes. Events are capped and canonicalized; malformed, duplicate or oversized inputs fail closed.

## Persistence

Migration `0056_aurion_temporal_history_v1` creates normalized event, subject and predecessor tables. UPDATE and DELETE are rejected by database triggers. A new event is accepted only after `worldCausalRootService.read` and `replay` agree with its source root/revision/ruleset. Predecessors must already exist in the same world.

## Historical reconstruction

Step 33 reconstructs active facts at an epoch from persisted events. Superseded predecessors are removed only when their confirmed successor is valid at the queried epoch. Contradicting simultaneous payloads return `CONTRADICTED`; missing/corrupt/root-divergent evidence returns `UNPROVABLE`. The returned `reconstructionHash` is an evidence digest, never a World Root.

## Causal explanation

Step 34 traverses persisted predecessor edges backward with a bounded depth, validates each event's world-root replay and returns `MATCH`, `CONTRADICTED` or `UNPROVABLE`. The surface is read-only and always reports `mutationAuthority: "none"`.

## Evidence

The dedicated workflow applies the entire migration journal to MariaDB 11.4, records two real causal epochs, persists two superseding temporal events, reads historical state at both epochs, explains the predecessor chain in a fresh CLI process, proves append-only trigger rejection, then runs TypeScript and the production build.
