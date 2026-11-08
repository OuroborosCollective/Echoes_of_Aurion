# Aurion Always-On World + Godot Approved Catalog Mirror

**Ownership:** Only Aurion may advance canonical ticks, NPCs, world and receipts. Godot receives presentation assets and confirmed projections. This implementation never creates a synthetic player or replays unverified state into a live world.

## World boot

Production starts the `observatory_threshold` zone after the real persisted-head settlement, through `ZoneRegistry.getOrRecover`. This reuses the exact checkpoint/receipt/replay validation used by authorized player admission and leaves the 100 ms tick unchanged. A failed settlement **must** leave the zone inactive. `/healthz.alwaysOnWorld` is an operational readback, not proof of a rendered viewport or persisted tick.

The checked Docker Compose config defaults `AURION_ALWAYS_ON_WORLD_ENABLED=1`. The deployment operator may set it to `0` in the approved runtime environment to disable automatic activation; disabling does not affect authenticated zone joins or the global NPC economy timer. A zone that is already active runs independently of player leases. This only activates the zone supported by the existing Godot feed; it does not pretend other regions are already running zone simulations.

At 10 Hz a zone could issue **864,000 causal tick receipts/day**. Before and after rollout, record exact server revision/image, highest durable receipt/tick and time, growth in DB tables, queue depth, readback status, DB backup capacity and recovery time. Repeated idle ticks are real receipts, not free. Stop promotion on sustained persistence degradation. Do not delete tests or skip recovery/receipts to improve numbers.

## Approved GLB synchronization

`scripts/godot/sync-approved-glbs.mjs` reads the public, approved `https://arelogic.space/api/game/glb-catalog` readmodel and all primary + LOD SHA-256 download URLs. It searches an existing Godot project for identical physical `.glb` bytes, reuses verified existing sources, downloads only missing approved hashes, checks glTF 2.0 header, exact digest and size, writes atomically under `res://assets/aurion-catalog-sync/` and atomically publishes a content-addressed local manifest. Manual Godot files are never overwritten/deleted. Old content-addressed mirror files remain available for historical references; only the new manifest is active.

The script is *not* a gameplay authority, GLB approval path, asset assignment or automatic placement tool. It does not generate mesh colliders or force a particular 3D node to appear. Approved GLBs appearing in the Godot Editor FileSystem panel is distinct from model usage in a scene, and Godot headless import is a separate evidence gate.

### Isolated validation

`node --test scripts/godot/sync-approved-glbs.test.mjs` covers exact copy, deduplication, LOD, corrupted bytes, untrusted URL, revision update, symlink denial, catalog validation, temporary-file cleanup on failed writes, foreign-owned project refusal and root refusal (the last two need root to set up and are skipped otherwise). The test creates a temporary real on-disk Godot-shaped project; it does not use a live DB or claim live rendering.

### Host installation after approved runtime revision

With a verified immutable release directory containing `manifest.json`, `scripts/godot/sync-approved-glbs.mjs` and the two systemd units, the release operator may run:

`sudo bash deploy/install-aurion-glb-catalog-sync.sh /srv/serverin/releases/<approved-exact-sha>`

The installer pins the script to that release's full SHA (root-owned, read-only for the service account), refreshes a managed symlink and enables a **one-minute timer**. The service runs as `aurion-deploy`, the account that owns the editor workspace and runs the Godot editor; the script refuses to run as root and refuses a project directory owned by another account, so no privileged write ever happens inside a directory an unprivileged user controls. Each run derives the active Godot editor project from `serverin-aurion-godot-editor.service`'s `WorkingDirectory`, rather than writing into a stale workspace. It requires only public read endpoints, validates each asset before introducing it to Godot and can be audited via `systemctl status aurion-glb-catalog-sync.service` and the local `catalog-manifest.json`.

The separate Godot FileSystem importer scans the newly added GLBs. If a native import or dependency fails, retain the exact hash and error, do not mark it rendered. In production the script must be installed and read back independently; repository CI alone does not install a timer on the VPS. Ensure the release packaging includes the new script and units or use a revision-pinned, manually reviewed installer source.

## Truth gates

1. Production boot: no authenticated clients, receipt-bound zone recovery, sustained advancing actual ticks, zero forced joins, 10Hz, no duplicate activation, shutdown leaves durable.
2. Godot catalog: enumerate all approved physical SHA variants, complete sync with zero missing hashes, correct revision, readback of each file hash, real headless Godot import and visible editor FileSystem state.
3. Visual parity: authenticated real Godot game client sees terrain, placements, NPCs and monsters; GLB availability alone never claims viewport parity.
