# Memory.md — Echoes of Aurion

> Project-local, append-only integration memory for `OuroborosCollective/Echoes_of_Aurion`.
> Historical bootstrap created 2026-09-09 from retrievable repository/conversation evidence.
> Keep WASD source authority and Sovereign Studio ATO strictly separate from Aurion host/persistence/presentation truth.

## Operating contract

1. Read this file before every N+1 integration session.
2. After each completed work block append exactly one entry before merge.
3. Record task, decisions, touched surfaces, tests/evidence, learned result, open points and next safe step.
4. Append-only; corrections are new entries.
5. Aurion may host, persist, transport and present confirmed truth, but it must not silently replace WASD gameplay authority.
6. Runtime claims require exact revision, immutable build/image identity, schema/readback evidence and PatchMon/container health where applicable.
7. Browser/software-renderer evidence is not native GPU/device proof unless a native device was actually measured.
8. No fake snapshots, mock DB state, ad-hoc raw-SQL shortcuts or workflow tricks may stand in for production truth.
9. Secrets never belong in this file.

## Entry format

```text
### YYYY-MM-DD — short title
Status: VERIFIED | PARTIAL | BLOCKED | HISTORICAL
Task:
Decisions:
Touched surfaces:
Evidence:
Learned:
Open:
Next safe step:
```

---

### 2026-09-07 — Trade/crafting receipt ledger (AIM-233)
Status: VERIFIED repository merge
Task: Add atomic receipt evidence for trade/crafting outcomes.
Decisions: Bind actor, resource deltas, result hash, market/profession context; enforce idempotency, operation/source uniqueness and deterministic hashes.
Touched surfaces: Migration 0037 and receipt persistence.
Evidence: PR #251 merged; head `6bf8f845e635ca7091d2c60fc0402d378236bb04`; 3 focused AIM-233 tests; migration verifier 38 SQL / 38 journal entries.
Learned: Economic effects require deterministic operation identity and replay safety at persistence level.
Open: Runtime use remains separate from schema existence.
Next safe step: Require effect/readback receipts from the exact deployed revision before treating the ledger as product proof.

### 2026-09-07 — Chunk-delta conflict persistence (AIM-234)
Status: VERIFIED repository merge
Task: Persist deterministic chunk-delta paging conflicts.
Decisions: Bind deltas to base revision, use stable paging, deterministic lowest-hash conflict winner, scope validation and idempotent persistence.
Touched surfaces: Migration 0038 and world-chunk evidence.
Evidence: PR #253 merged; head `62fb3a5b8117815e8c58049559ce555879015a2d`; 11 focused tests; 39 SQL / 39 journal entries verified.
Learned: Conflict resolution is truth-bearing and therefore must be deterministic and revision-bound.
Open: Consumer/runtime behavior still requires separate live evidence.
Next safe step: Preserve source revision and conflict receipt through every projection.

### 2026-09-07 — Presence epoch materialization (AIM-235)
Status: VERIFIED repository merge
Task: Persist receipt-bound presence epoch materializations.
Decisions: Bind world epoch, resolution index, reaction receipt/hash and deterministic presence digest; enforce replay and epoch-boundary validation.
Touched surfaces: Migration 0039.
Evidence: PR #254 merged; head `0915f7f21f2b9de3163f09f8a6eb5eb11ee67869`; 11 presence/epoch tests; 40 SQL / 40 journal entries verified.
Learned: Presence becomes durable only when epoch and causal receipt are part of identity.
Open: None beyond runtime use/readback.
Next safe step: Do not reconstruct presence from unbound UI state.

### 2026-09-07 — Consolidated progression receipts (AIM-236)
Status: VERIFIED repository merge
Task: Create canonical progression receipts across loot, mastery, XP and levels.
Decisions: Bind user/character/action/weapon-or-skill/result/loot/mastery/XP/level evidence with deterministic hashes and idempotent replay protection.
Touched surfaces: Migration 0040.
Evidence: PR #255 merged; head `1758fde377cbffc55c6de2488b445f740d32dacb`; 12 focused tests; 41 SQL / 41 journal entries verified.
Learned: Progression truth must be reconstructable from confirmed receipts, not class/name heuristics.
Open: UI readback remained a separate later integration.
Next safe step: Derive presentation only from confirmed progression receipts.

### 2026-09-07 — Append-only content-hash migration ledger (AIM-237)
Status: VERIFIED repository merge
Task: Add content-hash ledger and redacted audit receipts to the migration chain.
Decisions: Enforce append-only triggers and root-only audit evidence; classify readback as `VERIFIED`, `DRIFT` or `UNREADABLE` rather than assuming absence.
Touched surfaces: Migration 0041, migration readback classification.
Evidence: PR #256 merged; head `39f11ca0844e1f2733584c562506e3fd99b0e24b`; 8 focused tests; 42 SQL / 42 journal entries verified.
Learned: Hidden/redacted database metadata must fail closed as unreadable, not be mistaken for an older schema.
Open: Production reconciliation had to be brought through 0041 later.
Next safe step: Keep planning/apply/readback coverage aligned to the full journal.

