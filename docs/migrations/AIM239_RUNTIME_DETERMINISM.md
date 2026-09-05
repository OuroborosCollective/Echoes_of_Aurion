# AIM-239 runtime determinism and lifecycle

## Bound source

WASD normative source: `7bd039bb79681d2df342abe160579f89ca3ff8ed`.
AX1 content/engine source: `d356881538dae23c3aa97364a5596d48b6ac3079`.
The original source inventories are preserved; these are Aurion integration adaptations.

## Implemented boundary

The imported `client/src/xaurion` code uses `DeterministicSimulation` for named
random streams and logical timestamps. A scene requires an explicit world seed and
nonnegative epoch. There is no replacement production seed when that context is absent.
The RNG version is `aurion-projection-v1`; changing its algorithm requires a version change.
Streams separate visual draws from combat, loot, patrol and bounty selection.
Fisher-Yates replaces random-sort bounty selection. Static equipment textures use
their own material seed, so cache or construction order does not change a texture.

Projection updates run in complete 100 ms steps. Render scheduling uses monotonic
frame time only to request those steps. IDs and diagnostic event timestamps use
logical tick/sequence values; they are not Unix timestamps. Server receipts, zone
snapshots and persisted inventory remain the authority. Deterministic legacy
combat/loot functions do not establish their production integration.

Authentication expiration, database plan expiration and external capture freshness
are separate infrastructure clocks. They are not replaced with frozen simulation
time: doing so would disable expiry or incorrectly accept stale external input.
They must not be used as gameplay random seeds or progression timestamps.

## Failure handling

The world UI has its own error boundary. Failed render loops stop their generation;
return/unmount closes owned sockets and ignores late ticket results. Socket
messages are validated before projecting integer positions. A closed or retired
socket cannot alter the current connection's state. Reentry obtains a new ticket.

## Regression evidence

- `aim239DeterministicProjection.test.ts`: independent streams; real mob, loot and
  bounty module replay across two render cadences; invalid seed/epoch/time rejection;
  AST gate against implicit random and wall-clock calls in imported runtime source.
- `RuntimeFrameLoop.test.ts`: late failure, retired generation and stop during frame.
- `AurionOpenWorldRuntime.test.tsx`: late ticket and error/session cleanup.
- `OpenWorldErrorBoundary.test.tsx`: tower remains mounted and return remains available.
- `zoneMovement.test.ts`: malformed snapshot and obsolete/connecting socket behavior.
- `aim243WorldCore.test.ts`: weather uses epoch/tick without calling the wall clock.

## Remaining migration gates

This evidence is a code and regression gate, not an authenticated production play
receipt. AIM-248/251 persistent mastery/crafting integration and the remaining
AIM-257 content-system lanes, full snapshot-driven HUD, immutable deployment,
reconnection/rehydration and the authenticated gameplay loop remain required.
