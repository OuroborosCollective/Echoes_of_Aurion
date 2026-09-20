---
description: "Receipt-bound epoch chunk projections, actual-byte workers and AX1 presentation evidence."
---

# World-Chunk Projection V2

Status on 2026-09-20: real MariaDB/CLI and three-viewport renderer evidence passed on technical head `515afb2376ff3216a6c8e2513195570a4dd0e106`. Final-head checks after main integration and GLB test correction, merge and production readback remain required.

## Authority boundary

The earlier NPC provenance implementation in PR #430 did not complete the master handoff's world-chunk Step 28. Its historical Memory entry is preserved. The prerequisite [PR #434](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/434), merged as `b3eec2e594bcfc1b026210a5c677be4f0894b65b`, supplies canonical chunk state, epoch-snapshot receipts and World Root V2. An unrelated zone receipt is never used as chunk provenance.

The protected `gameplay.worldChunkProjectionV2` endpoint calls `worldCausalRootService.readChunk` first. That readback verifies the persisted root, reconstructs the actual canonical base and historical delta prefix, and verifies receipt/state membership. Missing or altered evidence returns `UNPROVABLE`. Only the verified state's public structures and roads enter deterministic strict JSON; raw deltas, actor/intent fields and the private seed are not copied into the envelope.

The manifest binds world/universe, coordinate, schema/policy, authority state, receipt, world root, actual payload bytes and their length. SHA-256 domains distinguish projection and manifest from state identity. V1 remains byte compatible. The pure manifest helper proves integrity of supplied references, not their truth; authoritative provenance comes from the authenticated server readback.

## Active AX1 path

`ConfirmedChunkProjection` requests the current authenticated world's epoch and a bounded 3 × 3 window using canonical 64 m coordinates. At most two requests/workers run concurrently. A real module worker rehashes and validates actual bytes; the main thread independently checks job, generation, manifest, payload and result before applying them. Retired renderer generations and old centers cannot apply pending results. The authenticated world readback is polled every five seconds while the runtime is active; an advanced canonical epoch retires the old renderer and projection and rebuilds both from the new server packet without requiring the player to leave `/play`.

The view-only overlay uses deterministic construction markers for the two supported structure keys and road surfaces. It has no collision, command or authority callbacks. AX1's existing terrain manager and separate static GLB catalog retain their responsibilities; this receipt-bound layer covers confirmed constructions and roads.

Failed decoding, unsupported assets, failed geometry construction or absent authority leave that chunk unapplied. Explicit authority `UNPROVABLE` pauses that coordinate immediately. Transport and worker failures remain in the current interest window and retry while the player is stationary with simulation-time exponential delay, stopping after four attempts. A changed center retires unrelated retry state; a new epoch creates a new projection context. Disposal terminates workers and frees geometry/materials. Actual renderer recovery obtains authenticated world context and rebuilds the overlay from the persisted epoch. Projection hashes describe intended bytes, not proof a human saw particular pixels.

The server coalesces concurrent verification of the same immutable world epoch and caches only successful replay results for ten seconds, with a 32-epoch LRU bound. `UNPROVABLE` and divergent results are never cached. Chunk bytes and receipt membership are still reconstructed per requested coordinate. This prevents the 3 × 3 client window from replaying every zone receipt and committed chunk prefix nine times while preserving periodic detection of changed evidence.

World Root V2 has explicit snapshot limits and requires the source revision's generator for historical reconstruction. After deployment, an old epoch can therefore be `UNPROVABLE` until a normal authoritative epoch is resolved under the available revision. This read endpoint never resolves an epoch or repairs history to make a projection green.

## Acceptance and remaining evidence