### 2026-09-07 — Visual Item authority boundary (AIM-281)
Status: VERIFIED repository merge
Task: Define a strict presentation-only `VisualItemDescriptor` from already-confirmed Loot V2.
Decisions: Bind `visualSeed` to deterministic loot hash + receipt + visual event index; omit gameplay stats/power; reject malformed or mismatched identities.
Touched surfaces: Shared visual contract and projection tests.
Evidence: PR #257 merged; head `c1cdab14d3b88bb9a1953569a55c2e1dff2fd63b`.
Learned: Visual generation may be deterministic without becoming gameplay authority.
Open: Geometry/material/GLB/runtime integration followed in later slices.
Next safe step: Keep every visual stage downstream of the same confirmed descriptor.

### 2026-09-07 — Deterministic visual geometry compiler (AIM-282)
Status: VERIFIED repository merge
Task: Compile presentation-only Three.js geometry for weapon/armor families across LOD0/1/2.
Decisions: Use only `VisualItemDescriptor`; measure real triangle counts; deterministic structural fingerprints; reject unsupported categories rather than fake fallback identities.
Touched surfaces: Visual geometry compiler and disposal/LOD tests.
Evidence: PR #268 merged; head `01f996e6bed172fd9982696cb9d497cc40b17c4a`.
Learned: Unsupported presentation should remain explicit instead of being reinterpreted as another item type.
Open: Materials/GLB attachment were separate lanes.
Next safe step: Preserve deterministic geometry fingerprints across presentation changes.

### 2026-09-07 — Budgeted visual materials/VFX (AIM-283)
Status: VERIFIED repository merge
Task: Add presentation materials and bounded elemental VFX.
Decisions: Derive element identity only from confirmed affix IDs/groups; use externally owned visual clock; cap draw/material complexity by LOD; no stats readback into visuals.
Touched surfaces: Material profiles, VFX clock and lifecycle tests.
Evidence: PR #269 merged; head `05166c29568c35a7b73eecf1676c6d8b3e9711eb`.
Learned: Shared visual time must not advance as a side effect of item creation.
Open: Exact GLB binding/attachment followed later.
Next safe step: Keep VFX purely presentation-side and resource-bounded.

### 2026-09-07 — Exact equipment GLB overrides (AIM-284)
Status: VERIFIED repository merge
Task: Resolve only explicitly confirmed equipment `glbAssetId` values against the existing Aurion catalog.
Decisions: Require unique assetId, correct purpose/type/slot, targetKey null and storage URL bound to catalog SHA; invalid exact GLB falls back only visually.
Touched surfaces: GLB catalog resolver.
Evidence: PR #270 merged; head `df13e58c7bdf77758b7203d4cc09e995ca040374`.
Learned: A deterministic slot pool is not an exact item-to-GLB binding.
Open: Socket/actor attachment remained separate.
Next safe step: Never accept free-form URLs or a second GLB registry.

### 2026-09-07 — Visual item attachment controller (AIM-285)
Status: VERIFIED repository merge
Task: Attach exact GLB or procedural fallback through known `AnimatedGlbActor` anchors.
Decisions: Reject stale async loads; retain last confirmed visual on transient load failure; reject rigged equipment until a rig contract exists; controller owns only its procedural resources.
Touched surfaces: Attachment controller and actor regressions.
Evidence: PR #271 merged; head `cea1d47eeffa8975f712f4599339c318fe0b6883`.
Learned: Async visual completion must be generation/identity-bound or stale loads can overwrite current truth.
Open: Live receipt-backed equipment projection was the next slice.
Next safe step: Keep attachment identity coupled to the confirmed equipment descriptor.

### 2026-09-08 — Receipt-backed V2 visuals in live runtime (AIM-286)
Status: VERIFIED repository merge
Task: Switch real equipped Loot V2 items onto the merged visual compiler pipeline.
Decisions: Strictly rederive receipt hashes and parity across UI/item/receipt; V2 visuals bypass legacy slot pools; transient failure retains last fully proven visual; removal disposes compiler-owned resources.
Touched surfaces: Confirmed-equipment visual readback API, client projection and runtime attachment.
Evidence: PR #272 merged; head `c3a335427476d4e24ff43540f982fcf0a45442df`.
Learned: Presentation can be live while gameplay/DB authority remains entirely outside the renderer.
Open: No fake migration for legacy/AX1 equipment.
Next safe step: Keep V2 visual truth receipt-bound and fail closed on any parity mismatch.

