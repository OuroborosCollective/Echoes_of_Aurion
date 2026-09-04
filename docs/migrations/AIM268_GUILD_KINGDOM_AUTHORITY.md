# AIM-268 — Guild and kingdom authority

This migration adapts the final `-ax1` guild/kingdom product concept without importing its whole-client objects, JSON-blob persistence, `Date.now()`/`Math.random()` identities or in-memory-success fallback.

High-impact governance uses a persisted **plan → confirmation hash → apply** contract. The authenticated Aurion user and their active guild membership are derived server-side. Plans bind actor, guild, current revision, operation, exact resource set and idempotency key. Apply repeats membership/capability/revision checks inside a MariaDB transaction and locks the affected rows.

A kingdom requires at least six unique active territories, all owned by the same guild, all in one world and connected through four-neighbour chunk adjacency. The capital must be one of them. Client fields cannot select owner, ruler or guild identity. Founder/officer/member defaults follow least privilege and exact scoped grants can narrow or extend one capability.

Migration `0029_aurion_guild_kingdom_authority` normalizes governance state, grants, territories, kingdoms, diplomacy, plans and append-only receipts. It does not deploy or mutate production in this PR.
