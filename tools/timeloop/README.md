# Aurion Timeloop Offline Analysis Bridge

This directory is a deliberately small analysis/projection boundary for Timeloop. It does not add Timeloop to the Aurion runtime, does not change Causal Tick semantics, and does not create a gameplay, persistence, rendering, NPC, or scheduling authority.

## Existing-issue reconciliation
- #616 remains the owner of the non-authoritative DES/validation ResultSet and is the integration lane for this adapter.
- #556 remains the canonical Aurion cross-phase work-order layer; this bridge must never become another scheduler.
- #267 remains the high-density/render measurement gate; its measured JS/typed-array benchmark is evidence of that benchmark only.
- #591 remains the deterministic Game-Theory/CAG compiler/proof lane; Timeloop is not a CAG/world-truth engine.

## Current integration state
Aurion currently has a presentation benchmark in client/src/xaurion/spatial/RenderEcsPilot.ts, but the repository does not expose a live tensor-algebra gameplay kernel. Therefore the first integration is intentionally a prospective vector-elementwise proxy manifest, not a claim that the current JavaScript loop can be directly optimized by Timeloop.

The manifest binds:

Aurion source revision + source blob SHA + bounded workload descriptor + exact Timeloop upstream commit -> deterministic manifest hash

The bridge rejects wall-clock/randomness-shaped fields and requires the Timeloop upstream commit to remain pinned.

## Why no runtime dependency?
Timeloop is an analytical mapping tool for explicit tensor-algebra workloads. Its mapper searches a mapping space and optimizes modelled metrics; those results are useful only as offline analysis evidence for Aurion. A successful mapper run must never mutate canonical state or be interpreted as gameplay/runtime correctness.

## Exact upstream pin
- Repository: https://github.com/NVlabs/timeloop
- Commit: 32370826fdf1aa3c8deb0c93e6b2a2fc7cf053aa

The companion Accelergy/Timeloop infrastructure repository is not imported into the Aurion runtime and is not currently pinned as a production dependency.

## Running the bridge
pnpm timeloop:check
pnpm exec vitest run tools/timeloop/timeloopManifest.test.mjs

This only validates the deterministic manifest/provenance boundary. It does not execute the upstream Timeloop mapper.

## Future external execution gate
Before any real Timeloop execution is added:
1. keep the upstream source at an exact immutable revision;
2. record toolchain/image identity separately from the Aurion manifest;
3. use a bounded explicit tensor workload that has a documented semantic mapping;
4. store Timeloop output as non-authoritative analysis evidence;
5. bind output hash to the same source revision/fixture;
6. compare any proposed implementation with Aurion's existing #616/#139 replay evidence;
7. never let mapper output choose or mutate gameplay state automatically.

This preserves the Aurion simulation -> typed output -> causal receipt truth boundary.