### 2026-09-08 — Autonomous migration choreography guard
Status: VERIFIED repository merge
Task: Bind migration/schema/reconciliation operations to the Aurion control plane instead of ad-hoc SSH/raw SQL.
Decisions: Deterministic SQL/journal audit, immutable receipt hashes, diagnostic vs final resolver modes, cross-repo WASD choreography, raw SQL/SSH compatibility path hard-blocked.
Touched surfaces: `aurion-migration-ops` skill/control-plane guard.
Evidence: PR #273 merged; head `31817a8cc7be54ca0002b29bb5eb203c115ac722`; 32/32 local guard/integrity regressions; deterministic package reproduced byte-for-byte.
Learned: A static schema candidate is not production drift until canonical live readback establishes it.
Open: Production mutation remains behind exact revision + plan + OIDC/root + backup/recovery lane.
Next safe step: Use the control plane for every schema mutation and preserve separate provider/live evidence.

### 2026-09-08 — Deterministic chunk projection contract (AIM-288)
Status: VERIFIED repository merge
Task: Add presentation/streaming control over confirmed WASD/Aurion chunk identity.
Decisions: Versioned projection manifest, generation-bound worker identities, deterministic bounded queue and explicit state machine from Absent through Evictable; Renderable != Simulatable.
Touched surfaces: AX1 chunk projection/streaming infrastructure.
Evidence: PR #274 merged; head `89dc354f750348f213706a1f9d5d49da69514616`.
Learned: Rendering readiness cannot authorize simulation.
Open: Interest-ring/HLOD policy followed separately.
Next safe step: Reject stale generations and keep gameplay mutation outside presentation workers.

### 2026-09-08 — Interest rings/HLOD policy (AIM-289)
Status: VERIFIED repository merge
Task: Add Active/Preload/Far interest rings over deterministic chunk projection.
Decisions: Active requests confirmed simulation evidence but never simulates locally; preload only prepares presentation; far uses HLOD; eviction/visibility cannot create/delete gameplay truth.
Touched surfaces: AX1 interest/streaming cache policy.
Evidence: PR #275 merged; head `a9b6dd5bada8c37454a85c4d530ad8d755f5d376`.
Learned: LOD and visibility are presentation decisions even when they depend on confirmed world identity.
Open: None beyond later renderer work.
Next safe step: Preserve the projection/simulation authority split.

### 2026-09-08 — Standardized male/female player GLBs
Status: VERIFIED repository merge; native-device proof not implied
Task: Make owner-supplied standardized male/female player GLBs the selectable Open World avatars.
Decisions: Require confirmed public character appearance before renderer/zone transport; load exact persisted `storageUrl`; normalize rig naming and attachment aliases; equipment sizing derives from avatar height/world scale; remove active historical starter-player fallback.
Touched surfaces: Public avatar selection, rig normalization, attachment sizing and Open World startup gate.
Evidence: PR #280 merged; head `3dfb65186758705ea0b1dbfeee2679d1c730d16c`; owner upload readback accepted both GLBs and seven clips each. Female SHA `a2f9c89739d28378fe3c1c42dc1724d12b4f37a41091e2dacd116d2ff863d4c2`; male SHA `9038e10c46317ee6876c7d7ae1a9ec54eb6aaab2aa174530c97e9c9d9171097b`.
Learned: Character selection must precede world rendering when appearance is server-confirmed truth.
Open: Additional gameplay slots remain WASD-owned contracts.
Next safe step: Never infer equipment authority from model anchors.

### 2026-09-09 — Classless progression receipt readback
Status: VERIFIED repository merge
Task: Remove active class/fixed-weapon authoring and derive progression strictly from confirmed receipts.
Decisions: Legacy class DB values become non-authoritative `unbound` compatibility state; enforce 64-char receipt IDs and fail-closed multi-character conflict handling; add exact local MariaDB pack without production data/secrets.
Touched surfaces: tRPC/UI progression, receipt validation and CI MariaDB pack.
Evidence: PR #282 merged; head `c221b16a18fd1778762140fee7e2efc67cac27f8`.
Learned: Schema width is part of receipt identity; silent truncation can corrupt determinism.
Open: None specific beyond runtime readback.
Next safe step: Keep progression UI as a receipt projection, not an authoring surface.

### 2026-09-09 — Production migration contract reconciled through 0041
Status: VERIFIED repository merge; production apply/readback was a separate post-merge obligation
Task: Fix `ledger pre-apply contract invalid` because journal covered 0035–0041 while plan/artifact/readback stopped at 0034.
Decisions: Extend planning/dispatch/artifact verification/apply/readback through 0041; fail closed when metadata is hidden; verify append-only trigger definitions.
Touched surfaces: Migration planning/apply/readback control path.
Evidence:
- PR #283 merged; head `b947da6a4d69f80f7a44d669f165120abf3745b0`; merge commit `a64f070ca6cd4c0b9a1f2e0c1919335c5ebfdca3`.
- Eight relevant workflows succeeded.
- Isolated MariaDB 11.4 covered all 21 late migrations, backup/restore/retry/drift cases and SQLSTATE 45000 UPDATE/DELETE rejection.
- Canonical guard 8/8 surfaces in sync; receipt hash `b11576f8ac5fd67e4912f279bfdf49c66fd78e13fe2862f0bb0307a4f885a231`.
Learned: Migration journal, plan, apply and readback must advance as one contract wave.
Open: Never infer production-schema success solely from isolated proof.
Next safe step: Always append a distinct post-deploy/readback entry when production is actually verified.

