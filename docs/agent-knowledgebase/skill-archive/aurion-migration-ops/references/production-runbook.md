# Aurion Production Migration Runbook

## Purpose

This runbook exists to keep production schema work inside Aurion's canonical, revision-bound control plane. The bundled skill does **not** open an SSH/Paramiko side channel and does not apply raw SQL directly.

## Canonical production surfaces

Repository truth:

- `scripts/verify-drizzle-migration-chain.ts`
- `pnpm verify:migrations`
- `drizzle/meta/_journal.json`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/build-aurion-production-apply-artifact.mjs`

Read-only production truth:

- `.github/workflows/aurion-production-schema-readback.yml`
- installed root runner `/usr/local/sbin/aurion-production-schema-reconcile`
- immutable reconciliation artifact bound to the exact source revision

Mutation truth:

- `.github/workflows/aurion-production-schema-apply.yml`
- exact source revision
- exact `planSha256`
- GitHub Actions OIDC authorization bound to repository, main, workflow, production environment, revision and plan
- installed root apply runner
- backup, isolated restore/recovery proof, advisory locking, migration apply, and postflight

Runtime truth:

- immutable/revision-bound Aurion deployment artifact
- public/internal health readback whose observed revision equals the expected revision
- bounded container/database evidence where required

## Before source changes

1. Resolve the exact target repository and revision.
2. Inventory the complete Drizzle journal and SQL files.
3. Read the production reconcile/apply artifact builders and determine their managed migration wave.
4. Run `python3 scripts/aurion_guard.py repo-audit ...`.
5. Treat `newerJournalTagsOutsideContract` as a production-contract drift candidate, not permission to append tags blindly.

## Extending production contract coverage

When repository migrations have advanced beyond the production reconcile/apply artifact wave:

1. inspect every uncovered SQL migration;
2. confirm additive semantics and preserved historical data;
3. inspect dependent earlier schema required to replay each migration;
4. extend both reconcile and apply artifact manifests in the same source change;
5. extend the reconciliation schema contracts/expected fingerprints;
6. extend root-runner, artifact, journal-watermark, backup/recovery and apply tests;
7. execute the real disposable MariaDB integration lane used by Aurion;
8. rebuild immutable artifacts on exact head;
9. do not call the gap repaired until fresh production readback covers the extended wave.

## Read-only production reconciliation

A readback receipt must be source-revision bound, read-only, and explicitly state that credentials were not returned.

Accepted states:

- `PRESENT_SCHEMA_MATCH`: expected schema/journal contract matches live state.
- `RECONCILIATION_REQUIRED`: expected migration/schema is absent without reported drift; an apply may be planned after all gates.
- `PRESENT_SCHEMA_DRIFT`: live schema differs from the expected contract; no automatic database mutation.
- `UNREADABLE_FAIL_CLOSED`: the state cannot be trusted; repeat read-only evidence or repair the exact readback infrastructure.

A receipt with wrong revision, wrong record type, or a credential-return flag other than `false` is rejected.

## Production apply

The skill never directly calls MariaDB for mutation. Apply through the canonical workflow only.

Required bindings:

- exact 40-character Aurion source revision;
- exact 64-character `planSha256` from a verified migration plan;
- the standing integration autonomy policy allows the agent to proceed, while the canonical OIDC/root control plane independently authorizes the production apply;
- current repository audit has no blocking/source-truth drift;
- fresh production readback is applyable and not `PRESENT_SCHEMA_DRIFT`;
- production artifact covers the migration wave;
- backup and isolated recovery proof pass before production write.

The root runner must remain a fixed command surface. Never add a generic SQL argument, database selector, Docker argument, arbitrary file path, or generic root shell to make an apply easier.

## Postflight

After an apply:

1. parse the canonical apply receipt;
2. accept `APPLY_SUCCEEDED` / `ALREADY_APPLIED` only as the apply operation result;
3. require postflight state `PRESENT_SCHEMA_MATCH`, otherwise classify as `UNVERIFIED` and run fresh canonical readback;
4. verify deployed runtime revision equals expected source revision;
5. run relevant API/browser/gameplay regression smoke on the deployed revision when the migration backs visible product behavior;
6. compute final guard metrics;
7. global green requires `syncPpm=1_000_000`, zero `UNVERIFIED`, zero `BLOCKED`.

## Failure handling

### `UNREADABLE_FAIL_CLOSED`

Run at most three bounded read-only rechecks. Each attempt must produce new output/hash. If the failure is deterministic, stop retrying and repair the readback infrastructure identity instead.

### `RECONCILIATION_REQUIRED`

Do not call it a failure and do not call it green. It is a precise live state: expected schema is absent and may be applyable after plan/authorization/backup/recovery gates.

### `PRESENT_SCHEMA_DRIFT`

Block automatic database repair. Capture the exact differing schema properties, locate the source/ownership boundary, and implement a forward-tested reconciliation change. Never edit the receipt or journal to disguise drift.

### Retryable apply failure

Fresh readback first. Retry only the same canonical workflow, same revision, and same plan hash if the new preflight proves the same safe state/prefix. Never re-run a mutation blindly.

### Non-retryable apply failure / journal conflict / hash mismatch

Stop. Preserve backup and receipts. Repair the source/toolchain cause and rebuild/reverify. Do not overwrite history.

## Secrets

- Do not read production DB credentials into the model/chat.
- Do not `docker inspect` environment values for reporting.
- Do not put credentials in CLI arguments, receipts, logs, PR comments, Linear, or artifacts.
- Protected values remain inside root-owned production configuration and canonical runner boundaries.

## Evidence retention

For every integration retain non-secret identities where available:

- source revision;
- PR head and merge revision;
- migration tag list;
- raw migration hashes / artifact checksums as produced canonically;
- plan hash;
- reconcile receipt hash;
- apply receipt hash;
- runtime image/container/revision identities;
- regression command/result identity.

A later receipt never retroactively proves an earlier revision.

## Peer choreography before production resolution

When the migration plan depends on WASD and the peer evidence is missing or stale, do
not ask for repeated owner approval. Run the `choreograph-wasd` guard, execute its
canonical GitHub dispatch intent through the authenticated control plane, verify the
returned source ledger, and regenerate the Aurion migration ledger if its source binding
is stale. Only the verified Aurion plan may enter the existing production apply gate.

A WASD or Aurion source defect may be repaired autonomously only after causal ownership
is established. That repair remains an isolated workspace/Draft-PR change until its own
regressions and fresh cross-repo ledger prove the new contract. Production authorization
continues to live exclusively in Aurion's existing OIDC/root apply lane.
