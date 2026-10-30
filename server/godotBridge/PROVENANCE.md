# Aurion Godot bridge admission

Source: owner-supplied `aurion-godot-bridge.zip`, SHA-256
`d76b6bdea095e17c9d34e36654ff2e968aeaae49950f82009248433263010607`.
The supplied README reports 15 mock-backed transport tests and no executed Godot test.
The original archive remains unchanged. This integration uses Aurion's existing locked `ws` dependency.

| Surface | Role |
| --- | --- |
| `feed` and `aurionAdapter` | Read-only projection of validated canonical tick receipts |
| `bridge` | Transport mirror; never a world or persistence owner |
| `godot-client/addons/aurion_bridge` | Editor/client projection and untrusted user intents |
| `dev` | Supplied test doubles, outside the production import graph |
| `tickRecorder` observer | Detached observations; no tick, RNG, intent or receipt changes |

The canonical adapter covers players and mobs of an already active zone. It does not activate a zone,
create a player, generate terrain, invent model mappings, or reconstruct the world from heuristics.
Fixed X/Z values are divided by 1000; Y=0 is an explicitly flat marker projection, not terrain height.
Every accepted production frame carries a real source revision, committed tick, receipt/state hash,
transport instance and a checked hash of the projected data. Image provenance may still be UNVERIFIED.
An empty but confirmed snapshot is valid. Missing, invalid or stale upstream data is not healthy.

No producer listener is created unless `AURION_GODOT_FEED_TOKEN_FILE` is configured.
The producer defaults to `127.0.0.1:39220`; container deployment needs an explicit container bind and a
host publication bound to loopback. The sample service does not modify the running game server.
Production builds come only from the exact-head CI artifact and its build manifest.

Generic upstream mapping and the supplied mock server are not valid production-world evidence.
The canonical producer deliberately advertises no generic edit handler. Flipping BRIDGE_EDIT does not
create permissions, spawn/move/remove/set semantics, quest handlers, persistence or causal receipts.
Authoring must use Aurion's existing role-checked plan/apply/receipt/readback contract before a write path
can be admitted. A queued-command acknowledgement is not proof of an applied change.

Credentials stay in protected runtime files/process memory; the editor no longer serializes or saves
its token. The plugin preserves other editor/autoload owners. The bridge is not enabled in the tracked
project configuration and no production deployment is implied by vendoring or CI.