### 2026-09-09 — Optional WebGPU renderer and confirmed-state recovery (AIM-290)
Status: VERIFIED merge and production completion by later readback
Task: Add optional asynchronous WebGPU while keeping WebGL2 baseline and rebuild renderer generations after context/device loss from fresh confirmed world/zone data.
Decisions: Bound renderer initialization, reject stale generations, dispose late results, permit bounded rebuilds, keep rendering non-authoritative.
Touched surfaces: AX1 renderer factory/recovery, TSL particle compatibility and context generation handling.
Evidence: PR #284 merged; head `6e1c19a7368efa1c88e726954ae3f8ce4c288692`. Later AIM-291 evidence records AIM-290 merged at `36376f56db2d523a654d7e3e3c858e44c34e718e` and production run `34308421574` plus separate schema readback succeeded.
Learned: Renderer recovery must reacquire confirmed state rather than resurrect stale local snapshots.
Open: Software SwiftShader evidence is not hardware performance proof.
Next safe step: Keep device/native performance claims separate from functional renderer recovery.

### 2026-09-09 — Verified mobile GLB shipping and bounded resources (AIM-291)
Status: VERIFIED merge and production completion
Task: Make the GLB/KTX2 pipeline reproducible, integrity-checked and resource-bounded with real fallback behavior.
Decisions: Pin KTX toolchain; bind source/LOD/collider/output identities; verify decoded texture completeness; share budgets across download/decode/textures/cache/clones/animations; fix KTX metadata nondeterminism by pinned four-thread adapter and disabled UASTC RDO multithreading when active.
Touched surfaces: GLB/KTX2 shipping, runtime asset integrity/fallback and allocation budgets.
Evidence:
- PR #285 merged; head `9d0ba427387e0c46b23312bac1fef9516fdf1405`; merge `3e51b5f21d55b2b7f549d24fc15526980f41a109`.
- Two full builds and all 13 GLBs byte-identical; bundle SHA `a5ed9f586e70876777e74c193057996d21a9775a77f0355779d9d4e3638c9294`.
- All nine exact-head workflows successful; phone/tablet/desktop browser receipts observed real KTX2 draws, forced decoder failure and raster fallback draws.
- Production run `34320194810`; image `sha256:bfc1b0786d6d18fa970092edb4248661b66fcd482b34c6fcfcf84e5dc7e2c492`; PatchMon/container/public health matched revision.
- Separate schema readback artifact `10092205848`: 21 matched, 0 absent, 0 drift, 42 journal rows.
Learned: Reproducibility failures can hide in encoder metadata even when visual output appears correct.
Open: Native-device RAM/VRAM and complete authenticated character UI flow were not proven by CI Chromium.
Next safe step: Keep native performance evidence and gameplay/UI completeness as separate acceptance lanes.

### 2026-09-09 — WASD multi-memory consumer and AX1 projection (AIM-292)
Status: VERIFIED merge, production deployment and schema apply/readback
Task: Consume the exact WASD multi-memory capsule, persist v3 decisions + four-class v4 memory transactionally, and project bounded confirmed memory into AX1.
Decisions:
- WASD remains source authority.
- Decision and memory sidecar commit in the same locked transaction.
- Retained assertions must resolve to actual source receipts.
- Historical v2/v3 bytes remain compatible; retry/cutover/rollback guarded.
Touched surfaces: WASD capsule consumer, migration 0042, MariaDB memory persistence and AX1 projection.
Evidence:
- WASD PR #2842 merged to source revision `ddce5911e7969f26a9c5b2739d3426004b32260d`.
- Aurion PR #286 merged; reviewed head `d3b06e835c05207ea90e6eae5dc0749cb973a7a4`, merge `dea3b3ab1a23ee3731c130193f7026511a56b481`.
- 26 PR workflows; full CI 814 passed / 106 explicitly skipped; 15 actual MariaDB tests; 3 authenticated browser profiles.
- Production run `34329711810`; image `sha256:581c976b8ea6d7279473c06f8b6a46b8b01fa46817ba30733bd38b94131d9284`; PatchMon and installed identity agreed.
- OIDC apply run `34331754264` applied only migration 0042 after verified backup/restore; postflight 22/22 schema match.
- Separate read-only schema artifact `10096221242`: all 22 migrations 0021–0042, 43 journal rows, exact merged source revision.
- Live merchant readbacks progressed on the new container and showed bounded working/episodic/semantic/procedural counts.
Learned: Cross-repo source purity is useful only when the consumer binds the exact source revision and proves transactional persistence + live projection independently.
Open: v4 episodes record confirmed goal selection, not unexecuted plan steps as actions. AIM-293 action/consent and AIM-294 evidence graphs remain separate lanes.
Next safe step: Bind AIM-293 consumer work to exact merged WASD source and prove host locking/consent/effects in Aurion before claiming action execution.

