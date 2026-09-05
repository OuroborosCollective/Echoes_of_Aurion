# AIM-262: deterministic d356 particle projection

The 18 authored particle generators come from
`OuroborosCollective/-ax1@d356881538dae23c3aa97364a5596d48b6ac3079`.
The source manifest records the full source digest and individual generator
hashes. Regression reverses only the explicit random/allocation substitutions
and verifies every generator; visual effect shapes and constants are preserved.

Visual randomness uses the existing explicit world seed/epoch and independent
ambient or receipt-scoped streams. Engine scheduling remains 10 Hz; the particle
system rejects variable simulation steps. Confirmed combat responses carry their
session/sequence identity. Repeated, old and malformed responses emit no effects;
the consumer changes no HP, XP, loot or other gameplay state.

Phone/tablet/desktop budgets are 600/1200/2400 active particles. A single geometry,
shader, texture and GPU buffer set belongs to each particle system. Dead particle
records are reused. Draw range tracks the live count, and the shader reads the
source size/alpha attributes. The deterministic radial data texture works without
a browser canvas. Disposal is idempotent, frees all three GPU resource types and
runs during engine shutdown. Disabling ambient emission still ages active cues.

Tests cover all source generators, byte-identical fixed-tick replay with different
render cadences, bounded saturation, pool reuse, invalid input, duplicate receipt
rejection and one-time resource disposal. Three.js's opaque allocation UUIDs are
outside simulation inputs and replay hashes. Metrics expose budget, active/pool
counts, reuse, dropped bursts and 10 Hz tick rate through the existing inspector.

The dedicated CI browser job uses Chromium/SwiftShader, the production build and
an isolated `aurion_browser_test` MariaDB. Disposable players register through
the real account UI. It checks authenticated entry, WebSocket movement, persisted
positions, tower return and reentry at phone/tablet/desktop sizes, plus forced
context loss on desktop. The initial epoch remains a read-only canonical view;
the test must not claim an epoch-write receipt was created by a read. Screenshots
and a revision-bound readback are retained as Actions artifacts. This gate must
actually pass before it counts as browser evidence.

This increment covers particle migration. The complete AIM-262 also requires
the remaining material/GLB/fallback ownership migration, authoritative mob and
equipment projections and an authenticated browser/device visual playtest.
