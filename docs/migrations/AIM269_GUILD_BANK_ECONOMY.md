# AIM-269 — Guild bank and state economy

Source product concept: `OuroborosCollective/-ax1@d356881538dae23c3aa97364a5596d48b6ac3079`  
Normative rules: `OuroborosCollective/Wasd@7bd039bb79681d2df342abe160579f89ca3ff8ed`

This migration does not import the source server's mutable guild JSON, whole client item objects, `playerName = Hero`, timestamp/random item identities or in-memory-success fallback.

## Single authorities

- Player currency remains the existing `playerProfiles.aurionPoints` wallet.
- Guild currency is a normalized exact treasury account with append-only entries.
- Items are existing legacy or Aurion-v2 item instances; guild custody is an exclusive item status plus custody ledger.
- Resource balances are created only by consuming real item instances mapped server-side to wood, stone or aether.
- Buildings use final-source IDs and costs, but their effects are bounded Aurion projections. No passive currency faucet is introduced.

## Mutation contract

Every mutation uses authenticated session identity and active guild membership. A persisted plan binds actor, guild, operation, exact bank revision, idempotency key and exact resources. Apply reloads and locks the plan, membership, capability, account and affected wallet/item/resource/building rows before committing one receipt and one bank revision.

Supported operations are point deposit/withdrawal, item deposit/withdrawal, resource-item donation and building upgrade. A replay of the same confirmation returns the existing receipt; a conflicting reuse of an idempotency key is rejected.

Migration `0030_aurion_guild_bank_economy` adds treasury, custody, resource and building accounts and their ledgers. It extends existing item statuses with `guild_custody`; an item in that status cannot be used as an owned inventory item. Physical migration and runtime queries are canonical for this lane; AIM-251 will later consolidate the monolithic legacy Drizzle item declarations with the new custody status before final migration convergence.

No VPS mutation, release gate or continuity gate is part of AIM-269.