---

## Backfill boundary

This bootstrap captures retrievable integration history that materially affects current Aurion architecture. It is not a transcript. Recover older blocks by appending `Historical recovery` entries; do not rewrite existing history.

### 2026-09-10 — AX1-first HUD wire and causal collision regression
Status: PARTIAL — isolated runtime/regressions verified; overall integration and production remain open.
Task: Continue Draft PR #295; align AIM-239/244/251/253/254 in Linear.
Decisions: AX1 is the main game, Aurion infrastructure/persistence, WASD selective verified rules; this supersedes historical repo-wide precedence without relaxing owner/receipt validation.
Touched surfaces: HUD wire adapter/tests, portal rehydrate and collision E2E, checksum-bound workspace export.
Evidence: Exact code `8aedab614add5582358d3672a9408f5f47720ba7`; 12/12 workflows succeeded. Run `34435587103`: TypeScript, 43/43 migration chain, 28 focused tests (including 3 real MariaDB), 836 wide-suite passed / 106 opt-in skipped, including 2 new geometry regressions. Run `34435587095`, job `102739851450`: 92 focused, 29 real MariaDB and 5 browser tests passed; artifact `10136180293`. CI logs read; downloaded artifact bytes/screenshots not independently expanded because local tools were unavailable.
Learned: Real player.me envelopes are wider than HUD DTOs; the old collision approach overshot the oak; reload needs a fresh one-shot portal launch.
Open: Atomic multi-input crafting, full Cleave/remaining skills, VPS/PatchMon and native-device proof.
Next safe step: Extend the existing crafting transaction with real concurrency/replay tests. Remain Draft; no merge or deployment.

### 2026-09-10 — AX1-first checkpoint merge
Status: VERIFIED repository checkpoint; production completeness not claimed.
Task: Close the current #295 integration block for handoff.
Decisions: Merge the tested AX1-first slice as an incremental checkpoint; keep remaining UI, skill and production-readback work open.
Touched surfaces: AX1 presentation/crafting/combat bridge, MariaDB crafting persistence and regressions.
Evidence: Exact pre-memory head `adcf8d4ff6535acbe110b6264b0f490e9e079d7f`; branch 0 behind `main`; 12/12 PR workflows succeeded, including AIM-251 real MariaDB crafting, Aurion Local Test Pack, Android, AIM-291 reproducibility and phone/tablet/desktop browser runtime jobs.
Learned: AX1-first can preserve visible game behavior while proven mutation paths move into confirmed Aurion/WASD contracts; multi-input crafting can stay atomic and replay-safe without deleting AX1 content.
Open: Full AX1 menu depth, complete skill 1–9 semantics/VFX, monster/nature GLB production readback, native-device proof and deploy/PatchMon remain separate work.
Next safe step: Continue those items from merged `main` in a fresh branch; do not claim production completeness from this checkpoint.
### 2026-09-11 — AX1 286c575 ecology/resource/telegraph checkpoint
Status: VERIFIED repository checkpoint; production completeness not claimed.
Task: Selectively integrate AX1 revision `286c575d3d0050ffa77b794d5b7a7e24858acee8` while preserving AX1-first presentation/content and Aurion-confirmed gameplay truth.
Decisions: Import deterministic biome/resource content, resource-node/tool metadata, armor-mastery identities and AX1 telegraph presentation; reject source-side `Math.random()`, `Date.now()`, local depletion/respawn/reward/mastery writes and the unchecked 1.45x mastery curve. Zone v5 resources/readbacks are server-confirmed; telegraph rendering is tick-bound and presentation-only.
Touched surfaces: AX1 ecology/armor/telegraph contracts, Zone v5 resource runtime/readback, ResourceNodeProjection, tick-bound telegraph presenter/transport and deterministic mob telegraph policy.
Evidence: Exact pre-memory head `5afeab94ea7f9962c16af642813643ccbf783d38`; branch 0 behind `main`; 8/8 exact-head workflows succeeded including Aurion Local Test Pack, AIM-262, Android, AIM-291, AIM-290, AIM-259, AIM-240 and AIM-292; no reviews or unresolved threads.
Learned: AX1 content/presentation can become richer without restoring client authority when state is source-revision-bound and driven only by confirmed logical ticks/readbacks.
Open: Server mob attacks are still impact-only; elite/boss pre-cast windup is not wired. Persisted gathering rewards, armor-mastery progression, full AX1 menu depth, complete skills 1–9/VFX, monster/nature GLB production readback, native-device proof and deploy/PatchMon remain open.
Next safe step: Merge this checkpoint, then continue the remaining product corridors on a fresh branch without claiming full AX1 integration completeness.


