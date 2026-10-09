# Memory.md — Echoes of Aurion

> Project-local, append-only integration memory for `OuroborosCollective/Echoes_of_Aurion`.
> Historical bootstrap created 2026-09-09 from retrievable repository/conversation evidence.
> Historical bootstrap only: the former split-owner model is superseded by the Aurion Single Authority reset recorded in the latest entry below.

## Operating contract

1. Read this file before every N+1 integration session.
2. After each completed work block append exactly one entry before merge.
3. Record task, decisions, touched surfaces, tests/evidence, learned result, open points and next safe step.
4. Append-only; corrections are new entries.
5. Aurion is the single owner and truth source for all active gameplay, world, NPC, logic, decisions, databases, persistence, receipts and projections; AX1/WASD are historical provenance only.
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

### 2026-09-30 — Visual Construction Runtime Cache (AIM-525)
Status: VERIFIED candidate integration; merge pending
Task: Add bounded runtime-only caching for canonical visual construction without introducing a new truth source.
Change: Added a 128-entry LRU for immutable morphology recipes; cache key is descriptorHash + grammarVersion + avatarProfileVersion + fitVersion + lod; cache is injected into morphology/geometry/source resolution, used by the live attachment controller, and cleared on dispose.
Evidence: Exact candidate head `c6ce51c7ab9c2b27cebf03d23557efa1f15efc2d`; AIM-525 focused workflow `36760894530` passed 7 test files / 44 tests, `pnpm check`, and `pnpm build`; Aurion Local Test Pack `36760894397` passed; Aurion PR Runtime Container Proof `36760894684` passed. Aurion PR Runtime Candidate `36760894342` still reports the pre-existing `RETURN_STONE_LIVE_CATALOG_MISSING` live-catalog blocker and is not treated as cache evidence.
Learned: A cache is semantically safe when it stores reconstructible presentation recipes rather than gameplay state or GPU snapshots, making eviction, restart, and rebuild identity-neutral.
Open: Merge PR #704.
Next safe step: Merge the green PR and then continue with the next unsatisfied architecture slice.

### 2026-10-01 — Aurion inventory transaction kernel (AIM-502)
Status: VERIFIED candidate, merge-ready
Task: Integrate the supplied Issue #502 package into the existing Aurion item/equipment authority with deterministic Item/Inventory/Equipment transaction semantics.
Decisions: Keep Aurion as sole gameplay/world truth; adapt the ZIP semantics into existing legacy `itemInstances` and `aurionItemInstancesV2` plus append-only `aurionInventoryReceipts`; no parallel gameplay-state tables. Enforce exact quantity/revision handling, deterministic stack identity/order/state hashing, owner serialization, optimistic revision/state guards, replay-safe idempotency and fail-closed conflicting retries.
Touched surfaces: `server/aurionInventoryTransactionProtocol.ts`, `server/aurionInventoryStackIdentity.ts`, `server/aurionInventoryBackendAdapter.ts`, MariaDB/pure regression tests, `server/db.ts`, UI projection/persistence, `server/routers.ts`, `drizzle/schema.ts`, migration `0066_aurion_inventory_transaction_kernel.sql`, migration journal/production reconciliation contracts and affected CI proofs.
Evidence: Final exact PR head `9e98a4651b336d14b2104344c7ef27c2767f92e3`; 30/30 GitHub checks green, including deterministic contract, real MariaDB transaction/readback, rollback/replay, isolated UI/equipment, GLB/runtime/build, exact-head runtime, reconciliation, backup/recovery/apply, evidence and GDS proofs. Migration chain: 67 SQL / 67 journal entries, no unjournaled tags, duplicate prefixes/tags, trailing breakpoints or empty statement segments.
Learned: Drizzle MySQL migrations must not end with a trailing `statement-breakpoint`; the migration-chain verifier now rejects both trailing and empty segments. Production schema reconciliation must include legacy `playerProfiles` when late migrations extend that table. Historical 0065 watermarks and proof assertions must advance coherently when 0066 is introduced.
Open: PR #718 merge/readback only; no new implementation blocker remains on the candidate head.
Next safe step: Merge PR #718 and verify the resulting `main` head plus closed Issue #502.

### 2026-10-02 — Atomic crafting and item manipulation runtime (AIM-535)
Status: VERIFIED isolated MariaDB effects; final candidate CI pending
Task: Complete all eight manipulations through Aurion's existing inventory, item and crafting receipt authority.
Decisions: Share Loot V2 affix rules; serialize owner transactions; bind recipe, materials, tools/mastery and exact state guards; expose confirmed receipts through the workbench and equipment readback.
Evidence: PR #726; exact initial candidate `94ac5df0bfb2fc189eeb45c12c4f52445c89f732`, workflow `36990383331`: all eight operations plus concurrent replay, insufficient/foreign input rejection and real database rollback passed; existing inventory/legacy crafting tests passed. Migration 0068 extends existing tables.
Learned: Migration-wave artifact lists and isolated UI database names must advance together; crafting replay hashes must normalize persisted JSON dates.
Open: Final exact-head HTTP, full regression and merge/main readback.
Next safe step: Require final candidate evidence, merge PR #726 and verify Issue #535 closure.


