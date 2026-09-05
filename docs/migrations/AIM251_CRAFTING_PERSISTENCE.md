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

Foundation PR #203 prepares SQL 0031 before this application starts reading its
columns. It preserves the old compatible application, verifies root tool bytes,
checks all 0021–0031 schema contracts and applies through the existing OIDC,
backup/recovery and postflight boundary. This profession release must follow a
successful physical production readback from that foundation.

0031 creates three tables, adds an optional profession link to crafting receipts,
and extends item provenance with `craftingOutputKey` (historical default `base`).
The composite unique index is installed before the old receipt-only unique index
is removed. The existing exactly-one-provenance CHECK remains in force.

The persisted profession `commitHash` binds the entire stored envelope and
output template, including affixes. The protocol's original operation hash
remains inside the envelope. Every receipt replay and bonus materialization
verifies that storage digest before using the data. Pending output readback
uses the same verifier; completed batches cannot crowd unclaimed outputs out
of its bounded page. Historical crafts without a profession receipt are not
retroactively credited.

Preserve the new schema on application rollback. Reinstating the old receipt-only
unique index would reject legitimate multiple outputs. A full database restore
requires the verified backup and a write pause, with assessment of subsequent
writes.

## Verification

Typecheck and the targeted local crafting/UI suite pass (16 tests). Four
MariaDB cases require the explicit isolated test database and run in Actions:
concurrent retries, exact bonus origins without extra XP, full rollback after an
injected late insert failure, and corrupted envelope/template rejection before
replay or item emission. Local skips are not database evidence. The earlier
three-case database suite passed on PR #202 head 2593045; the new fourth case
requires a fresh run on this release.

Still pending for the complete Linear scope: all catalog recipes and gathering
activities, region/faction constraints, gameplay input receipts, restart replay,
authenticated browser play, and matching production revision/schema receipts.
