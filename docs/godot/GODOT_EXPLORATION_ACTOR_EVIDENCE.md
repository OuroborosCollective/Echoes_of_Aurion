# Exploration memory: actor evidence boundary

The exploration endpoint accepts a discovery only for the authenticated user
with an open authoritative `observatory_threshold` connection. The user must
currently occupy the requested chunk and must also appear in that same chunk in
the final zone tick committed by the independently replayed world epoch root.
The stored discovery receipt is the server's persisted tick receipt; the client
frame remains an input for compatibility and is not trusted as evidence.

The discovery transaction locks the current world epoch, verifies the persisted
receipt against the server's recorded canonical post-state and rechecks the live
connection. A restored/replayed peer is not an open live transport. Missing
receipts, missing snapshots, changed sessions and stale epochs fail closed.

This is a conservative first boundary, not a complete live fog-of-war service:

- Only a player present in the epoch's final recorded zone tick can establish a
  new discovery for that epoch. A player joining later must wait for a suitable
  verified epoch. The in-memory recorder retains a bounded number of ticks, so
  an evicted snapshot cannot be used for a new discovery.
- The epoch lock serializes these writes with epoch advancement. Its throughput
  and any impact on large player populations have not yet been measured.
- Older records remain readable for compatibility. Their hash checks row
  integrity; it does **not** establish that the owner personally observed the
  chunk. They are not silently upgraded to actor proof, and the read API must
  not be used alone as fog-of-war authorization.
- The existing v1 field `firstDiscoveryReceiptHash` contains a chunk receipt
  in legacy rows and a zone-tick receipt in newly verified rows. Consumers must
  not infer the receipt kind from this field alone. A versioned evidence
  contract and migration are needed before making it a general visibility API.
- This change does not filter the existing world-design feed, publish scenes to
  players, or establish a Godot multiplayer or Android device acceptance.

A durable observation history and a revision/actor-scoped world-slice feed are
still needed before discoveries can drive live visibility.