### 2026-10-02 — PR #727 — fix: restore post-merge Memory recorder regression
Status: VERIFIED repository merge
<!-- auto-memory: pr=727 merge=8b8da44b2b8870ed18241671b40fa6a8f090ab9b -->
Task: Merge PR #727 into `main` — fix: restore post-merge Memory recorder regression.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/agent-memory-supabase-sync.yml`
- `scripts/append-post-merge-memory.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/727
- Merge commit: `8b8da44b2b8870ed18241671b40fa6a8f090ab9b`
- PR head: `83abba0453028035154b090e9d3a1a8f666c2639`
- Merged at: 2026-10-02T11:31:13Z
- Post-merge workflow run: 37001457260
Learned: Post-merge automation must receive the same syntax and contract coverage before merge; testing only the mirror sync allowed a broken recorder test to remain unnoticed.  Follow-up to #535 and #726; gameplay and migration contents remain the verified #726 merge tree.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-02 — PR #726 — feat: complete AIM-535 atomic crafting and item manipulation
Status: VERIFIED repository merge
<!-- auto-memory: pr=726 merge=58f27a3340e03542478f75f58e786d54b1da70dd -->
Task: Merge PR #726 into `main` — feat: complete AIM-535 atomic crafting and item manipulation.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aim535-item-manipulation-runtime.yml`
- `.github/workflows/aurion-journal-watermark-regression.yml`
- `.github/workflows/aurion-production-schema-readback.yml`
- `.github/workflows/aurion-root-reconciliation-artifact-proof.yml`
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `.github/workflows/aurion-schema-reconciliation-proof.yml`
- `Memory.md`
- `architecture/donor-ledger.json`
- `client/src/xaurion/components/Ax1InventoryModal.tsx`
- `client/src/xaurion/components/CraftingModal.tsx`
- `client/src/xaurion/components/InventoryModal.tsx`
- `client/src/xaurion/components/ItemManipulationPanel.test.tsx`
- `client/src/xaurion/components/ItemManipulationPanel.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.test.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.tsx`
- `config/aurion-migration-wave-manifest.json`
- `deploy/aurion-production-schema-apply-core`
- `deploy/verify-aurion-production-schema-apply-artifact.mjs`
- `deploy/verify-aurion-production-schema-reconcile-artifact.mjs`
- `docs/balancing/aim265-candidate.json`
- `drizzle/0068_aurion_item_manipulation_runtime.sql`
- `drizzle/meta/_journal.json`
- `drizzle/schema.ts`
- `e2e/issue502.inventory.spec.ts`
- `scripts/aurionProductionSchemaReconciliation.ts`
- `scripts/build-aurion-production-apply-artifact.mjs`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `server/aurion/npc/npcLifeProtocol.ts`
- `server/aurion/npc/semanticMemoryGraph.ts`
- `server/aurionInventoryBackendAdapter.ts`
- `server/aurionItemManipulationAllocation.test.ts`
- `server/aurionItemManipulationAllocation.ts`
- `server/aurionItemManipulationCatalog.ts`
- `server/aurionItemManipulationHttp.test.ts`
- `server/aurionItemManipulationMariaDb.test.ts`
- `server/aurionItemManipulationPersistence.ts`
- `server/aurionItemManipulationProtocol.test.ts`
- `server/aurionItemManipulationProtocol.ts`
- `server/aurionLootProtocol.ts`
- `server/aurionNpcSemanticIdentityRegression.test.ts`
- `server/aurionProductionSchemaReconcileDockerRunner.test.ts`
- `server/blocker3Compliance.test.ts`
- `server/causality/causalReceiptV2Persistence.test.ts`
- `server/confirmedEquipmentVisualReadback.ts`
- `server/economy/economicSourceEvidence.ts`
- `server/glbNormalizationBackfillContract.test.ts`
- `server/playerUiPersistence.ts`
- `server/routers.ts`
- `shared/playerUiProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/726
- Merge commit: `58f27a3340e03542478f75f58e786d54b1da70dd`
- PR head: `eab9c8da378a04dbf986557c6dd92bb5f6087a4e`
- Merged at: 2026-10-02T11:21:09Z
- Post-merge workflow run: 37000532936
Learned: Deterministic item rolls must commit to the paid material allocation, while retry keys remain transport metadata. Canonical aggregation preserves the same cause when identical materials are split. Receipts and confirmed UI readbacks must expose every consumed identity and persisted effect; recipe membership order and migration-wave bounds must remain canonical across neighboring proofs.  Memory.md records change, insight and verified isolated effects; automated post-merge recording will bind the merge and final head. [GitBook preview](https://ouroboroscollective.gitbook.io/ouroboroscollective-docs/~/revisions/89QgYhx4HK7VM7HqxfOe/).  Fixes #535.  NPC neighbor CI exposed a pre-existing synchronous identity remap cycle in the canonical Aurion semantic graph: identical node evidence registered an ID-to-itself mapping. Only changed IDs are now remapped. A bounded fresh-process regression reproduces the previous timeout and proves deterministic graph compilation with valid edge endpoints after the fix. The original MariaDB NPC and container gates passed at this final head.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-03 — Service-cell generator operational clock boundary
Status: VERIFIED repository regression
Task: Correct the Aurion service-cell template so newly generated TypeScript is typed and does not embed direct wall-clock access.
Decisions: Keep operational time outside deterministic gameplay truth by importing the existing `hostOperationalClock`; type the generated effect, readback and observability boundaries with the canonical pipeline contracts rather than implicit `any` parameters.
Touched surfaces: `server/aurionServiceCellGenerator.ts`, `server/aurionServiceCell.test.ts`.
Evidence: `pnpm vitest run server/aurionServiceCell.test.ts` passed 33 tests; `pnpm check` passed; `pnpm test` passed 376 files / 1,827 tests with 55 files / 207 environment-dependent tests skipped. The focused regression reads back the generated source and verifies the operational-clock import, typed contracts and absence of `Date.now(`.
Learned: The hardened generator itself must obey the boundary it advertises; a comment instructing future callers to replace direct wall time leaves every generated cell unsafe-by-default and strict-TypeScript-incomplete.
Open: No runtime/deployment claim is made; this generator-only change has no persistent or effectful runtime path.
Next safe step: Keep future service-cell templates bound to shared Aurion contracts and verify emitted source invariants in the generator regression suite.


### 2026-10-03 — PR #732 — fix: harden generated service-cell clock boundary
Status: VERIFIED repository merge
<!-- auto-memory: pr=732 merge=e316ea13a854925a6a6ba5cf400cf75f7ed8eb1a -->
Task: Merge PR #732 into `main` — fix: harden generated service-cell clock boundary.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `server/aurionServiceCell.test.ts`
- `server/aurionServiceCellGenerator.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/732
- Merge commit: `e316ea13a854925a6a6ba5cf400cf75f7ed8eb1a`
- PR head: `4bc9d8190621f0fadaf3ef6289e9cbb1d1f802e1`
- Merged at: 2026-10-03T00:55:10Z
- Post-merge workflow run: 37084044077
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-03 — PR #730: Cinder Vault route survives quest progression
Status: VERIFIED regression and isolated MariaDB readback
Task: Preserve the confirmed dungeon gate in the world snapshot after Ember Key turn-in.
Decisions: Project one locked Emberfall gate or one available route after canonical access; preserve zone/encounter selection and authorization; remove unrelated BVH receipt churn.
Touched surfaces: openWorldProtocol, snapshot/quest-chain regressions, source-bound AIM-265 receipt.
Evidence: Candidate `439be44bc70167768a57e16bc1136cc39f9270c1`; four new cases failed before the fix; 32 focused tests, TypeScript and full local regression passed (376 files / 1,831 tests; 207 environment-dependent tests skipped). Exact-head MariaDB workflow https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/37085340580 passed the real quest turn-in, denied pre-key encounter and independent locked/unlocked world readbacks; balancing replay also passed.
Learned: The unlocked Emberfall-only branch was unreachable because progression selected another zone; assert the returned snapshot across the transition.
Open: Final Memory-inclusive CI and merge/main readback; no production deployment claim.
Next safe step: Merge only the verified final head and verify automated post-merge Memory/readback.


### 2026-10-03 — PR #730 — fix: preserve confirmed Cinder Vault access across quest zones
Status: VERIFIED repository merge
<!-- auto-memory: pr=730 merge=4d064a3d3f4da3dffb875e43222e9304609f7046 -->
Task: Merge PR #730 into `main` — fix: preserve confirmed Cinder Vault access across quest zones.
Decisions: Aurion remains the sole gameplay and persistence authority. This is a display projection fix; no new teleport command, reward rule or client-side authorization is introduced.
Touched surfaces:
- `Memory.md`
- `docs/balancing/aim265-candidate.json`
- `server/openWorldProtocol.test.ts`
- `server/openWorldProtocol.ts`
- `server/questChainRegression.e2e.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/730
- Merge commit: `4d064a3d3f4da3dffb875e43222e9304609f7046`
- PR head: `9339cd065af438a175593e26dd658ad8e22b08f9`
- Merged at: 2026-10-03T01:24:44Z
- Post-merge workflow run: 37085989979
Learned: An unlock projection must be asserted in the zone actually returned after progression, not only in a zone-local table that stops being selected.
Open: No implementation blocker remains. Verify the merged main head and automated post-merge memory readback. Isolated candidate proof does not claim production deployment.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-03 — PR #733: In-game GLB catalog and mobile movement placement
Status: VERIFIED component regression and isolated MariaDB/browser readback
Task: Restore direct admin-imported GLB assets in the in-game catalog and anchor movement controls at the lower left.
Decisions: Read the protected admin asset registry; distinguish loading, failure and confirmed empty results; retain server authorization. Remove the HUD-wide positioning override and reserve mobile touch space.
Evidence: Candidate `ff058cf088553c9475c0cc0e77d188723348fa4b`; four catalog cases failed before the fix. TypeScript and full local regression passed (377 files / 1,836 tests; 207 environment-dependent tests skipped). Isolated authenticated upload, persisted asset readback, catalog selection and joystick geometry at 412×732, 800×1280 and 932×430 passed: https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/37086914153. Live read-only comparison found 78 registered runtime assets but no public community submissions.
Learned: Public community submissions are not the admin asset registry; a broad relative-position rule can silently override HUD anchors. The neighboring phone regression additionally caught a four-pixel action-panel overlap from an older important offset; remove that override and measure the whole action panel.
Open: Final Memory-inclusive CI and merge readback; inventory warnings and production deployment are not covered by this fix.
Next safe step: Merge the verified final head and verify automated post-merge Memory/readback.


### 2026-10-03 — PR #733 — fix: restore in-game GLB catalog and lower-left movement controls
Status: VERIFIED repository merge
<!-- auto-memory: pr=733 merge=4635dc50a324e689a38a0655d71057a777ee0ca7 -->
Task: Merge PR #733 into `main` — fix: restore in-game GLB catalog and lower-left movement controls.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/xaurion/components/AdminGlbMenu.test.tsx`
- `client/src/xaurion/components/AdminGlbMenu.tsx`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.test.tsx`
- `client/src/xaurion/integration/ax1AuthorityHud.css`
- `e2e/glbImport.spec.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/733
- Merge commit: `4635dc50a324e689a38a0655d71057a777ee0ca7`
- PR head: `2b790fee4cb43931074e1fb62f4585d9ff8a31bb`
- Merged at: 2026-10-03T01:57:05Z
- Post-merge workflow run: 37088031925
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-03 — Bounded quest objective progress and receipt-chain revisions
Status: VERIFIED repository regression
Task: Bound numeric quest objective progress at its validated target and derive command event revisions from the canonical persisted receipt chain.
Decisions: Aurion remains the sole quest and persistence authority. Numeric targets and stored progress fail closed unless they are safe integers; progress is clamped to the target; completed objective nodes reject further runtime mutation. Progress, choice, and completion receipts no longer infer event sequence from completed-node cardinality, and command callers obtain the expected next sequence from persisted receipts while existing state-hash and idempotency guards remain intact.
Touched surfaces: `server/questCompiler/runtime.ts`, `server/questCompiler/adminService.ts`, `server/questCompiler/persistence.ts`, `server/questCompiler/runtime.test.ts`, `server/questCompiler/persistence.test.ts`.
Evidence: `pnpm vitest run server/questCompiler/runtime.test.ts server/questCompiler/persistence.test.ts` passed 14 tests; `pnpm vitest run server/questCompiler` passed 61 tests with the environment-dependent MariaDB causal-closure test skipped; `pnpm check` passed; `git diff --check` passed. The full `pnpm test` run passed 1,840 tests and skipped 207 environment-dependent tests but reported one unrelated timing failure in `client/src/pages/Home.test.tsx`; an immediate isolated rerun of that unchanged file passed all 5 tests. Regressions cover 5 + 1 = 6, 5 + 2 = 6, completed-node rejection, identical receipt replay, a different late event without over-counting, and competing progress transitions at one expected state revision.
Learned: Completed-node count is graph topology, not an event revision. The durable quest receipt chain is the canonical revision source, while the state hash remains the concurrency boundary and the idempotency key remains the replay boundary.
Open: No production deployment or external database runtime claim is made; the local persistence lane used the repository's database-optional in-memory implementation, and the MariaDB-only causal-closure suite remained environment-skipped.
Next safe step: Exercise the same revision conflict cases in the configured MariaDB evidence lane before making a production-runtime claim.

### 2026-10-03 — PR 737 strict event-sequence narrowing
Status: VERIFIED focused repository regression
Task: Repair exact-head CI TS2322 in progress, choice and completion receipt construction.
Decisions: Require typeof eventSequence === number before safe-integer/range checks so the existing fail-closed runtime check also narrows the TypeScript type. No assertion cast, fallback revision or lowered validation.
Touched surfaces: server/questCompiler/runtime.ts.
Evidence: Quest compiler suites passed 61 tests (one MariaDB case skipped locally); clean full nonincremental TypeScript check. Existing capping, replay and competing-revision regressions retained.
Learned: Number.isSafeInteger does not narrow number | undefined in TypeScript.
Open: Exact-head CI and integration with later combat/reward changes remain required.
Next safe step: Push the correction, verify CI, and integrate in series order.


### 2026-10-03 — PR #737 — fix(quest): clamp numeric objective progress and canonicalize event sequences from persisted receipts
Status: VERIFIED repository merge
<!-- auto-memory: pr=737 merge=784ce2232ede1f370322c482626e3d400336c682 -->
Task: Merge PR #737 into `main` — fix(quest): clamp numeric objective progress and canonicalize event sequences from persisted receipts.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `server/questCompiler/adminService.ts`
- `server/questCompiler/persistence.test.ts`
- `server/questCompiler/persistence.ts`
- `server/questCompiler/runtime.test.ts`
- `server/questCompiler/runtime.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/737
- Merge commit: `784ce2232ede1f370322c482626e3d400336c682`
- PR head: `7f4201517c93d6286cab9e36b76eaf6993d81205`
- Merged at: 2026-10-03T05:19:02Z
- Post-merge workflow run: 37099439617
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-03 — Starter-village pilot evidence lane
Status: PARTIAL — repository lane verified; isolated runtime execution pending CI
Task: Add a focused, non-bypassing pilot lane from Return Stone/spawn through northward movement, confirmed NPC dialogue, the six-encounter quest chain, turn-in, idempotent reward and restart-safe quest/inventory readback.
Decisions: Reuse Aurion's existing 10 Hz zone, authenticated HTTP/tRPC, quest, combat, progression-ledger and player-UI authorities; use a disposable MariaDB; restart the compiled application before final readback; preserve revision-named JSON and checksum artifacts. Block all non-loopback egress only after dependency installation/build so MariaDB and the application remain reachable while model, Agent Zero, BMAD and Codex/OpenAI endpoints are demonstrably unavailable. Browser checks are explicitly Chromium viewport emulation, never physical Android/GPU evidence.
Touched surfaces: `.github/workflows/starter-village-pilot.yml`, `server/starterVillagePilotHttp.test.ts`, `e2e/starterVillagePilot.spec.ts`.
Evidence: Focused Vitest discovery passes with the environment-gated runtime cases skipped by default; `pnpm check` passes; `git diff --check` passes. The local container lacks Docker, so the real isolated MariaDB/runtime execution is intentionally left to the new required evidence job rather than replaced by a mock.
Learned: Restart readback can reuse the authenticated product session while still obtaining fresh server/DB projections; progression reward replay must be compared against the pre-restart profile and unique ledger keys rather than inferred from UI text. Browser viewport coverage must carry an explicit emulation limitation in its artifact.
Open: Obtain the first exact-head `Starter Village Pilot Evidence` run and inspect its revision-bound journey/readback/checksum artifacts; no production or physical-device claim is made.
Next safe step: Run the workflow on this exact PR head, correct the first causal failure if any, and accept the lane only after the isolated MariaDB, HTTP/tRPC restart readback, local-only network and four viewport checks all pass.


### 2026-10-03 — PR #739 — test: Starterdorf‑Pilot evidence lane (workflow + runtime e2e)
Status: VERIFIED repository merge
<!-- auto-memory: pr=739 merge=6569b8ffc83394f0864b7e027686c7aec2878e8a -->
Task: Merge PR #739 into `main` — test: Starterdorf‑Pilot evidence lane (workflow + runtime e2e).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-deterministic-binary-atlas-proof.yml`
- `.github/workflows/starter-village-pilot.yml`
- `Memory.md`
- `SUMMARY.md`
- `docs/game-development-studio-visual-production-and-worldbuilding/starterdorf-first-60-seconds.md`
- `e2e/starterVillagePilot.spec.ts`
- `server/starterVillagePilotHttp.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/739
- Merge commit: `6569b8ffc83394f0864b7e027686c7aec2878e8a`
- PR head: `399d956b80adb8d3bcb43c2128954ed395568e13`
- Merged at: 2026-10-03T10:25:32Z
- Post-merge workflow run: 37116379271
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-04 — Public stateless-determinism reference
Status: VERIFIED documentation integration
Task: Add the first public OuroborosCollective stateless-determinism reference as a GitHub/GitBook source page.
Decisions: Keep the example explicitly non-production, safe-integer scoped, effect-as-data, SHA-256 evidenced, and clear that the local canonicalizer is not RFC 8785 interoperability.
Touched surfaces: `docs/public-patterns/stateless-determinism-minimal-runtime.md`, `SUMMARY.md`, `Memory.md`.
Evidence: Branch `docs/stateless-determinism-gist-20261004`; source document commit `f56579234dc07d6bfec173414fb33bd70f5cdb94`; SUMMARY linkage commit `58aa8f170e1be3608a2210deb7e04ed398a9cce5`; GitBook space `L6Obi8qqyRCkrcZ2NVrV` is Git-synced to `OuroborosCollective/Echoes_of_Aurion/main`; Firecrawl confirmed the Gist browser session is unauthenticated, so no direct Gist publication is claimed.
Learned: One canonical repository page plus Git Sync avoids GitHub/GitBook content drift; the real Gist should be treated as a later distribution surface and independently read back after publication.
Open: Direct `gist.github.com` publication remains blocked by the unauthenticated browser session and missing Gist write action in the GitHub connector.
Next safe step: Open the documentation PR, verify exact-head GitHub/readback evidence, and merge only on explicit merge instruction.



### 2026-10-04 — PR #752 — docs: publish stateless determinism public reference
Status: VERIFIED repository merge
<!-- auto-memory: pr=752 merge=ef702cce0c7cfae91c9ab18f4e7b3e918965a25f -->
Task: Merge PR #752 into `main` — docs: publish stateless determinism public reference.
Decisions: Documentation-only. No gameplay, persistence, runtime, schema or deployment behavior is changed.
Touched surfaces:
- `Memory.md`
- `SUMMARY.md`
- `docs/public-patterns/stateless-determinism-minimal-runtime.md`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/752
- Merge commit: `ef702cce0c7cfae91c9ab18f4e7b3e918965a25f`
- PR head: `fbec6d99e71aa1ba8a53beef29affdf26cd8ecb4`
- Merged at: 2026-10-04T05:38:29Z
- Post-merge workflow run: 37180480644
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — Open-PR consolidation: verified Starterdorf gameplay chain
Status: VERIFIED repository integration
Task: Integrate the cumulative Starterdorf chain through canonical village layout, quest-NPC authority and durable Clockwork-Stalker combat/hand-in evidence while preserving newer main documentation/evidence.
Decisions: Use exact tested PR #736 head `0641bdfb8d70d8daebe038006800ef85e950406b` as the cumulative gameplay owner; overlay current main `891ef06f5e5fbfd31ae3ba14be7bfd076d37a647` GitBook/public-reference and Starter Village Pilot evidence files; supersede #734/#735 rather than duplicating them.
Touched surfaces: Starter-village world/NPC contracts, quest/combat persistence and migrations, zone runtime, CI/evidence lanes; current-main documentation/evidence preserved.
Evidence: PR #736 exact head has 33 successful completed workflows and no non-success run, including Aurion Local Test Pack, Runtime Candidate/Container Proof, MariaDB/schema gates and Game Development Studio Smoke.
Learned: The safe integration unit is the latest fully verified cumulative head, not separately merging overlapping ancestor PRs.
Open: #738 reward and #740 visible-guidance extensions remain excluded because their exact-head gates are red.
Next safe step: Close superseded ancestors and keep failed extensions unmerged until independently green.


### 2026-10-05 — PR 754 clean dashboard UX cherry-pick
Status: VERIFIED repository integration
Task: Preserve the proven System Status Dashboard loading/focus UX without carrying Jules metadata.
Decisions: Cherry-pick only `client/src/components/SystemStatusDashboard.tsx` from PR #754 exact head `c089de305b7a4e879cbc1b76591700f275d00abb`; main matched the PR base blob exactly.
Touched surfaces: System Status Dashboard presentation only.
Evidence: #754 exact head passed Aurion PR Runtime Candidate, Runtime Container Proof and Aurion Local Test Pack; product blob `f0d0ce582e8404852687521103536e88539df585`.
Learned: File-level cherry-pick avoids bot metadata and unrelated learning files.
Open: No gameplay-authority or production-deployment claim.
Next safe step: Complete zero-open-PR cleanup.


### 2026-10-05 — PR #759 — merge: consolidate verified Starterdorf gameplay chain onto current main
Status: VERIFIED repository merge
<!-- auto-memory: pr=759 merge=313f62aaa551c17ba09a5d01eed7075f980dc56d -->
Task: Merge PR #759 into `main` — merge: consolidate verified Starterdorf gameplay chain onto current main.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/agent-memory-supabase-sync.yml`
- `.github/workflows/aim259-group-instances.yml`
- `.github/workflows/aurion-journal-watermark-regression.yml`
- `.github/workflows/aurion-local-test-pack.yml`
- `.github/workflows/aurion-pr-runtime-container-proof.yml`
- `.github/workflows/aurion-production-schema-readback.yml`
- `.github/workflows/aurion-root-reconciliation-artifact-proof.yml`
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `.github/workflows/aurion-schema-reconciliation-proof.yml`
- `Memory.md`
- `client/src/components/CausalBackupNotifier.test.tsx`
- `client/src/components/CausalBackupNotifier.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.test.tsx`
- `client/src/xaurion/integration/WorldAssetProjection.test.ts`
- `client/src/xaurion/integration/WorldAssetProjection.ts`
- `config/aurion-migration-wave-manifest.json`
- `deploy/aurion-production-schema-apply-core`
- `deploy/verify-aurion-production-schema-apply-artifact.mjs`
- `deploy/verify-aurion-production-schema-reconcile-artifact.mjs`
- `drizzle/0069_aurion_combat_victory_events.sql`
- `drizzle/meta/_journal.json`
- `drizzle/schema.ts`
- `e2e/aim291.assetShipping.spec.ts`
- `e2e/ax1.ui.spec.ts`
- `scripts/aurionProductionSchemaReconciliation.ts`
- `scripts/build-aurion-production-apply-artifact.mjs`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `scripts/run-isolated-combat-mariadb-tests.mjs`
- `server/aurionCombatVictoryPersistence.ts`
- `server/aurionProductionSchemaReconcileDockerRunner.test.ts`
- `server/aurionProductionSchemaReconciliation.test.ts`
- `server/aurionStarterVillageContract.test.ts`
- `server/aurionStarterVillageContract.ts`
- `server/blocker3Compliance.test.ts`
- `server/causality/archivePacketsMariaDb.test.ts`
- `server/causality/archivePacking.test.ts`
- `server/causality/archivePacking.ts`
- `server/causality/archivingService.ts`
- `server/causality/causalReceiptV2Persistence.test.ts`
- `server/causality/combatOutboxAtomicMariaDb.test.ts`
- `server/causality/persistence.ts`
- `server/causality/tickRecorder.ts`
- `server/causality/worldCausalRootService.test.ts`
- `server/causality/worldGenerationParityHarness.test.ts`
- `server/causality/worldGenerationParityMariaDb.test.ts`
- `server/causality/zoneCanonicalState.ts`
- `server/combatQuestProjectionMariaDb.test.ts`
- `server/db.ts`
- `server/questCompiler/adminService.ts`
- `server/questCompiler/causalAnchor.ts`
- `server/questCompiler/causalClosureMariaDb.test.ts`
- `server/questCompiler/eventBindingMatcher.ts`
- `server/questCompiler/pilotCombatCompletionEvidence.ts`
- `server/questCompiler/pilotQuestAdminService.test.ts`
- `server/questCompiler/pilotQuestTemplate.test.ts`
- `server/questCompiler/pilotQuestTemplate.ts`
- `server/questCompiler/roleResolver.ts`
- `server/questNpcAuthority.test.ts`
- `server/questNpcAuthority.ts`
- `server/routers.ts`
- `server/routes/aurionQuestRouter.ts`
- `server/starterVillageNpcResidence.test.ts`
- `server/starterVillageNpcResidence.ts`
- `server/wasdAurionDialogueQuestIntentProtocol.test.ts`
- `server/wasdAurionDialogueQuestIntentProtocol.ts`
- `server/wasdAurionRuntime.ts`
- `server/wasdCombatDeltaProtocol.ts`
- `server/wasdCombatProfileProtocol.ts`
- `server/worldAssetProtocol.test.ts`
- `server/zoneCombatContinuity.test.ts`
- `server/zoneCombatContinuityMariaDb.test.ts`
- `server/zoneCombatEquipmentMariaDb.test.ts`
- `server/zoneCombatPersistence.ts`
- `server/zoneRuntime.ts`
- `shared/aurionCausalTickContract.ts`
- `shared/aurionQuestCanonicalHash.ts`
- `shared/aurionQuestContract.ts`
- `shared/aurionStarterVillageContract.ts`
- `shared/worldAssetProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/759
- Merge commit: `313f62aaa551c17ba09a5d01eed7075f980dc56d`
- PR head: `ff870eac3c9eb5fd59a7159e6b49d05134437138`
- Merged at: 2026-10-05T00:18:24Z
- Post-merge workflow run: 37247004094
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #761 — fix(issue-741): unblock Starterdorf pilot through canonical public character admission
Status: VERIFIED repository merge
<!-- auto-memory: pr=761 merge=d02a3794d3d0bedf9e2a7529f71443ed59d3809e -->
Task: Merge PR #761 into `main` — fix(issue-741): unblock Starterdorf pilot through canonical public character admission.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/starter-village-pilot.yml`
- `client/src/xaurion/components/PublicCharacterPicker.test.tsx`
- `client/src/xaurion/components/PublicCharacterPicker.tsx`
- `e2e/aim292.npcMemory.spec.ts`
- `e2e/starterVillagePilot.spec.ts`
- `scripts/seed-starter-village-public-character.ts`
- `server/glbSmartUpload.test.ts`
- `server/starterVillagePilotHttp.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/761
- Merge commit: `d02a3794d3d0bedf9e2a7529f71443ed59d3809e`
- PR head: `b1f531f2b5f4240898a71b0e95f3cf95361eda92`
- Merged at: 2026-10-05T02:02:52Z
- Post-merge workflow run: 37253814083
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #762 — feat(fountain): integrate owner starter-village fountain LOD family
Status: VERIFIED repository merge
<!-- auto-memory: pr=762 merge=8c9dd111d5c7b691dbc0bc01edd102a6f29145b8 -->
Task: Merge PR #762 into `main` — feat(fountain): integrate owner starter-village fountain LOD family.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/starter-village-pilot.yml`
- `assets/environment/fountain/Aurion_Village_Fountain_LOD1.glb`
- `assets/environment/fountain/Aurion_Village_Fountain_LOD2.glb`
- `assets/environment/fountain/README.md`
- `client/src/xaurion/core/UploadedAssetRuntime.test.ts`
- `client/src/xaurion/core/UploadedAssetRuntime.ts`
- `client/src/xaurion/integration/UploadedWorldCatalogProjection.ts`
- `scripts/game-dev-aurion-adapter.mjs`
- `scripts/seed-starter-village-fountain.ts`
- `server/gameDevelopmentStudioAurionAdapter.test.ts`
- `server/glbAssetClassifier.test.ts`
- `server/glbCatalogFamilies.test.ts`
- `server/starterVillageFountainAsset.test.ts`
- `shared/aurionVillageFountainContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/762
- Merge commit: `8c9dd111d5c7b691dbc0bc01edd102a6f29145b8`
- PR head: `1e04c477eb8e009a2a7f363504339e1718af4e53`
- Merged at: 2026-10-05T03:13:25Z
- Post-merge workflow run: 37258565316
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #764 — feat(asterion): integrate owner courtyard LOD0/1/2 family
Status: VERIFIED repository merge
<!-- auto-memory: pr=764 merge=98fa6d214386e02757fdadb1b647481a90c3edd8 -->
Task: Merge PR #764 into `main` — feat(asterion): integrate owner courtyard LOD0/1/2 family.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/asterion-courtyard-evidence.yml`
- `assets/environment/asterion-courtyard/Asterion_Courtyard_LOD0.glb`
- `assets/environment/asterion-courtyard/Asterion_Courtyard_LOD1.glb`
- `assets/environment/asterion-courtyard/Asterion_Courtyard_LOD2.glb`
- `assets/environment/asterion-courtyard/README.md`
- `scripts/seed-asterion-courtyard.ts`
- `server/asterionCourtyardAsset.test.ts`
- `server/glbAssetClassifier.test.ts`
- `server/glbCatalogFamilies.test.ts`
- `shared/asterionCourtyardContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/764
- Merge commit: `98fa6d214386e02757fdadb1b647481a90c3edd8`
- PR head: `be2958abd386b8f629907e501de2940dd827acbd`
- Merged at: 2026-10-05T03:27:37Z
- Post-merge workflow run: 37259528534
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #765 — ci(asterion): pin pnpm setup action
Status: VERIFIED repository merge
<!-- auto-memory: pr=765 merge=0d64c35f4d2af08c0ad1c2b0dc093441aa248850 -->
Task: Merge PR #765 into `main` — ci(asterion): pin pnpm setup action.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/asterion-courtyard-evidence.yml`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/765
- Merge commit: `0d64c35f4d2af08c0ad1c2b0dc093441aa248850`
- PR head: `14282ac78eaa6e002292750851859c1fc824b721`
- Merged at: 2026-10-05T03:31:18Z
- Post-merge workflow run: 37259769863
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #766 — fix(issue-742): fail closed on incomplete Starterdorf evidence
Status: VERIFIED repository merge
<!-- auto-memory: pr=766 merge=ada0c230b46010c5d7a07c55007c3beddf7814b4 -->
Task: Merge PR #766 into `main` — fix(issue-742): fail closed on incomplete Starterdorf evidence.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/starter-village-pilot.yml`
- `e2e/starterVillagePilot.spec.ts`
- `playwright.starter-village.config.ts`
- `scripts/verify-starter-village-evidence.mjs`
- `scripts/verify-starter-village-evidence.test.mjs`
- `server/starterVillagePilotHttp.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/766
- Merge commit: `ada0c230b46010c5d7a07c55007c3beddf7814b4`
- PR head: `5f5fa591c432f2d56bebd6129dfe734f80bf1adb`
- Merged at: 2026-10-05T03:55:33Z
- Post-merge workflow run: 37261351961
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #768 — fix(evidence): redact Starterdorf diagnostics before artifact upload
Status: VERIFIED repository merge
<!-- auto-memory: pr=768 merge=730ba65cc9838c0e3dfda71df2f5438fe5f8bd09 -->
Task: Merge PR #768 into `main` — fix(evidence): redact Starterdorf diagnostics before artifact upload.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/starter-village-pilot.yml`
- `scripts/collect-starter-village-diagnostics.mjs`
- `scripts/collect-starter-village-diagnostics.test.mjs`
- `scripts/verify-starter-village-evidence.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/768
- Merge commit: `730ba65cc9838c0e3dfda71df2f5438fe5f8bd09`
- PR head: `b54080104df15042ad1c9041c2b3c8e377cdb50f`
- Merged at: 2026-10-05T04:16:11Z
- Post-merge workflow run: 37262766371
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — Issue #527 Visual CAG intelligence boundary
Status: VERIFIED candidate
Change: Added bounded deterministic visual Recipe/IR and optional evidence-only Wolfram/CAG analysis; fixed tied-affix canonicalization with slot/id/groupId ordering and explicit INCONCLUSIVE provider output.
Learned: Presentation analysis stays identity-neutral only when canonical ordering is total and unavailable/unparseable provider evidence can never collapse to MATCH.
Evidence: Candidate head f63b5ce87440b8acab5d83fda98748f6efbfa9d0; Aurion Local Test Pack 37266404421, Runtime Container Proof 37266404321, Runtime Candidate 37266404435, AIM-292 37266404338, AIM-535 37266404335 — all success.


### 2026-10-05 — PR #770 — feat(visual): harden CAG intelligence boundary for issue #527
Status: VERIFIED repository merge
<!-- auto-memory: pr=770 merge=0adc5f101e58a891cad9685525495bec68196730 -->
Task: Merge PR #770 into `main` — feat(visual): harden CAG intelligence boundary for issue #527.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `server/visualCagIntelligenceBoundary.test.ts`
- `server/visualCagIntelligenceBoundary.ts`
- `shared/visualConstructionProtocol.ts`
- `visual-cag-intelligence-boundary.md`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/770
- Merge commit: `0adc5f101e58a891cad9685525495bec68196730`
- PR head: `784aff24be0dbfc38ef204d7d70add09c5f03a3d`
- Merged at: 2026-10-05T05:22:41Z
- Post-merge workflow run: 37267513798
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-05 — Executable stateless-determinism public reference
Status: VERIFIED repository candidate
Task: Make the public stateless-determinism reference directly executable and exportable without turning the Gist into a second source of truth.
Decisions: Keep the canonical implementation and tests in `examples/stateless-determinism/`; export the current public page plus executable files through a deterministic local bundler; do not publish or claim a Gist without an authenticated Gist-write channel.
Touched surfaces: `examples/stateless-determinism/deterministic-step.ts`, `examples/stateless-determinism/deterministic-step.test.ts`, `examples/stateless-determinism/demo.ts`, `scripts/export-stateless-determinism-gist.mjs`, `docs/public-patterns/stateless-determinism-minimal-runtime.md`, `Memory.md`.
Evidence: Branch `docs/stateless-determinism-executable-20261005`; implementation commit `02fcfa06ba6d82b44fe9300f89896c8d3470eb31`; test commit `ee0c81fee44493dbe4308f17ab6c777c70cf93fc`; demo commit `5f40e814a5c1c3441b527255d54d69bb9c945f72`; exporter commit `ca0925aae5c8cd25d0893a41e2518ff4e215ba5d`; documentation link commit `94dbc103ffb3bf16268fbdc3c8420beddcf41313`. Exact-head CI and GitBook preview/readback remain required before merge.
Learned: Treating the Gist as a generated distribution artifact preserves one canonical reviewed source while still making the public pattern independently runnable and digest-verifiable.
Open: Direct gist.github.com publication still requires an authenticated Gist-write capability; no publication is claimed.
Next safe step: Open the PR, require exact-head repository and GitBook evidence, then merge and read back main.



### 2026-10-05 — PR #771 — docs: make stateless determinism reference executable
Status: VERIFIED repository merge
<!-- auto-memory: pr=771 merge=64e64321d55576560444f57ca390032694a9e082 -->
Task: Merge PR #771 into `main` — docs: make stateless determinism reference executable.
Decisions: Documentation/example-only. No gameplay, persistence, schema, deployment or production runtime behavior changes.
Touched surfaces:
- `.github/workflows/stateless-determinism-public-pattern.yml`
- `Memory.md`
- `docs/public-patterns/stateless-determinism-minimal-runtime.md`
- `examples/stateless-determinism/demo.ts`
- `examples/stateless-determinism/deterministic-step.test.ts`
- `examples/stateless-determinism/deterministic-step.ts`
- `scripts/export-stateless-determinism-gist.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/771
- Merge commit: `64e64321d55576560444f57ca390032694a9e082`
- PR head: `aa3e5167d5a1ba2629bd4248d90d029bdb31bc9e`
- Merged at: 2026-10-05T06:20:46Z
- Post-merge workflow run: 37271951252
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-05 — PR #772 neural CAG verification boundary
Status: VERIFIED candidate
Änderung: Neural-CAG fail-closed gehärtet, echte Wolfram-CI-Evidence verdrahtet und die Runtime-Import-Grenze statisch bewiesen.
Erkenntnis: CAG bleibt bounded Offline-/Promotion-Evidence; Providerfehler dürfen weder als FALSIFIED noch als MATCH gelten, Aurion behält die Runtime-Authority.
Evidence: Candidate `ecd41cb95b09bb3868d895c9fb267d7422b20cc1`; AIM265 `37273479417` (74/74, neural 13/13, real `DESIGN_ORACLE_VERIFIED`, mask 0, artifact 11329572227); Local `37273479406`, Runtime Candidate `37273479573`, Container Proof `37273479571`, AIM-292 `37273479503`, AIM-535 `37273479423` — alle success.

### 2026-10-05 — Issue #717 CAG oracle closure
Status: VERIFIED candidate
Änderung: Spec-/Dataset-/Differential-Falsifikation, versionierter Benchmark und multidimensionales Neural-Artifact-Promotion-Gate ergänzt.
Erkenntnis: CAG darf Promotion nur evidenzbasiert blockieren/freigeben, niemals Artifact-Aktivierung oder Gameplay-Authority übernehmen.
Evidence: Candidate `5ebdd73d59496787453d5d38ca4a4df3f877ef94`; AIM265 `37276023307` (77/77, real `PROMOTION_CANDIDATE_VERIFIED`, artifact 11330137582), Local `37276023243`, Runtime Candidate `37276023365`, Container Proof `37276023244`, AIM-292 `37276023367`, AIM-535 `37276023396` — alle success.

### 2026-10-05 — PR #769 Starterdorf replay assurance closure
Änderung: Membership join/leave wird receipt-gebunden replaybar, Restart-/Shutdown-Evidence und redacted Diagnostics sind exact-head versiegelt.
Erkenntnis: Transport-Readback darf sofort reagieren, aber kausale Historie beginnt am zuletzt committed Canonical State; Fixtures und Checkpoints müssen deshalb vor Membership-Intents verankert sein.
Evidence: Candidate `37112741937aac2f8c0c3449e284ca9dbbc44b56`; Starter Village `37280103341`, Local `37280103310`, Chaos `37280103273`, Runtime Candidate `37280103380`, Container Proof `37280103309`, AIM-292 `37280103336`, AIM-259 `37280103364` — alle success.


### 2026-10-05 — PR #769 — fix(issue-743): seal Starterdorf replay assurance across restart
Status: VERIFIED repository merge
<!-- auto-memory: pr=769 merge=67adf983cd38b046548580aacc4d08aebae8573a -->
Task: Merge PR #769 into `main` — fix(issue-743): seal Starterdorf replay assurance across restart.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/starter-village-pilot.yml`
- `Memory.md`
- `scripts/causal-chaos/harness.ts`
- `scripts/diagnose-starter-replay-assurance.ts`
- `scripts/verify-starter-village-evidence.mjs`
- `scripts/verify-starter-village-evidence.test.mjs`
- `server/_core/gracefulCausalShutdown.test.ts`
- `server/_core/gracefulCausalShutdown.ts`
- `server/_core/index.ts`
- `server/causality/causalReceiptV2.test.ts`
- `server/causality/headlessCausalOracle.test.ts`
- `server/starterVillageReplayAssuranceMariaDb.test.ts`
- `server/zoneMembershipCausality.test.ts`
- `server/zoneRuntime.ts`
- `shared/aurionZoneIntentContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/769
- Merge commit: `67adf983cd38b046548580aacc4d08aebae8573a`
- PR head: `3d94c7d3ecf963d83965d289dddd35e04a811d05`
- Merged at: 2026-10-05T08:05:18Z
- Post-merge workflow run: 37281464963
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #774 — feat(aceg): deterministic capability/equipment graph solver for issue #686
Status: VERIFIED repository merge
<!-- auto-memory: pr=774 merge=ea431c7c464f67bc8f1f1e9490ee09edfd3dac69 -->
Task: Merge PR #774 into `main` — feat(aceg): deterministic capability/equipment graph solver for issue #686.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `shared/aurionCapabilityEquipmentGraph.test.ts`
- `shared/aurionCapabilityEquipmentGraph.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/774
- Merge commit: `ea431c7c464f67bc8f1f1e9490ee09edfd3dac69`
- PR head: `575045eab0e33cf04553dc2454b83ffbf24b51b0`
- Merged at: 2026-10-05T08:36:28Z
- Post-merge workflow run: 37284690031
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #775 — fix(client): mobile playability hardening for issue #686
Status: VERIFIED repository merge
<!-- auto-memory: pr=775 merge=5682303c30ec2bdc219fe7d682c320c564e4915c -->
Task: Merge PR #775 into `main` — fix(client): mobile playability hardening for issue #686.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/xaurion/integration/ax1AuthorityHud.css`
- `client/src/xaurion/integration/ax1MobilePlayabilityContract.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/775
- Merge commit: `5682303c30ec2bdc219fe7d682c320c564e4915c`
- PR head: `2e1b80cbdfe43489588a8b01b6802f94f3fa35d1`
- Merged at: 2026-10-05T09:50:25Z
- Post-merge workflow run: 37292676871
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #776 — feat(aceg): bind equipment authority to inventory persistence
Status: VERIFIED repository merge
<!-- auto-memory: pr=776 merge=18b4e788fb4451490e3fef70a7874f04b70205ec -->
Task: Merge PR #776 into `main` — feat(aceg): bind equipment authority to inventory persistence.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `e2e/issue502.inventory.spec.ts`
- `server/aurionAcegEquipmentAuthority.test.ts`
- `server/aurionAcegEquipmentAuthority.ts`
- `server/playerUiMariaDb.test.ts`
- `server/playerUiPersistence.ts`
- `server/zoneCombatEquipmentMariaDb.test.ts`
- `server/zoneCombatPersistence.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/776
- Merge commit: `18b4e788fb4451490e3fef70a7874f04b70205ec`
- PR head: `6bf37cead02bbaae5659a89566aacf020ad742ba`
- Merged at: 2026-10-05T10:40:12Z
- Post-merge workflow run: 37298050163
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #777 — Implement Living History Loop, concurrent NPC runtime, and guild/economy systems
Status: VERIFIED repository merge
<!-- auto-memory: pr=777 merge=79bca0aec28c6e85b8bed7fa5e69d84b64a580d8 -->
Task: Merge PR #777 into `main` — Implement Living History Loop, concurrent NPC runtime, and guild/economy systems.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-production-schema-readback.yml`
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `.github/workflows/aurion-schema-reconciliation-proof.yml`
- `client/src/components/GuildOverviewDashboard.tsx`
- `client/src/pages/Operations.tsx`
- `client/src/xaurion/integration/ax1FullCutover.test.tsx`
- `config/aurion-migration-wave-manifest.json`
- `deploy/aurion-production-schema-apply-core`
- `deploy/verify-aurion-production-schema-apply-artifact.mjs`
- `deploy/verify-aurion-production-schema-reconcile-artifact.mjs`
- `drizzle/0071_aurion_npc_guild_authority.sql`
- `drizzle/meta/_journal.json`
- `drizzle/schema.ts`
- `e2e/aim292.npcMemory.spec.ts`
- `e2e/starterVillagePilot.spec.ts`
- `scripts/aurionProductionSchemaReconciliation.ts`
- `scripts/build-aurion-production-apply-artifact.mjs`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `server/aurion/civilizationService.ts`
- `server/aurion/economicEventAggregator.ts`
- `server/aurion/livingHistoryLoop.ts`
- `server/aurion/npcConcurrentLifecycleRuntime.ts`
- `server/aurion/npcGuildProtocol.ts`
- `server/aurion/npcGuildRuntime.ts`
- `server/aurion/npcGuildStore.ts`
- `server/aurionCivilizationHistoryPersistence.ts`
- `server/aurionProductionSchemaReconcileDockerRunner.test.ts`
- `server/autonomousNpcLifeMariaDb.test.ts`
- `server/autonomousNpcLifeRuntime.ts`
- `server/blocker3Compliance.test.ts`
- `server/civilizationHistoryRouter.ts`
- `server/wasdAurionRuntime.ts`
- `shared/npcGuildContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/777
- Merge commit: `79bca0aec28c6e85b8bed7fa5e69d84b64a580d8`
- PR head: `58ebcc6e90c69a0089b24ce187b71bcaf4a8b006`
- Merged at: 2026-10-05T15:44:14Z
- Post-merge workflow run: 37335230894
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-05 — ARE-rLOGIC companion offline runner
Status: VERIFIED candidate
Task: Connect Aurion's existing append-only companion demonstrations to ARE-rLOGIC through an automated read-only research runner.
Decisions: Keep Aurion authoritative; export only bounded numeric observation/action vectors; omit account identity, raw session/sample IDs, timestamps, notes and frames; pseudonymize episode/sample IDs; never invent rewards; pin the external ARE-rLOGIC ingest revision; schedule the self-hosted export every six hours plus manual dispatch.
Touched surfaces: `scripts/export-arelogic-companion-memory.mjs`, its Node contract tests, `.github/workflows/arelogic-companion-offline-runner.yml`, integration documentation.
Evidence: Independent Node/Python sandbox proved 4/4 exporter tests, byte-stable sanitization and successful handoff into ARE-rLOGIC companion ingest; exported and normalized dataset SHA-256 matched at `359e9e6a12d6c677a37a09636c0759ec54514c0e30e0173703d6b837854533e7`; privacy grep over demonstration rows passed.
Learned: The existing CompanionMemoryStore is already the correct truth-adjacent source because it stores bounded observation/action vectors locally and does not replicate captured frames; the safe integration is a one-way artifact lane, not a runtime dependency.
Open: Production self-hosted runner must prove read access to the active companion-memory directory and produce the first real non-fixture artifact after merge.
Next safe step: Merge after candidate CI is green, then dispatch the workflow once and inspect the first production export artifact before considering any downstream automated learning.


### 2026-10-05 — PR #778 — Connect Aurion companion memory to automated ARE-rLOGIC offline runner
Status: VERIFIED repository merge
<!-- auto-memory: pr=778 merge=3875217b1a02f329bbbfa3e17ffa6ee42fb1711b -->
Task: Merge PR #778 into `main` — Connect Aurion companion memory to automated ARE-rLOGIC offline runner.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/arelogic-companion-offline-runner.yml`
- `Memory.md`
- `docs/integration/ARELOGIC_COMPANION_OFFLINE_RUNNER.md`
- `scripts/export-arelogic-companion-memory.mjs`
- `scripts/export-arelogic-companion-memory.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/778
- Merge commit: `3875217b1a02f329bbbfa3e17ffa6ee42fb1711b`
- PR head: `91aadaf556f286f71a578285c0a76f0318a2bca5`
- Merged at: 2026-10-05T17:02:31Z
- Post-merge workflow run: 37345437134
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-05 — ARE-rLOGIC no-data production readback
Status: VERIFIED candidate
Task: Make the automated ARE-rLOGIC production runner distinguish an empty/uninitialized companion-memory surface from an integration failure.
Decisions: Keep the fixed runtime memory location; probe it read-only; if absent, emit deterministic no-data export and ingest reports plus an empty JSONL artifact instead of failing; keep all privacy and authority gates unchanged.
Touched surfaces: `.github/workflows/arelogic-companion-offline-runner.yml`, ARE-rLOGIC integration documentation.
Evidence: First merged production run `37345437077` reached the self-hosted `aurion-static-deployer` and failed only because `/opt/aurion-zone-runtime/current/data/companion-memory` did not yet exist; no later step executed and no runtime state was changed.
Learned: Absence of the append-only companion directory is valid before the first server-side demonstration and must be represented as explicit no-data evidence, not conflated with runner breakage.
Open: Re-run after merge and inspect the uploaded no-data or first real demonstration artifact.
Next safe step: Merge after the export contract check is green; verify the automatic main-push runner and artifact readback.


### 2026-10-05 — PR #780 — Treat absent companion memory as verified ARE-rLOGIC no-data
Status: VERIFIED repository merge
<!-- auto-memory: pr=780 merge=e993aa719c2d8c693450fe8e9f3ed5405337d32a -->
Task: Merge PR #780 into `main` — Treat absent companion memory as verified ARE-rLOGIC no-data.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/arelogic-companion-offline-runner.yml`
- `Memory.md`
- `docs/integration/ARELOGIC_COMPANION_OFFLINE_RUNNER.md`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/780
- Merge commit: `e993aa719c2d8c693450fe8e9f3ed5405337d32a`
- PR head: `c8dafb4629573e7c4cbb0997349b8ab329ccd018`
- Merged at: 2026-10-05T17:05:08Z
- Post-merge workflow run: 37345770040
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-05 — Durable ARE-rLOGIC companion evidence bridge
Status: VERIFIED candidate
Task: Make normal Companion Learn/Record persist server-side demonstrations durably and feed the offline ARE-rLOGIC evidence lane automatically.
Decisions: Keep Aurion authoritative; persist CompanionMemoryStore in a dedicated Docker volume; expose raw memory only to a fixed root-owned sanitizer; call the reusable ARE-rLOGIC workflow only after the trusted final production gate; retain schedule/manual refresh; no reward fabrication or policy write-back.
Touched surfaces: production compose/image/promoter, bounded companion export helper, immutable runtime artifact, ARE-rLOGIC runner, focused runtime contract.
Evidence: exact candidate head `4d4dfd5ded35236a445e8551f3b57ec81e77a2cc`; ARE-rLOGIC runner `37348054430`, Traefik deploy proof `37348055783`, Local Test Pack `37348054495`, PR runtime candidate `37348054561`, container proof `37348054412`, schema/bootstrap/GDS/GLB/AIM-535/AIM-292 gates all green; Aikido code check reports no newly introduced issue after replacing the unsafe workflow_run trigger.
Learned: capture and server append already existed; the missing production link was durable volume storage plus a privileged sanitization boundary and a trusted post-production-gate invocation.
Open: A non-empty production ARE artifact requires a real authenticated player to activate Companion Learn/Record and perform at least one demonstrated action.
Next safe step: Merge, verify main production deployment and the called ARE-rLOGIC export, then read back the first real non-empty artifact when a demonstration exists.


### 2026-10-05 — PR #786 — Persist companion learning and feed ARE-rLOGIC automatically
Status: VERIFIED repository merge
<!-- auto-memory: pr=786 merge=8016702d43b38f4fe2d9a7a10e369d19b66a7649 -->
Task: Merge PR #786 into `main` — Persist companion learning and feed ARE-rLOGIC automatically.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/arelogic-companion-offline-runner.yml`
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `Dockerfile`
- `Memory.md`
- `deploy/aurion-arelogic-companion-export`
- `deploy/promote-aurion-zone-runtime.sh`
- `docker-compose.traefik.yml`
- `scripts/build-aurion-traefik-runtime-artifact.mjs`
- `server/aurionArelogicCompanionRuntime.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/786
- Merge commit: `8016702d43b38f4fe2d9a7a10e369d19b66a7649`
- PR head: `83a9f17cac04939eff3446e2bb312bc67ab98ac2`
- Merged at: 2026-10-05T17:42:38Z
- Post-merge workflow run: 37350457660
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #793 — feat(starter-village): integrate owner street-lamp LOD family
Status: VERIFIED repository merge
<!-- auto-memory: pr=793 merge=1c782bbceb7b951c186460aa3139e04e3ddb29c6 -->
Task: Merge PR #793 into `main` — feat(starter-village): integrate owner street-lamp LOD family.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/starter-village-pilot.yml`
- `assets/environment/street-lamp/Aurion_Street_Lamp_LOD0.glb`
- `assets/environment/street-lamp/Aurion_Street_Lamp_LOD1.glb`
- `assets/environment/street-lamp/Aurion_Street_Lamp_LOD2.glb`
- `assets/environment/street-lamp/Aurion_Street_Lamp_LOD3.glb`
- `assets/environment/street-lamp/README.md`
- `client/src/xaurion/core/UploadedAssetRuntime.test.ts`
- `client/src/xaurion/core/UploadedAssetRuntime.ts`
- `client/src/xaurion/integration/UploadedWorldCatalogProjection.ts`
- `scripts/game-dev-aurion-adapter.mjs`
- `scripts/seed-starter-village-street-lamp.ts`
- `server/gameDevelopmentStudioAurionAdapter.test.ts`
- `server/glbAssetClassifier.test.ts`
- `server/glbAssetClassifier.ts`
- `server/glbCatalogFamilies.test.ts`
- `server/starterVillageStreetLampAsset.test.ts`
- `shared/aurionVillageStreetLampContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/793
- Merge commit: `1c782bbceb7b951c186460aa3139e04e3ddb29c6`
- PR head: `157b55e95c002b4352a1002902e6fac80f629595`
- Merged at: 2026-10-05T18:43:20Z
- Post-merge workflow run: 37358088407
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #787 — Let Aurion record native demonstrations for ARE-rLOGIC
Status: VERIFIED repository merge
<!-- auto-memory: pr=787 merge=98c3c06023682586f28fcc5f8055434a0380274b -->
Task: Merge PR #787 into `main` — Let Aurion record native demonstrations for ARE-rLOGIC.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/lib/nativeResearchRecording.test.ts`
- `client/src/lib/nativeResearchRecording.ts`
- `client/src/xaurion/integration/Ax1CompanionOverlay.tsx`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/787
- Merge commit: `98c3c06023682586f28fcc5f8055434a0380274b`
- PR head: `3a24416e7c948acbebe99b1cdfbada52db1d576b`
- Merged at: 2026-10-05T18:46:52Z
- Post-merge workflow run: 37358544098
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #779 — ⚡ Bolt: [Optimize Set Retrieval]
Status: VERIFIED repository merge
<!-- auto-memory: pr=779 merge=73b61047e71e19c6b4a084c359afdecb25b04bea -->
Task: Merge PR #779 into `main` — ⚡ Bolt: [Optimize Set Retrieval].
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.Jules/bolt.md`
- `server/_core/sdk.ts`
- `server/aim265SpatialCalculation.test.ts`
- `server/glbAssetClassifier.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/779
- Merge commit: `73b61047e71e19c6b4a084c359afdecb25b04bea`
- PR head: `55ab13aee5f65a05d479848d970df2e4edfc1df1`
- Merged at: 2026-10-05T18:48:29Z
- Post-merge workflow run: 37358744493
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-05 — PR #788 — feat(rumor): player-facing causal rumor projection — issue #781
Status: VERIFIED repository merge
<!-- auto-memory: pr=788 merge=a798b9cd8389cfafa0773c2d3de351841772d180 -->
Task: Merge PR #788 into `main` — feat(rumor): player-facing causal rumor projection — issue #781.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `shared/rumorProjectionProtocol.test.ts`
- `shared/rumorProjectionProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/788
- Merge commit: `a798b9cd8389cfafa0773c2d3de351841772d180`
- PR head: `e7610e4b5f27359e01f9acc191513b3f11916885`
- Merged at: 2026-10-05T21:35:12Z
- Post-merge workflow run: 37376820891
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-06 — PR #789 — feat(investigation): causal investigation graph — issue #782
Status: VERIFIED repository merge
<!-- auto-memory: pr=789 merge=88fb5de67a15bbfd98ccd978308556d5a8ef74bd -->
Task: Merge PR #789 into `main` — feat(investigation): causal investigation graph — issue #782.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-pr-runtime-candidate.yml`
- `shared/investigationGraphProtocol.test.ts`
- `shared/investigationGraphProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/789
- Merge commit: `88fb5de67a15bbfd98ccd978308556d5a8ef74bd`
- PR head: `bcdff427a3b379ba96ed61b45f20d97f118e1d61`
- Merged at: 2026-10-06T00:58:40Z
- Post-merge workflow run: 37396798568
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-06 — PR #790 — feat(belief): rumor-to-behavior bridge — issue #783
Status: VERIFIED repository merge
<!-- auto-memory: pr=790 merge=80a040c51dfef2d04f6bebe21f0d510a32779455 -->
Task: Merge PR #790 into `main` — feat(belief): rumor-to-behavior bridge — issue #783.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-pr-runtime-candidate.yml`
- `server/rumorBeliefBridgePlanner.test.ts`
- `shared/rumorBeliefBridgeProtocol.test.ts`
- `shared/rumorBeliefBridgeProtocol.ts`
- `shared/rumorProjectionProtocol.test.ts`
- `shared/rumorProjectionProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/790
- Merge commit: `80a040c51dfef2d04f6bebe21f0d510a32779455`
- PR head: `cddba064c829e650c30e4cb5408153638be4b31d`
- Merged at: 2026-10-06T00:59:04Z
- Post-merge workflow run: 37396833885
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-06 — PR #791 investigation journal merge correction
Status: VERIFIED repository merge
Task: Record the completed #791 investigation-journal integration that the post-merge recorder skipped.
Decisions: Keep the journal read-only and server-confirmed; the browser evidence timeout was fixed by bounded 60 s viewport headroom without weakening assertions.
Touched surfaces: investigation journal protocol/UI/tests and starter-village browser evidence timeout.
Evidence: PR #791 merged as `6c795a49ad1a509ed0ef8919c48882b1fd95c137`; exact-head Runtime Candidate, Container Proof, Local Test Pack, Starter Village Pilot, Renderer/Recovery, visual, group-instance, GLB and NPC-memory gates all passed.
Learned: WebGL screenshot capture can outlive a 30 s test budget after assertions pass; bounded timeout headroom preserves the evidence contract without changing runtime authority.
Open: Continue ordered stack with #792, then the /play bootstrap fix.
Next safe step: Merge #792 only after its exact-head gates stay green.

### 2026-10-06 — PR #792 causal rumor evidence gate
Status: VERIFIED candidate
Task: Integrate the causal rumor/investigation end-to-end evidence gate after #791.
Evidence: Exact head `03ca9ca810c8196c3bf3b772202a536aa6bd5d94`; Runtime Candidate, Container Proof, Local Test Pack, Starter Village Pilot, AIM-535 and AIM-292 all green.
Learned: The umbrella gate adds evidence/documentation only; shared belief files are byte-identical to the already merged #790 lane.
Next safe step: Merge #792, then rebase and verify the /play renderer-bootstrap fix before release.

### 2026-10-06 — /play renderer bootstrap and re-entry transport fix
Status: VERIFIED candidate
Task: Remove the /play 1/4 evidence stall without starting simulation before authoritative zone truth.
Decisions: Render one presentation-only bootstrap frame; synchronously retire stale zone websocket/retry state on return and re-entry; keep MMOEngine.start() bound to the first confirmed zone snapshot.
Evidence: PR #798 exact head `8a62e8dcd4f8c9581587057ee55731a47b2602f1`; Runtime Candidate, Container Proof, Local Test Pack, Starter Village, AIM-259 re-entry, Renderer/Recovery, visual, GLB, asset shipping, NPC-memory and density gates all green.
Learned: The visible stall had two coupled lifecycle causes: renderer evidence waited on a snapshot, while rapid re-entry could inherit a half-retired zone transport.
Next safe step: Merge #798 and deploy/read back the exact production revision.


### 2026-10-06 — PR #798 — fix(play): unblock renderer evidence before first zone snapshot
Status: VERIFIED repository merge
<!-- auto-memory: pr=798 merge=25dcf2a8fdbd32b18899a6b7414511de32bb80a5 -->
Task: Merge PR #798 into `main` — fix(play): unblock renderer evidence before first zone snapshot.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-pr-runtime-candidate.yml`
- `Memory.md`
- `architecture/donor-ledger.json`
- `client/src/xaurion/components/Ax1InvestigationJournalModal.test.tsx`
- `client/src/xaurion/components/Ax1InvestigationJournalModal.tsx`
- `client/src/xaurion/core/MMOEngine.ts`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.test.tsx`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.tsx`
- `docs/architecture/AURION_CAUSAL_RUMOR_EVIDENCE_GATE.v1.md`
- `e2e/starterVillagePilot.spec.ts`
- `server/causalRumorInvestigationEvidence.test.ts`
- `server/rumorBeliefBridgePlanner.test.ts`
- `shared/investigationGraphProtocol.test.ts`
- `shared/investigationGraphProtocol.ts`
- `shared/investigationJournalProtocol.test.ts`
- `shared/investigationJournalProtocol.ts`
- `shared/rumorBeliefBridgeProtocol.test.ts`
- `shared/rumorBeliefBridgeProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/798
- Merge commit: `25dcf2a8fdbd32b18899a6b7414511de32bb80a5`
- PR head: `8a62e8dcd4f8c9581587057ee55731a47b2602f1`
- Merged at: 2026-10-06T02:30:45Z
- Post-merge workflow run: 37404493346
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-06 — production drift readback stays observable
Status: VERIFIED candidate
Change: Production schema readback now runs after a successful promotion even when the canonical apply lane fails; the final gate remains fail-closed.
Learned: Skipping readback on apply failure hid the migration-level drift evidence required for a safe repair.
Evidence: PR #799 exact head `6d1d835c0d73acc136c0f657185cb0d2968f6f55`; deploy contract, runtime candidate/container, local pack, schema bootstrap/apply proofs and NPC/runtime regressions green.


### 2026-10-06 — PR #799 — fix(deploy): preserve production schema drift readback after apply failure
Status: VERIFIED repository merge
<!-- auto-memory: pr=799 merge=e2f542f8495c8d9f2e7d03de2dda22794360b4de -->
Task: Merge PR #799 into `main` — fix(deploy): preserve production schema drift readback after apply failure.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `Memory.md`
- `server/aurionTraefikRuntimeDeployment.test.ts`
- `server/aurionZoneRuntimeSchemaBootstrap.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/799
- Merge commit: `e2f542f8495c8d9f2e7d03de2dda22794360b4de`
- PR head: `671a22a280f1b485c3951daa9890badd40be0d04`
- Merged at: 2026-10-06T21:47:16Z
- Post-merge workflow run: 37536319574
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the emitted revision-bound readback to identify the drifted migration, repair the canonical schema boundary, then rerun the production lane.

### 2026-10-08 — PR #802 BoxLite initialization and solver readback repair
Status: VERIFIED isolated OpenCourant solver proof; final-head CI/merge pending
Change: Provision targeted Bubblewrap AppArmor userns profile, retain maximum isolation, use the image's unprivileged /workspace, repin the upstream-republished package, copy directory contents explicitly, hash solver artifacts and independently read back the uploaded archive.
Learned: KVM access does not prove userns availability; Ubuntu 24.04 AppArmor denied setpcap/uid_map until the targeted profile loaded. The base image's user/workdir and BoxLite include_parent default are separate initialization/readback contracts. Mutable upstream release assets require fresh provenance plus an unchanged fail-closed hash gate.
Evidence: Original run 37537409608; AppArmor denial and successful namespace reprobe in 37771213837; GH release 405359625 / asset 617491847 and downloaded package SHA-256 9d67531de156dd9beba05fbfe710dcdc2bcecbdf3dc3a12642cf85dcece80081 match source commit 33e685176cccf0c539a3ce07aa2096985a284e2a. Run 37772144731 at d9282437bf4ed71e66049866bd0343d637ba1152 passed 12 regression tests, real KVM/BoxLite 0.10.5 Starter+Engine execution, NORMAL TERMINATION and file/deck hash readback; 15 solver files plus runtime-evidence.json uploaded as artifact 11548517313 (ZIP SHA-256 b1222e551e30670b72f7e71c43823cbefae2eca209b6ecf27608018145f6674f).
Next safe step: Require all final-head regression/runtime gates and fresh-runner archive readback green, then merge with an expected-head lease and verify GitHub merge/main readback. This records isolated numerical proof, not live gameplay integration.


### 2026-10-08 — PR #802 — feat(physics): BoxLite-isolated OpenCourant WORLD_IMPACT baking
Status: VERIFIED repository merge
<!-- auto-memory: pr=802 merge=83c4a7dc7466f5f9361f1d8261a5239903c8fe2e -->
Task: Merge PR #802 into `main` — feat(physics): BoxLite-isolated OpenCourant WORLD_IMPACT baking.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-opencourant-boxlite-runtime-proof.yml`
- `Memory.md`
- `docs/architecture/AURION_OPENCOURANT_BOXLITE_WORLD_IMPACT.md`
- `scripts/opencourant-bwrap.apparmor`
- `scripts/opencourant-host-boundary.test.mjs`
- `scripts/opencourant_evidence.py`
- `scripts/opencourant_evidence_test.py`
- `scripts/run-opencourant-boxlite.py`
- `server/aurionOpenCourantBoxliteAdapter.test.ts`
- `server/aurionOpenCourantBoxliteAdapter.ts`
- `shared/aurionImpactBakeProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/802
- Merge commit: `83c4a7dc7466f5f9361f1d8261a5239903c8fe2e`
- PR head: `1f3bb201a72c2581ac5f1d8bf0e0d211481360ea`
- Merged at: 2026-10-08T11:58:22Z
- Post-merge workflow run: 37773617788
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-08 — Consolidate nine reviewed draft PRs
Status: REVIEWED; 38 focused regression tests passed; exact-head CI/runtime merge gates pending.
Change: Salvage #796 footer landmark, #800/#812 cached zone ordering, #801/#803/#811 direct chunk lookup, #803 receipt iteration/early-exit test search, #804/#813 button hints and disabled motion, and #810 linked form inputs/loading state. Reuse the existing presence entity ID and React useId instead of introducing duplicate identity state or duplicate DOM IDs.
Decision: Rebuild on main 9b82a2910e1e73a7292892bc1dd6ec4a2e8ce4ce. Reject unrelated benchmark churn, inaccurate historical bot notes, widened unused panel types, and all rollback hunks in #796/#801 that remove memory, tests, runtime gates or existing causal/investigation features. Close superseded drafts after the clean replacement merges; keep branches and provenance.
Evidence: Reviewed every changed file of all nine open drafts. Local Vitest: 6 files / 38 tests passed, including membership grow/shrink/reconnect/restore, receipt hit/miss and multiple dashboard label associations. This is regression evidence only; real DB/runtime evidence must come from the final-head GitHub workflows.
Next safe step: Require final-head regression, runtime candidate/container and affected browser/DB workflows; merge with an expected-head lease, close superseded PRs, then independently verify main, post-merge memory readback and zero open PRs.
Follow-up evidence: The added welcome-membership regression failed on the proposed shared presence array (player:10 leaked into player:2's earlier welcome). Keep outward membership lists separate across the gateway's awaited presence lease while reusing internal peer/zone arrays. After this correction, 8 targeted files / 44 tests passed, including the actual WebSocket gateway presence test.
Final scope decision: Reject #800/#812 zone-array changes from this integration. Exact candidate c8cbea178fa673e9eaacf21d3a697fd4d7595c47 failed group reentry in all three attempts of run 37776042842; the same failure existed in original #800 run 37536707421. Diagnostic run 37778221618 passed with identical application code but does not substitute for the candidate gate. Restore zone implementation and its tests exactly to main; retain only independently validated lookup/receipt/test-search and UI improvements. No existing assertions, thresholds or workflows are changed. Preserve rejected source branches and failure evidence for separate investigation.


### 2026-10-08 — PR #814 — Consolidate validated draft improvements: lookups and accessible controls
Status: VERIFIED repository merge
<!-- auto-memory: pr=814 merge=2240a76a4e5ea4388b858a72a4e5d39d1b5b8972 -->
Task: Merge PR #814 into `main` — Consolidate validated draft improvements: lookups and accessible controls.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/components/CausalStudioDashboard.test.tsx`
- `client/src/components/CausalStudioDashboard.tsx`
- `client/src/pages/Community.tsx`
- `client/src/pages/Home.test.tsx`
- `client/src/pages/Home.tsx`
- `client/src/xaurion/core/MMOEngine.ts`
- `server/aim245LivingWorld.test.ts`
- `server/questCompiler/persistence.test.ts`
- `server/questCompiler/persistence.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/814
- Merge commit: `2240a76a4e5ea4388b858a72a4e5d39d1b5b8972`
- PR head: `bd0e9b23353aef86e39fad7ffb8d64aa20afa0c9`
- Merged at: 2026-10-08T15:32:22Z
- Post-merge workflow run: 37801600470
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-09 — PR #825 — Consolidate reviewed PRs: preserve Aurion authority, receipts and validation
Status: VERIFIED repository merge
<!-- auto-memory: pr=825 merge=9b84e8093f731d72a66f339461cdaed462bc4ace -->
Task: Merge PR #825 into `main` — Consolidate reviewed PRs: preserve Aurion authority, receipts and validation.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aim259-group-instances.yml`
- `client/src/components/AchievementsGallery.test.tsx`
- `client/src/components/AchievementsGallery.tsx`
- `client/src/pages/Home.test.tsx`
- `client/src/pages/Home.tsx`
- `docs/balancing/aim265-candidate.json`
- `playwright.aurion-groups.config.ts`
- `scripts/balancing/aurion-cag-design-canary.ts`
- `server/_core/corsOrigin.ts`
- `server/_core/index.ts`
- `server/aurion/npc/npcLifeProtocol.ts`
- `server/aurionCagDesignOracle.test.ts`
- `server/corsOrigin.test.ts`
- `server/deterministicTerrainPipeline.test.ts`
- `server/npcLifeProtocol.test.ts`
- `server/openWorldProtocol.test.ts`
- `server/openWorldProtocol.ts`
- `server/questCompiler/persistence.ts`
- `server/questCompiler/templateRegistry.ts`
- `server/questCompiler/worldFacts.ts`
- `server/terrainProbeReview.test.ts`
- `shared/aurionCagDesignProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/825
- Merge commit: `9b84e8093f731d72a66f339461cdaed462bc4ace`
- PR head: `463d0cd3d597606c2614c1630485b9f4ce71a6e6`
- Merged at: 2026-10-09T06:12:40Z
- Post-merge workflow run: 37892359934
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-09 — PR #830 — Schema repair before runtime promotion
Status: VERIFIED isolated MariaDB recovery/repair evidence; production execution remains unverified.
<!-- integration-memory: pr=830 -->
Task: Add bounded canonical drift repair, exact-revision release coordination and authenticated gameplay readback.
Decisions: Aurion owns all runtime and persistence truth. Preserve OIDC and exact-main guards; require backup/restore, isolated repair rehearsal and independent full schema readback before application promotion. Unknown or incompatible drift stops the whole plan.
Evidence: Root/MariaDB proof [37904103355](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/37904103355) at `343df87dfd0f24dcbc25eab00ab407a882cb48cf` passed sparse repair, preserved ledger data and unknown-drift rejection. The same revision passed runtime candidate/container, schema reconciliation and item-manipulation proof lanes. Follow-up contract tests and TypeScript checks pass locally; final-head CI remains the merge gate.
Learned: Memory must finish before release dispatch. A successful container healthcheck cannot replace a real zone welcome, advancing NPC resolution or MariaDB guild readback.
Open: Trusted protocol-3 promoter installation, authorized functional-probe session and a fresh production drift plan are prerequisites. No production repair, OOM resolution or visual recovery is claimed.

### 2026-10-09 — PR #831 — Close release and column-observation gaps
Status: VERIFIED local regression; exact-head CI and real MariaDB proof remain the merge gate.
<!-- integration-memory: pr=831 -->
Task: Bind release dispatch to the Memory-checked SHA and include defaults/EXTRA in every live column observation.
Evidence: TypeScript and 49 focused tests pass, including executable rejection of changed/missing dispatch revisions. The isolated database lane checks wrong defaults and ON UPDATE at partial and complete schemas, with unchanged journal rows after rejection.
Learned: A branch name alone does not bind dispatch to an observed commit; schema readers must inspect the same complete column contract.
Open: Production repair and functional recovery remain unverified; preserve the protocol-3 installation and authenticated-probe prerequisites.


### 2026-10-09 — PR #832 — fix(aurion): restore pre-stack journal UI state
Status: VERIFIED repository merge
<!-- auto-memory: pr=832 merge=62a0285366b670c414f18781679b08e6041c7511 -->
Task: Merge PR #832 into `main` — fix(aurion): restore pre-stack journal UI state.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `architecture/donor-ledger.json`
- `client/src/xaurion/components/Ax1InvestigationJournalModal.test.tsx`
- `client/src/xaurion/components/Ax1InvestigationJournalModal.tsx`
- `docs/architecture/AURION_CAUSAL_RUMOR_EVIDENCE_GATE.v1.md`
- `shared/investigationJournalProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/832
- Merge commit: `62a0285366b670c414f18781679b08e6041c7511`
- PR head: `51e77ae54b6f04a5036c7afdc6289d059f62feb9`
- Merged at: 2026-10-09T09:59:21Z
- Post-merge workflow run: 37914782293
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.
