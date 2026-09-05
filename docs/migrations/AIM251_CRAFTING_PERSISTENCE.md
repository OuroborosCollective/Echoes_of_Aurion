# AIM-251: existing crafting transaction and scoped mastery

This is the first production caller of the AIM-248 profession and scoped mastery
protocols. It extends `craftItemForUser`, using its existing player/input locks and
MariaDB transaction. It does not introduce a second crafting authority.

For the currently playable `temper_aurion_spear` recipe, one confirmed craft
atomically consumes the input, persists its existing receipt and discipline XP,
creates the base item, and stores profession/recipe/item mastery events, a
versioned profession receipt and an exact lazy output range. Retries read these
effects without granting XP again. Historical crafting receipts receive no
invented mastery backfill. The final AX1 catalog contains fourteen professions;
only blacksmith/temper/spear is connected by this increment.

Bonus realization locks the same player and batch, accepts a bounded expected
range, and derives every item ID from the committed receipt and output index.
Parallel repeats return the same outputs. It grants no additional XP. HTTP
identity comes from the authenticated session, never a supplied player ID.

## Migration and deployment gate

0031 creates three tables, adds an optional profession link to crafting receipts,
and extends item provenance with `craftingOutputKey` (historical default `base`).
The composite unique index is installed **before** the old receipt-only unique
index is removed. The existing exactly-one-provenance CHECK remains in force.
The change does not delete inventories, receipts or mastery history.

Before production application: take and verify a restorable database backup,
verify the exact source/journal hashes, apply the complete chain in isolated
MariaDB, and verify physical columns, index uniqueness and CHECK constraints.
Production reconciliation currently stops at 0028 and does not inspect ALTER
TABLE. This is a release blocker: 0029–0031 must be included in an expanded,
fail-closed reconciliation/apply artifact before this increment is merged.
Do not apply 0031 with an older production runner or mark AIM-251 complete.

Rollback after bonus items exist requires preserving the new composite index and
disabling writes until the matching application is restored. Reinstating the old
receipt-only unique index would reject legitimate multiple outputs. A full DB
restore must use the verified pre-migration backup during a write pause, with a
separate data-loss assessment for any subsequent writes.

## Verification

Local TypeScript and the contiguous 0000–0031 journal verifier pass. The complete
local suite passes 469 tests; 35 environment-bound tests are skipped. The new
MariaDB workflow runs the complete Drizzle chain and existing crafting tests,
then proves concurrent retries, exact bonus origins, ownership rejection, and
full rollback after an injected late SQL failure. Those database checks must
pass in Actions; local skips do not constitute database evidence.

Still pending for the complete Linear scope: all catalog recipes and gathering
activities, region/faction constraints, gameplay input receipts, restart replay,
authenticated browser play, and matching production revision/schema receipts.
