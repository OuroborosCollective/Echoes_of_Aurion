# Causal Truth Repair — working note

This branch repairs the causal/evidence lane introduced on `main` without claiming production verification early.

## Required truth boundaries

- Aurion remains the sole gameplay/world authority.
- Network handlers enqueue intents; canonical gameplay mutation happens at the fixed tick boundary.
- Evidence persistence is observational and must not block or advance gameplay ticks.
- Replay is side-effect-free and may return `MATCH`, `FIRST_DIVERGENCE`, or `UNPROVABLE` only from evidence it can actually observe.
- Primary tick receipts and checkpoints are append-only; cold storage copies evidence instead of deleting its source.
- Recovery verification never performs an automatic rollback. Recovery is a read-only plan until a separate consented control-plane contract exists.
- Missing build/runtime provenance is reported as `UNVERIFIED`, never filled with synthetic digests.
- Global epoch ↔ zone tick correlation remains `UNOBSERVABLE` until an explicit binding contract exists.
- ChatGPT causality tools are read-only and preserve `VERIFIED`, `CONTRADICTED`, `UNPROVABLE`, `UNOBSERVABLE`, and `UNVERIFIED` distinctions.

This note is not runtime evidence and is not a `Memory.md` closeout. Final evidence remains gated on exact-head CI, schema/runtime readback, then exactly one short `Memory.md` entry before merge.
