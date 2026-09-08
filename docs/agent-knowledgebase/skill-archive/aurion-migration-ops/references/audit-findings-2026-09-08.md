# Audit Findings — 2026-09-08 baseline

This file records why the skill was revised. It is a historical baseline, **not** a substitute for a fresh guard run.

Repository observed during the audit: `OuroborosCollective/Echoes_of_Aurion` at `6393e974cf570ff91dc1a889e24e685b37021ca0`.

## Original skill defects

1. `scripts/apply_migration.py` called `run("STATUS_BEFORE", ...)` and then used `before.splitlines()`, but `run()` did not return stdout. A real apply would fail in preflight with a `NoneType` error.
2. `apply_migration.py`, `endpoint_probe.py`, and `server_status.py` used Paramiko `AutoAddPolicy`, silently trusting an unknown SSH host key.
3. The direct apply script contained a literal `__TARGET_TABLE__` placeholder instead of a required validated target-table argument.
4. Container/database names were interpolated into shell commands without a strict identifier allowlist.
5. DDL and Drizzle journal write were two independent mutations without a causal post-DDL/post-journal reconciliation receipt.
6. The direct path bypassed Aurion's stronger current OIDC/root-runner/backup/recovery production lane.
7. Remote health scripts did not bind results to an exact repository/deployed revision strongly enough to prove product state.
8. Script success/output text could be mistaken for product green despite missing postflight/runtime evidence.

## Current repository architecture discovered during revision

Aurion already owns stronger canonical surfaces:

- `scripts/verify-drizzle-migration-chain.ts` and `pnpm verify:migrations`;
- root-owned `deploy/aurion-production-schema-reconcile` read-only lane;
- root-owned/OIDC-bound `deploy/aurion-production-schema-apply` lane;
- `scripts/build-aurion-production-reconcile-artifact.mjs`;
- `scripts/build-aurion-production-apply-artifact.mjs`;
- production readback/apply workflows and regression lanes.

Therefore the revised skill orchestrates these surfaces rather than creating a parallel SSH truth path.

## Static contract drift candidate found at baseline

The Drizzle journal at the observed revision contained **42 entries, 0000 through 0041**.

Both production reconcile and apply artifact builders had a literal managed migration wave ending at **0034**. The journal contained these newer tags outside that production artifact wave:

- `0035_aurion_npc_memory_quest_offers`
- `0036_aurion_faction_warfront_receipts`
- `0037_aurion_trade_crafting_receipts`
- `0038_aurion_world_chunk_delta_conflicts`
- `0039_aurion_world_epoch_materializations`
- `0040_aurion_progression_receipts`
- `0041_aurion_content_hash_ledger`

This is a **static production-contract coverage candidate**, not proof that production lacks those schemas. A fresh root-owned production readback is required to classify live state. The resolver policy forbids simply appending these tags: each migration must first be proven compatible with reconcile fingerprints, backup/recovery, apply ordering, and postflight regressions.
