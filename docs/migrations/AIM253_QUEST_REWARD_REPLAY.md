# Native quest reward replay and deterministic identities

The native turn-in commits the base quest reward once and then finalizes result evidence, exact combat mastery, loot and equipped-weapon mastery. These finalizers are separate transactions. This change serializes repeated result/skill/weapon operations under the same player lock before their first replay read, and compares the complete persisted request evidence. Reusing another player's result key or changing a skill amount or weapon XP is rejected.

Result, skill, weapon receipt, native quest ledger and dungeon-key identities now derive from a versioned SHA256 tuple of domain, owner and confirmed source key. Existing receipt IDs remain readable. No clock or random stream enters these new identities. Affix and set candidates have explicit catalog-key ordering before seeded selection. Authentication credentials retain cryptographic entropy.

The weapon finalizer returns the profile read inside its transaction: calling the separate profile-creation connection while holding that profile's lock would deadlock. An equipped-weapon concurrent native turn-in regression verifies one result, skill event, item and weapon receipt with exactly 10 spear XP.

The previously database-skipped Lyra and complete three-quest chain tests are now part of the isolated MariaDB workflow. Their repeated turn-in assertion verifies recovery with unchanged rewards. Cleanup requires the explicit E2E flag, loopback host and the actual selected `_test` database, and removes all fixture receipt/origin rows.

This does not claim a single atomic transaction across all finalizers or a new durable reward-plan outbox. The current independent stages recover from their own immutable receipts; freezing a not-yet-created drop/weapon plan across intervening loadout/profile changes remains separate work.
