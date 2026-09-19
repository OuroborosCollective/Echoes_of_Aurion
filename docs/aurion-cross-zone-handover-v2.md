---
description: "Wave 2 Step 23: receipt-bound, restart-safe Cross-Zone Handover V2."
---

# Cross-Zone Handover V2 — Step 23

Aurion remains the sole gameplay authority. Cross-zone transfer state coordinates one existing authority handoff; it is not a second world-state source.

## State machine

```text
PREPARED
  -> SOURCE_FROZEN
  -> TARGET_ACCEPTED
  -> SOURCE_FINALIZED
  -> COMMITTED
```

Terminal fail-closed states are `REJECTED`, `EXPIRED` and `UNPROVABLE`.

The ownership invariant is stricter than “never two owners”: there is always exactly one logical owner. Source remains the owner through `TARGET_ACCEPTED`; target acceptance is only a deterministic reservation receipt. The owner switches to target in the same MariaDB transaction that appends `SOURCE_FINALIZED` and `COMMITTED`.

## Evidence binding

A V2 transfer binds:

* source world, zone and tick;
* source causal receipt and source state hash;
* canonical payload hash;
* target world and zone;
* deterministic target-acceptance receipt;
* the hash of the previous transfer-state receipt;
* the current transfer-state receipt hash.

Preparation fails unless the referenced source causal tick receipt exists and its persisted post-state hash matches `sourceStateHash`.

## Persistence and recovery

Migration `0051_aurion_cross_zone_handover_v2` extends the historical transfer table and adds:

* `aurionCrossZoneTransferReceipts` — append-only state-transition receipts;
* `aurionEntityZoneOwnership` — one authoritative owner row per entity.

Every V2 state transition locks the transfer and entity ownership row with `FOR UPDATE`. Restart recovery does not depend on process memory: a new service instance reads the persisted transfer, receipt chain and owner row and resumes at `FREEZE_SOURCE`, `AWAIT_TARGET` or `FINALIZE`.

## Duplicate and delay semantics

Identical prepare/accept/finalize calls are idempotent. A conflicting duplicate target acceptance fails closed. Delayed source messages may read a newer state but may not regress it. Two concurrent target attempts for one entity compete on the single owner lock, so at most one transfer is admitted.

## Readback

Operator CLI:

```bash
pnpm exec tsx scripts/read-aurion-cross-zone-transfer.ts --transfer <xfer2-id>
```

Exit codes:

* `0` — receipt chain and owner invariant both valid;
* `1` — evidence exists but chain/owner invariant is contradicted;
* `2` — transfer evidence unavailable;
* `64` — invalid CLI input.

Admin Causality readbacks are also read-only:

* `causality.explainCrossZoneTransfer`
* `causality.getEntityZoneOwner`

No endpoint here grants gameplay mutation rights.

## Reproducible tests

Contract and negative cases:

```bash
pnpm exec vitest run server/causality/crossZoneSynchronizationService.test.ts
```

Real isolated MariaDB scenarios:

```bash
NODE_ENV=test AURION_CROSS_ZONE_E2E=1 pnpm exec vitest run server/causality/crossZoneHandoverMariaDb.test.ts
```

The MariaDB suite uses an actual Aurion zone tick as source causal evidence and covers normal transfer, duplicates, target offline, source/target restart, delayed delivery, rejection, replay and concurrent transfer attempts.

## Rollback and recovery

Migration 0051 is expand-first: legacy transfer columns/states remain readable while V2 adds nullable evidence columns and new tables. Application rollback may stop producing V2 transfers, but it must not delete V2 transition receipts or rewrite entity ownership history.

Recovery rules:

* `PREPARED` resumes with source freeze;
* `SOURCE_FROZEN` waits for target acceptance or explicitly expires/rejects;
* `TARGET_ACCEPTED` resumes the atomic finalize/commit;
* `COMMITTED` is idempotently terminal;
* contradictory owner/receipt state is evidence to investigate, never a reason for silent destructive repair.

A database rollback that drops 0051 tables/columns is not an automatic recovery path. Preserve evidence first, then use an explicitly reviewed schema recovery plan.

## Current live-zone boundary

The public gameplay ticket/gateway still admits only `observatory_threshold`. Step 23 does not invent additional live zone runtimes or silently convert content-region names into active simulation processes. The V2 handover contract and persistence are therefore safe for multi-zone authority coordination without claiming that a second live zone has already been deployed.
