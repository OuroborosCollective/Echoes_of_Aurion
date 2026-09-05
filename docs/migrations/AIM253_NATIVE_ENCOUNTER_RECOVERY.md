# Native encounters in the open world

This increment connects the existing four Aurion encounter definitions to the open-world HUD. It does not claim the four new AIM-259 dungeon instances, party roles, spatial boss targeting, player damage, or the AIM-260 world-boss lifecycle.

## Authority and recovery

- `gameplay.currentEncounter` reads only the authenticated account's active session. The shared boundary rejects foreign ownership, duplicate definitions, impossible HP, malformed identifiers and out-of-range sequences. Missing/stale readbacks disable actions.
- Starting the same encounter resumes its persisted HP and sequence. A different active encounter must be completed first. Account and session row locks serialize parallel starts/actions; a repeated action sequence cannot apply damage twice.
- The browser has one action in flight and reads the owned session before selecting the next sequence. A failed/lost response triggers readback, never an automatic repeated attack. Returning to the tower keeps the encounter; world reentry reads it again.
- Loot replay now reads the original receipt and item before consulting a changed catalog; missing or mismatched provenance fails closed. The first MariaDB run exposed the previous missing replay item ID. New loot/item IDs derive from the confirmed origin and idempotency context, without random entropy.
- New session identities use SHA-256 over version, user, durable per-user session ordinal and encounter key. New action identities use version, session and confirmed sequence. Neither wall-clock time nor random entropy enters these identities or their downstream loot seed. Existing session IDs remain supported. Session history is append-only in the application; a conflicting/corrupt history fails at the unique primary key.
- Quest completion locks the account and quest, grants base XP/currency once, and allows a completed quest's request to resume the existing idempotent loot/mastery finalizers. Audit timestamps remain database/server operational metadata. Quest finalization still consists of separate durable steps; the native dungeon completion below now commits its existing effects together.
- AX1 key mapping remains intact: F remains interaction in the imported key adapter. The explicit native attack button sends Aurion's existing F attack command.

## Evidence

The local suite passed 499 tests with 39 database-dependent skips before the final identity-specific case; nine focused boundary/identity cases also run. TypeScript and production build pass. The CI MariaDB job now exercises parallel start/resume, duplicate sequence rejection, owner isolation, late quest-completion rollback/retry and repeated reward readback. The authenticated browser suite adds a real account that accepts Lyra's first quest, starts combat, returns/reenters with unchanged HP, completes it and checks the 122 XP / 20 AURION reward in MariaDB.

Database and browser tests are required before merge; their actual run results are recorded in Linear and the pull request. Existing phone/tablet/desktop, two-account presence and context-loss tests remain enabled. No production account or real credential is used by these isolated fixtures.

## AIM-259: atomic native dungeon completion

The existing `cinder_vault` caller previously committed the last hit, completion and base rewards before creating its expedition result and loot. A later error could leave a completed run without its item. `applyGameplayAction` now writes the accepted action, HP, completed session, unchanged 480 XP / 90 AURION / one victory, expedition result, loot receipt and item in one account-locked MariaDB transaction. Result and loot helpers reuse that transaction instead of opening nested or independent transactions.

An exact repetition of the final accepted sequence, normalized command and input source reads the original action, three reward-ledger rows, accepted expedition result, loot receipt and item. Concurrent repetitions return the same response with `replayed: true` and never grant anything again. Earlier sequences, a different command/source or another account are rejected. Later profile levels, equipment, inactive catalogs and item transfers do not reroll or restore the historical item.

The first completion chooses an active treasure class for the post-reward level, ordered by descending minimum level and then ascending class key. This fixes database-row-order ambiguity. Its result digest binds the account, session, encounter, accepted sequence, command/source, reward and selected level/class. Reward-ledger identities are deterministic. No reward amounts, loot-roll formulas or progression curves change, so this slice makes no new Wolfram calculation claim.

Missing eligible loot content or an item-insertion failure rolls the whole attempt back, including the final hit; the same command can succeed once the problem is fixed. Previously completed records lacking matching durable effects fail with an evidence error and are not automatically re-awarded. No schema migration or rewrite of historical rows is required. Reverting the application change does not remove existing rewards.

The isolated MariaDB suite reaches the dungeon through the real three-quest/key path. It injects an error after item insertion, checks rollback, repeats the final command concurrently, changes the catalog/profile/item owner before readback, and rejects conflicting or incomplete historical evidence. The existing quest, skill, weapon and loot tests cover the shared transaction-helper refactor.

This is a completion prerequisite for [AIM-259](https://linear.app/aimmorpg/issue/AIM-259/aim-23918-dungeon-finder-rollenwarteschlange-party-and-autoritative). The four new dungeon instances, role queue, party tickets, spatial encounters and coupled dungeon mastery still need their own runtime integration and evidence.