### 2026-09-12 — AX1 f24 main-game cutover
Status: VERIFIED candidate; repository merge and production deployment/readback are not claimed.
Task: Complete the visible AX1 cutover while retaining Aurion research and the deeper autonomous NPC decision/multi-memory system.
Decisions: AX1 revision `f24e3bbb452bd6991c8365fc7827ce6dbcc16d95` defines the main game and gameplay contracts; WASD executes deterministic logic; Aurion supplies community/auth/host/MariaDB/transport/receipts/readmodels. Unsafe AX1-local truth was excluded, confirmed effects are tick/receipt-bound, and the unchanged NPC/Lingua base `cf9cd7a9e197a110724d4f517655a63168ed63e0` was merged with Aurion's autonomous Needs/Living-World/Multi-Memory chain rather than replacing it.
Touched surfaces: AX1 HUD and full menu family, inventory/character/crafting/quest/group/map/world/community projections, combat metrics/log/effects, Research/Companion/Wolfram evidence, NPC dialogue/decision readbacks, ownership and source provenance.
Evidence: Exact pre-memory head `3f7e0459365b245d0838edd6b009a0cdc738fee7`; 9/9 workflows succeeded, including real MariaDB group/browser evidence, NPC Multi-Memory, renderer recovery, deterministic visuals, Android, migration guard and byte-identical asset shipping. Local TypeScript, production build, source/568-asset/112-collider verification and 886 executed tests passed; 111 environment-gated tests were explicitly skipped. Focused HUD-overlap guard passed 5/5.
Learned: AX1's source manifest was stale for five visible files, so actual f24 hashes are pinned. The NPC engine had no cf9-to-f24 source delta; preserving the richer confirmed Aurion NPC chain is therefore both source-faithful and required. Browser evidence also exposed real Minimap/Combat-Metrics pointer collisions, fixed in layout rather than bypassed in tests.
Open: Production deployment/readback and native-device performance are not implied. Guild/economy/territory/homestead mutations remain fail-closed until executable AX1 contracts and WASD execution paths exist.
Next safe step: Re-run exact-head CI after this entry, synchronize Linear/GitBook, obtain exact-revision merge approval, merge, then verify main and zero open PRs.

### 2026-09-12 — Indexed zone peer lookup
Status: VERIFIED candidate; merge and production performance are not claimed.
Task: Replace repeated high-frequency peer scans with a lifecycle-bound entity index.
Decisions: Keep the connection map canonical and maintain a secondary `peersByEntityId` index atomically across join, reconnect and leave; do not alter AX1 gameplay contracts or WASD combat decisions.
Touched surfaces: `server/zoneRuntime.ts` and focused lifecycle/combat regressions.
Evidence: Exact pre-memory head `1fb563f88d4aababa148ecc78b708fb91affa078`; TypeScript and diff checks passed; 15/15 focused tests passed; Aurion Local Test Pack, AIM-292 and AIM-259 workflows succeeded.
Learned: O(1) target resolution is safe only when reconnect replacement and disconnect cleanup are covered as part of the same index lifecycle.
Open: Production latency/throughput improvement has not been measured.
Next safe step: Re-run exact-head CI after this entry, then merge only with fresh exact-revision approval.

### 2026-09-12 — Motion-safe community feedback
Status: VERIFIED repository candidate
Task: Consolidate duplicate Community tactile-feedback PRs without moving disabled controls or overriding reduced-motion preferences.
Decisions: Keep the canonical #311 surface; gate transforms behind `motion-safe`; retain existing authentication and navigation authority.
Touched surfaces: Community cards and focused navigation regressions.
Evidence: Exact pre-memory head `7bd61138824b4fed15be180664de7afe0233bb92`; 5/5 focused tests, TypeScript, diff-check, Local Test Pack and Android Build succeeded.
Learned: Tactile feedback is safe only when accessibility preferences and disabled semantics remain authoritative.
Open: Production deployment is not implied.
Next safe step: Re-run exact-head checks after this append before merge.

### 2026-09-13 — First fantasy oak, sequential live asset intake
Status: PARTIAL — live catalog and delivered bytes verified; in-world rendering unverified.
Task: Begin the requested mobile fantasy overhaul, integrating each completed model before producing the next (at most ten small assets per batch).
Decisions: Start with one original oak in the existing world-nature/tree visual catalog. Keep the 1,600-triangle ceiling, shared PBR atlas and existing gameplay/collision authority.
Touched surfaces: `scripts/fantasy_assets/`, `assets/fantasy-v1/`, approved live GLB catalog.
Evidence: GLB `f8448061b64b860ac2c605d9a90de37c85c1c4acba697727d3571140ee2ee872`; 1,466 triangles independently reimported in Blender; one mesh/material, three 512px textures; second build byte-identical. Live intake increased approved catalog entries 40→41, confirmed world-nature/tree purpose, and public download SHA matched. Existing classification/plan/placement regressions passed 14/14 against source `6803dabc1d23c48a99352a025f035202b89f6083`.
Learned: Uploaded nature is a visual overlay, not a replacement for all procedural trees. Current MobManager renders capsules without a GLB consumer; avatar controller lacks cast/fall/block states. These require distinct AX1 presentation work.
Open: Cloud browser reports WebGL 2 unavailable, so no live-world draw or native-device performance is claimed. Deployment recovery and the remaining models, nine animations and full equipment anchors remain open.
Next safe step: Recover the canonical Traefik deployment, verify this oak in the live world, then continue the next model. No automatic merge.

