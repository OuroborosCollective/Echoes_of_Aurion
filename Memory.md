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
