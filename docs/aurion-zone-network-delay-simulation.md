# Issue #617 — Deterministic Zone Network Delay Simulation

The simulator is a **research/validation lane**. It does not change production WebSocket semantics, schedule gameplay from wall-clock time, write directly to the database, or create a second authority.

## Contract

`aurion.zone-network-delay-simulation.v1` accepts explicit messages with:

- source/target zone
- send tick, delay ticks and derived delivery tick
- deterministic sequence and message identity
- payload hash and canonical causal-receipt hash

Delivery order is fixed as `deliveryTick → sourceZone → targetZone → sequence → messageId`. Duplicate messages are idempotent, forged or receipt-less messages are rejected, and every delivered message is bound to an existing receipt with the same source revision and ruleset.

The simulator reports both the transport-dependent `deliveryTraceHash` and the transport-independent `canonicalReceiptHash`. Different delay schedules can therefore produce different delivery traces while still producing the same gameplay verdict when the canonical receipt evidence is unchanged.