### 2026-09-13 — Canonical runtime recovery and oak replacement candidate
Status: VERIFIED production recovery; VERIFIED repository candidate for tree replacement, not yet deployed or visually confirmed.
Task: Recover the current live revision and connect the first uploaded oak to existing AX1 tree visuals before producing another model.
Decisions: The linked static fallback run 34735499891 failed on an unavailable integrity-pinned trailer; it is not the canonical game deployment. Fresh main/source and logs identified a transient Docker Hub connection reset in canonical run 34727230845. One failed-job retry completed the existing production gates without weakening integrity or schema checks. Tree replacement is presentation-only, catalog-approved, capped at 16 nearby phone instances / 32 otherwise, sharing one mesh/material; procedural visuals remain until loading succeeds and return on revocation/failure/disposal. No gameplay/collision mutation.
Touched surfaces: Existing deployment workflow execution; TreeCatalogReplacement and its NpcFallbackProjection lifecycle; visual tags in OpenWorldLandscape and WorldChunkManager.
Evidence: Public health and promotion readback bind revision `6803dabc1d23c48a99352a025f035202b89f6083`; image `sha256:e0a4014a503050ed22959e64f4dbdcff99e7662f2c0b15fcbcab2382bdc3f39b`; container `28a32af17f5d033896d4d770620ce289d9f848ec0aeb0c8ff9d8f865672cc4fc`, independently healthy in PatchMon. Production schema receipt reports PRESENT_SCHEMA_MATCH, 22/22 matching migrations, 0 absent/drift. Replacement checks: 10/10 focused tests, TypeScript and production build passed. Oak remains 1,466 triangles; no next model created.
Learned: A successful catalog upload does not prove that existing cone trees were replaced; the owner also reports no visible oak yet. Both source paths now expose visual tags for a bounded replacement consumer.
Open: Replacement exact-head CI, merge, immutable deployment and visible in-game confirmation remain outstanding. Cloud browser WebGL 2 is unavailable; no native mobile performance claim. The unavailable trailer still blocks the separate legacy static fallback.
Next safe step: Read exact-head CI for PR #313, integrate through the canonical deployment path, and confirm visible trees before proceeding to another asset.

### 2026-09-13 — Owner-directed environment atlas release
Status: VERIFIED repository candidate; production and native-device visuals pending exact revision readback.
Task: Prioritize the owner's requested environment textures/details for immediate deployment before continuing the two supplied character templates.
Decisions: Owner explicitly authorizes automatic merge after checks. Add an original four-surface 1024px WebP atlas, isolated 512px sRGB mipmapped tiles shared per scene, world-aligned ground UVs, three hub-terrain material batches, weathered wood/stone structures and 48 instanced edge stones (960 triangles). Keep existing vertex positions, obstacles, collision and WASD gameplay authority unchanged. Release textures/materials/detail buffers with the engine; ignore late image completion after disposal.
Touched surfaces: AX1 WorldSurfaceAtlas, OpenWorldLandscape, WorldChunkManager, MMOEngine and the source atlas.
Evidence: Nine focused atlas/tree regressions, TypeScript, full production build and diff-check passed on the candidate files based on main a2cf9e61504570fd72092cf6463d24249d504769. Shipping atlas SHA and byte count are recorded alongside the image. Full CI identified two provenance-hash checks; a separate reversible atlas adaptation manifest preserves the original ZIP/tree evidence rather than changing historical hashes. The local browser preview URL is blocked by the browser environment; no GPU/native-device rendering or frame-rate claim is made.
Learned: Catalog uploads alone do not texture existing terrain. The existing world materials must consume shipped texture bytes; tile extraction isolates mipmaps and shared ownership prevents per-chunk image downloads.
Open: Exact-head CI, merge and canonical Traefik production readback; character GLBs remain separate unfinished work.
Next safe step: Automatically merge this authorized release after exact-head checks, verify production revision and delivered atlas SHA, then continue the supplied models.

### 2026-09-13 — Authored Ranger equipment attachment origins
Status: VERIFIED repository candidate; live Ranger draw remains pending production readback.
Task: Preserve authored Ranger equipment grip/body origins instead of forcing every GLB to its bounding-box center.
Decisions: Prefer explicit Aurion attachment-origin nodes; preserve legacy bounds-centering when absent; keep scale normalization, inventory, stats and WASD gameplay authority unchanged.
Touched surfaces: `EquipmentAttachmentSizing`, `AnimatedGlbActor`, focused attachment regressions.
Evidence: Exact pre-memory head `1e62c6b340de35e18fd928c26f9f547d833c55fb`; all 8 PR workflows succeeded, including AIM-285 exact-head attachment/authority regressions, TypeScript and production build. Live catalog revision `65d5b9b7eba7d4d7f7f47ac2a697e98ac9d81e571ac3e60627eb2af48ef94b2b` contains the classless Ranger v3 and its v3 equipment set.
Learned: A correct actor socket is insufficient if runtime recenters the attached asset and discards its authored grip/body origin.
Open: Binary node inspection and production/native-device visual confirmation of Ranger v3 remain separate.
Next safe step: Re-run exact-head CI after this append; merge #316 only if green, then deploy/read back the immutable revision before claiming live placement fixed.