| Deliverable | Implementation and gate |
| --- | --- |
| D1 expanded contract | Strict V2, separate authority/projection hashes; V1 unchanged |
| D2 deterministic builder | Public payload from independently reconstructed canonical chunk state |
| D3 worker binding | Active AX1 module worker validates actual bytes and generation before insertion |
| D4 connection interest root | Runtime N/A: no per-connection visibility authorization. Optional pure helper remains tested, commits sorted unique projections and rejects mixed world roots/policies; different chunks correctly have different receipts |
| D5 renderer/failure evidence | Negative unit tests, stationary retry, live epoch refresh, plus actual WebGL2 context loss and WebGPU device destruction/recovery in three-viewport AIM-290 CI; exact-head browser result required |
| D6 CLI | Persisted epoch/chunk explain below; fresh-process execution in real MariaDB regression |
| D7 Memory | One existing Step-28 entry with dated scope continuation; integrate runtime evidence after logs are available |
| D8 merge/readback | Final-head checks, authorized merge, main tree and normal deployment readback required |

A1/A2 come from the merged canonical chunk/World Root prerequisite. A3 preserves V1; A4 is the active worker; A5 is the real renderer lane. Step 29 remains dependent until Step 28 merge/readback.

## Failure and evidence boundaries

| Risk | Detection and boundary |
| --- | --- |
| Projection becomes authority | Protected read-only producer; reconstruction before manifest; no gameplay callback |
| State/projection confusion | Distinct domains and explicit fields; manifest cannot replace receipt |
| Unstable ordering | Canonical payload; sorted optional interest commitment; duplicate rejection |
| Renderer failure changes gameplay | Negative construction tests and actual context/device loss; same persisted root and payload read back after recovery |
| Manifest/payload drift | Both threads hash bytes, validate strict identity and reject stale generation |
| Client privacy | No observation storage, session secrets or raw private authority objects |

The isolated browser lane registers a real player, starts the authoritative zone, performs an authenticated construction action and resolves an epoch through the normal admin API while the player remains in `/play`. Temporary admin assignment is restricted to disposable `aurion_browser_test` and restored in `finally`. No synthetic receipt/root is inserted. The test requires the active renderer to adopt the new epoch, then requires a nonempty applied overlay before and after real failures and reads the same persisted packet again. SwiftShader is software-renderer evidence, with no hardware-performance claim.

## Reproducible checks

```bash
pnpm exec vitest run server/worldChunkProjectionProtocol.test.ts server/worldChunkProjectionV2.test.ts server/worldChunkProjectionRuntime.test.ts client/src/xaurion/integration/AurionOpenWorldRuntime.test.tsx
pnpm check
pnpm test
pnpm build
# With isolated MariaDB and the built application:
pnpm exec vitest run server/worldEpochReaction.e2e.test.ts
pnpm exec playwright test --config=playwright.aim290.config.ts
node --import tsx scripts/explain-aurion-projection.ts --world echoes-of-aurion-global --epoch 1 --chunk-x 0 --chunk-z 0
```

The CLI uses the actual epoch/chunk identity rather than inventing a tick-to-chunk or connection-authorization mapping. Exit 0 requires verified persisted evidence; absent evidence exits 2 and invalid invocation 64. `--manifest <file>` remains offline integrity only and exits 2 even for a matching hash.

Local focused regression: 4 files / 31 tests and TypeScript/build PASS. Technical-head Local Test Pack `35534885023` passed real MariaDB reconstruction, tamper rejection, fresh projection CLI and full regression (269 files / 1,184 tests; 169 environment-gated skips). AIM-290 `35534884992` passed all three actual WebGL2/WebGPU recovery profiles. GLB upload lane `35534885002` exposed a stale pre-layout scroll extent; the next run additionally showed Home leaving the container at its bottom. The test now waits for loaded content and targets real wheel input at the container in both directions, checking its current extent without assigning scrollTop. The final head must rerun this lane and all triggered checks. No migration. Reverting the integration removes presentation without changing receipts/world state.

Historical Wolfram finite-model evidence covers permutations/subsets of three identifiers, not collision freedom or runtime truth. Local Game Development Studio CLI is unavailable; browser CI provides rendering evidence. The supplied handoff defines Steps 22–31; Steps 32–33 are not invented here.
