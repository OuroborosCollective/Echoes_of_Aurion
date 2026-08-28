# Aurion Migration Chain Reconciliation — 2026-08-28

## Purpose

This document records a revisions-bound defect in the Echoes of Aurion MySQL/Drizzle migration chain and the fail-closed guard introduced before any production reconciliation. It does **not** claim that production schema is missing or present merely because repository SQL files exist.

## Bound source and proof run

- Fix branch baseline: Aurion `main@c0ad8967046c52141cf1b5f69874a0c53117fbe2` before the documentation-only truth-snapshot merge.
- Proof workflow run: GitHub Actions `33160571824`.
- Isolated database: fresh `mariadb:11.4` service created only for the proof run.
- No production database, production container, production environment file, or live player data was accessed or mutated by this proof.

## Repository defect

At the proof revision, `drizzle/` contained **28 numbered SQL migration files**, while `drizzle/meta/_journal.json` contained **21 entries** and ended at `0020_wasd_aurion_dialogue_quest_intents`.

The deterministic chain inspector identified exactly seven SQL files that were not reachable through the current Drizzle journal:

1. `0021_aurion_global_world_state`
2. `0022_aurion_world_chunk_deltas`
3. `0023_aurion_world_presence_epochs`
4. `0024_aurion_world_epoch_reactions`
5. `0025_aurion_loot_mastery_ethos`
6. `0026_aurion_faction_questline_state`
7. `0027_aurion_faction_questline_rewards`

The same inspection found no missing SQL for existing journal entries, no duplicate numeric prefixes, no duplicate journal tags, and sequential journal indices. The defect is therefore a specific **journal cutoff**, not a general migration-directory corruption.

## Independent fresh-database proof

The one-shot proof intentionally performed two different actions against the same fresh isolated MariaDB:

### 1. New fail-closed guard

`pnpm verify:migrations` returned non-zero as designed and reported:

```json
{
  "recordType": "aurion_drizzle_migration_chain_check",
  "ok": false,
  "sqlCount": 28,
  "journalCount": 21,
  "unjournaledSqlTags": [
    "0021_aurion_global_world_state",
    "0022_aurion_world_chunk_deltas",
    "0023_aurion_world_presence_epochs",
    "0024_aurion_world_epoch_reactions",
    "0025_aurion_loot_mastery_ethos",
    "0026_aurion_faction_questline_state",
    "0027_aurion_faction_questline_rewards"
  ],
  "missingSqlTags": [],
  "duplicateNumericPrefixes": [],
  "duplicateJournalTags": [],
  "journalIndicesSequential": true
}
```

### 2. Existing Drizzle migration command without the guard

The proof then deliberately called the existing migrator directly with:

```text
pnpm exec drizzle-kit migrate
```

Drizzle reported:

```text
migrations applied successfully!
```

That message was **not** accepted as proof of the repository's full schema. Immediate `information_schema` readback returned **51 tables**, confirmed the journaled 0020 table `aurionDialogueCommandReceipts`, and confirmed that none of the following representative late tables existed:

- `aurionGlobalWorldStates`
- `aurionWorldChunkDeltas`
- `aurionWorldPresenceLeases`
- `aurionWorldEpochReactions`
- `aurionLootDropReceiptsV2`
- `aurionFactionQuestlineStates`
- `aurionFactionQuestlineRewardReceipts`

This proves the concrete failure mode: **a successful Drizzle CLI message can coexist with omission of all seven unjournaled migrations on a fresh database**.

## Guard introduced

The fix adds:

- `scripts/drizzleMigrationChain.ts` — deterministic SQL/journal inventory and integrity inspection.
- `scripts/verify-drizzle-migration-chain.ts` — machine-readable report plus fail-closed exit.
- `server/drizzleMigrationChain.test.ts` — regression coverage for valid chains, unjournaled SQL, missing SQL and duplicate numeric prefixes.
- `package.json` script `verify:migrations`.
- `db:push` now runs `verify:migrations` before `drizzle-kit generate` / `drizzle-kit migrate`.

The guard intentionally makes the current repository migration command fail until the chain is reconciled. That is a safety property, not a regression.

## Why 0021–0027 are not journaled by this fix

Production truth is still privileged. The VPS stores `/opt/echoes-of-aurion/.env.production` as root-owned mode `0600`, and the self-hosted `aurion-deploy` runner is intentionally limited to the root-bounded zone-promotion wrapper rather than general root/Docker/database access.

The seven late SQL files contain no `ALTER TABLE` statements, but several use ordinary non-idempotent `CREATE TABLE`. If any of those tables were previously applied manually or through another deployment path, blindly adding journal entries and replaying them could collide with real production state.

Therefore this fix does **not**:

- add 0021–0027 to the journal,
- execute them against production,
- synthesize a fake migration history,
- infer production schema from repository files,
- weaken the root/credential boundary.

## Required production reconciliation

Before the journal can be repaired, a root-authorized, read-only production preflight must report for every 0021–0027 target:

1. table presence,
2. expected columns and column types,
3. primary/unique/index constraints,
4. existing Drizzle migration journal rows and hashes,
5. current database backup/rollback point,
6. current full-runtime image/source identity.

Each target can then be classified as one of:

- `ABSENT_APPLY_REQUIRED`
- `PRESENT_SCHEMA_MATCH`
- `PRESENT_SCHEMA_DRIFT`
- `UNREADABLE_FAIL_CLOSED`

Only after that classification should a canonical reconciliation migration/journal update be produced and tested on both a fresh database and a production-shaped fixture.

## Acceptance boundary

The current repair is complete only as a **false-green prevention layer**. It proves that the repository cannot silently call `db:push` while ignoring 0021–0027. It does not yet prove production migration completion.