### 2026-09-13 — Game Development Studio CLI v1.0.2
Status: VERIFIED pre-merge
Task: Pin the supported Game Development Studio CLI for Aurion asset production, validation and vendoring.
Decisions: Pin `@theisegoria/game-development-studio@1.0.2` to source revision `96a0b4f34b979279ab983e9547af43133e85f310`, require Node.js >=22.5, keep provider-free smoke checks and isolate local outputs under `.game-dev/workspace/`.
Touched surfaces: `scripts/install-game-development-studio.mjs`, `.github/workflows/game-development-studio-smoke.yml`, `.gitignore`.
Evidence: exact pre-entry head `93805eddb69897593f9efd2aadcc68e43e9d2f39`; Game Development Studio Smoke run `34767286407` success; Aurion Local Test Pack run `34767286404` success; Build Android APK run `34767286430` success.
Learned: Current GDS v1.0.2 is the supported CLI+Skills boundary; the retired historical MCP path must not be reintroduced.
Open: This memory append creates a new head, so all merge gates must be rerun on that exact revision before merge.
Next safe step: Require exact-head green checks, then merge PR #318; runtime game/deploy claims remain separate.

### 2026-09-13 — Clockwork Stalker reconcile on current GDS main
Status: VERIFIED repository candidate; production and in-world visual draw not claimed.
Task: Rebind the already-verified Clockwork Stalker from stale PR #314 onto the current Game Development Studio main without stale history.
Decisions: Preserve the 14 non-Memory files and original GLB/evidence bytes; keep the mob consumer presentation-only; synchronize intervening GitBook docs before final evidence.
Touched surfaces: Stalker asset/evidence/build scripts, fantasy manifest, `MobCatalogProjection`, current docs ancestry.
Evidence: Exact pre-memory head `f041a2efc4a3bcee7c8e6912fcb138c76ec2a6e4`; GLB SHA `94a98c7a1f2c38d8933d8c70d4f27f20d3df7e090a281f7aec48c826354c7b4a`; all 6 workflows succeeded, including AIM-291 Asset Shipping run `34780250976` with phone/tablet/desktop runtime jobs and reproducible shipping validation.
Learned: Verified asset bytes still require a current-base rebind and exact-head evidence; stale PR history is not integration proof.
Open: Production deployment, visible in-world confirmation and native-device performance remain separate.
Next safe step: Re-run all merge gates on this post-memory head; merge #325 only if exact-head green, then close #314 as superseded and read back main.

### 2026-09-13 — Aurion authority and immutable release hardening
Status: PARTIAL — implementation complete; final exact-head rerun required before merge.
Task: Consolidate the current Aurion engineering hardening into PR #327 without reintroducing WASD as active gameplay/world authority.
Decisions: Aurion is the active gameplay/world authority; freeze historical WASD provenance to `eb20a85b305612eaf01c560ad0c89af96ed03295`; skip production for docs/GDS-only main pushes; keep production cache read-only; record workflow provenance; pin Node `22.23.2`, MariaDB `11.4.13`, and Aurion-owned GitHub Actions to reviewed immutable identities.
Touched surfaces: Canonical GDS authority docs/guard, historical migration ledger, Traefik runtime/promoter/bootstrap, root reconciliation/apply proofs, deployment workflow and Action-pin regression.
Evidence: First exact-head `7651a2f881506419cb10724e59334bbfeadb0e91` passed all eight workflow suites: deploy `34784500588`, Android `34784500014`, Local Test Pack `34784500022`, NPC Multi-Memory `34784500051`, GLB regression `34784500074`, zone schema bootstrap `34784500067`, root schema apply `34784500049`, root reconciliation `34784500092`. Root proofs exercised immutable Node/MariaDB images, backup/recovery/apply/retry/fail-closed paths; the historical provenance run reproduced WASD source manifest `92bb04235b5fcfe2ca3ad252b500410f6588fbc8def586b02f12770f0bd1c08d` with read-only cache.
Learned: Historical migration receipts can prove lineage but must not become moving runtime authority; release evidence must bind source, workflow, immutable Actions/runtime/database inputs and independent readback.
Open: This append and the immutable Action pins create a new final PR head; no merge or live claim is valid until that exact head is green and production is read back after merge. Branch protection remains an external repository-admin control, not inferred from CI discipline.
Next safe step: Run every exact-head PR gate again, merge #327 only if fresh and green, then require revision-identical production promotion, schema receipt and public health readback.
