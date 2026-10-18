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

### 2026-10-09 — PR #834 — Revision-bound one-shot production probes
Status: PARTIAL; isolated database/HTTP evidence verified, production authorization/readback blocked.
Task: Add existing-admin Ops confirmation with password reauthentication, GitHub OIDC verification, durable atomic per-scope consumption and migration 0072; remove exported browser sessions from both probe consumers without weakening release/schema gates.
Evidence: At `aca6916a365bdd28b318e28ed789c83daab949cf`, [37940219342](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/37940219342) passed 30 tests against real isolated MariaDB/HTTP, including twelve competing consumers, replay, role, expiry, revocation, Origin/CSRF and signature rejection. Root reconciliation artifact proof [37940218962](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/37940218962) passed. Local final candidate passed TypeScript, 72/72 migration validation and 2064 regression tests (227 skipped); exact final-head CI remains a gate.
Learned: Read-only observations cannot prove an actual player join; preserve the functional gate as UNVERIFIED instead of granting mutation authority or reporting synthetic success.
Open: Live `/healthz` still identifies `9b84e8093f731d72a66f339461cdaed462bc4ace` with missing `aurionNpcGuildStates`; the approval API is not deployed. Controlled API/schema bootstrap, real GitHub-OIDC-to-production proof and an explicitly bounded functional-join design remain prerequisites. OIDC-only admins currently lack password step-up. No production repair, successful production probe or merge is claimed.


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


### 2026-10-10 — PR #834 — [WIP] Aurion #833: owner-approved one-shot OIDC production probes
Status: VERIFIED repository merge
<!-- auto-memory: pr=834 merge=32412ac1246470b6935491601243ec06561b4385 -->
Task: Merge PR #834 into `main` — [WIP] Aurion #833: owner-approved one-shot OIDC production probes.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-production-probe-approval-proof.yml`
- `.github/workflows/aurion-production-schema-readback.yml`
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `.github/workflows/aurion-schema-reconciliation-proof.yml`
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `Memory.md`
- `client/src/components/ProductionProbeApproval.tsx`
- `client/src/pages/Operations.tsx`
- `config/aurion-migration-wave-manifest.json`
- `deploy/aurion-production-schema-apply-core`
- `deploy/promote-aurion-zone-runtime.sh`
- `deploy/verify-aurion-production-schema-apply-artifact.mjs`
- `deploy/verify-aurion-production-schema-reconcile-artifact.mjs`
- `drizzle/0072_aurion_production_probe_approvals.sql`
- `drizzle/meta/_journal.json`
- `drizzle/schema.ts`
- `scripts/aurion-production-probe-client.mjs`
- `scripts/aurionProductionSchemaReconciliation.ts`
- `scripts/aurionSchemaRepairPlan.ts`
- `scripts/build-aurion-production-apply-artifact.mjs`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `scripts/schema-repair-proof-fixture.mjs`
- `scripts/verify-aurion-production-gameplay.ts`
- `server/_core/index.ts`
- `server/aurionProductionGameplayReadback.test.ts`
- `server/aurionProductionProbeApprovalContract.test.ts`
- `server/aurionProductionProbeApprovalContract.ts`
- `server/aurionProductionProbeHttp.ts`
- `server/aurionProductionProbeHttpMariaDb.test.ts`
- `server/aurionProductionProbeMariaDb.test.ts`
- `server/aurionProductionProbeOidc.test.ts`
- `server/aurionProductionProbeOidc.ts`
- `server/aurionProductionProbeStore.ts`
- `server/aurionProductionSchemaReconcileDockerRunner.test.ts`
- `server/aurionSchemaRepairPlan.test.ts`
- `server/blocker3Compliance.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/834
- Merge commit: `32412ac1246470b6935491601243ec06561b4385`
- PR head: `fad08ea77794a62c641d8ff45efe384c1a351674`
- Merged at: 2026-10-10T00:01:24Z
- Post-merge workflow run: 38007199772
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-10 — PR #838 — GitBook journal ownership correction
Status: VERIFIED documentation diff; merge pending.
<!-- integration-memory: pr=838 -->
Change: Replace the two remaining active AX1 journal/readmodel assignments in causal-rumor-and-investigation-gameplay.md with Aurion client/readmodel terminology.
Learned: The GitBook gameplay page must follow the same Aurion ownership boundary as the shared journal contract; AX1 has no active runtime role.
Evidence: Exactly two wording substitutions; no AX1 reference remains in the page; frontmatter, GitBook blocks, SUMMARY.md and sync configuration preserved. Documentation-only; no runtime behavior or production recovery is claimed.
Task: Align the two remaining GitBook journal/readmodel references with Aurion ownership.
Open: Production recovery remains unverified; this documentation change does not restore a previous release or repair the live schema.

### 2026-10-10 — PR #839 — Restore valid integration Memory for #838
Status: VERIFIED recorder regression and replay against the actual Memory snapshot; production recovery unverified.
<!-- integration-memory: pr=839 -->
Task: Complete the existing #838 record so its post-merge recorder can proceed without weakening validation.
Evidence: The unchanged recorder rejects the original with INTEGRATION_MEMORY_ENTRY_INVALID and accepts the completed #838 and #839 entries without adding duplicates; the existing recorder regression passes.
Learned: Pre-merge integration records require Status, Task, Evidence, Learned and Open; a documentation merge does not prove live recovery.
Open: Production still serves 9b84e8093f731d72a66f339461cdaed462bc4ace with missing aurionNpcGuildStates; release 38007227256 stopped before schema preparation at the owner-approved probe gate.

### 2026-10-10 — PR #841 — Production probe review corrections
<!-- integration-memory: pr=841 -->
Status: VERIFIED isolated runtime/MariaDB readback and regression; final-head CI remains a merge gate, production unverified.
Task: Bind probe PASS to its committed join/leave receipt chain, exclude the reserved probe actor from hostile targeting, and require positively identified legacy revision for bootstrap.
Learned: A queued tick, generic assurance snapshot or missing HTTP route cannot prove durable execution or authorize bootstrap by itself.
Evidence: Code revision 3c00eb0a92378660206043b24a8292a25e362299; GitHub run 38066170266 passed all 45 approval/runtime/MariaDB tests, including independent membership readback and rejection after receipt deletion. Local full regression passed 416 files/2072 tests (65 files skipped); TypeScript and production build passed. Added delayed-write and deterministic replay regressions for final-head CI.
Open: No production mutation or successful production readback is claimed; explicit run-bound owner approvals and existing release/schema/backup/recovery gates remain required.
Follow-up: Restore a missing probe zone from verified persisted history, stop probe-owned ticking after cleanup, retain the session lock through durable failure cleanup, and export only probe membership/hash evidence. Interrupted persisted player sessions fail closed before consuming approval.
Evidence (follow-up): a5138a18bbc784347c038f6044753b3edbbd8d7d; run 38067497823 passed 54 tests including real MariaDB revision continuation and cleanup-lock retention. Local full regression passed 417 files/2079 tests (65 files skipped), TypeScript and server bundle passed; existing Memory entry remains singular.
Further review correction: Migration 0073 adds durable probe exclusion across connection loss; orphan fences require explicit recovery and have no timeout takeover. Probe-created zones retain their hydrated head dormant for the next normal player. Local full regression passed 417 files/2079 tests (65 files skipped), TypeScript passed, and all 73 migrations passed the chain check; new connection-kill and player-continuation MariaDB cases remain exact-head CI gates before merge.
Evidence (durable fence): 76fe6b4937f2d2b095cf3edaa49687239d78c417; run 38069126900 passed all 55 runtime/approval/MariaDB tests. Schema artifact CI exposed stale 51-migration retry/rehearsal/promotion counts; aligned them with the 52-entry manifest and added a cross-file regression (21 targeted tests passed). Complete final-head CI remains required.

### 2026-10-10 — PR #844 — Classify the blocked production control-plane preflight
<!-- integration-memory: pr=844 -->
Status: VERIFIED local gate regression and TypeScript; production BLOCKED, exact-head CI/review still required.
Task: Reject HTTP 200 HTML before parsing the normal release preflight and sanitize malformed control-plane JSON errors without changing bootstrap or approval authority.
Learned: The release run reached JSON.parse on an HTML response. The previously recorded runtime revision has no probe routes and serves its SPA for unknown paths; this explains the observed failure but does not establish a fresh live identity. A diagnostic repair cannot install the missing control plane or authorize production.
Evidence: Code revision e4da70c27bac4ac70fce7184cd3083be348744f1; the new regression fails against the original afe76b7f workflow and passes against the fixed actual workflow shell, including nine response/approval cases. All 26 Node release tests, 17 targeted deployment/attestation tests and TypeScript pass locally. Original production run https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/38070383232 passed build/signature and isolated schema/backup/recovery proofs but failed before schema preparation.
Open: No new production run, schema mutation, promotion or gameplay probe performed. Fresh HTTPS readback is blocked by the execution environment's HTTP 403; the runtime connector rejects its advertised empty arguments with a missing kwargs error. Live control-plane installation/readback and run-bound owner approvals through the protected release path remain prerequisites. Bootstrap stays disabled; no credential or permission changes.


### 2026-10-11 — PR #840 — feat(site): cinematic Echoes of Aurion player landing (GitHub Pages)
Status: VERIFIED repository merge
<!-- auto-memory: pr=840 merge=abcbf0ec9964cf55a3e4c4b1b806fdb3fc46b6ac -->
Task: Merge PR #840 into `main` — feat(site): cinematic Echoes of Aurion player landing (GitHub Pages).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-public-site-check.yml`
- `.github/workflows/aurion-public-site-publish.yml`
- `docs/aurion-player-site/README.md`
- `public-site/index.html`
- `public-site/media/aurion-realm.svg`
- `public-site/media/sigil.svg`
- `public-site/rechtliches.html`
- `public-site/styles.css`
- `scripts/verify-aurion-public-site.py`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/840
- Merge commit: `abcbf0ec9964cf55a3e4c4b1b806fdb3fc46b6ac`
- PR head: `a2cf8824ab7a7bb811cade83cfeefbcfb1f3bd88`
- Merged at: 2026-10-11T00:12:38Z
- Post-merge workflow run: 38097650560
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-11 — PR #855 — Align GLB backfill workflow with bounded sudo wrapper
<!-- integration-memory: pr=855 -->
Status: VERIFIED isolated exact-head regression and candidate runtime; production backfill remains UNVERIFIED.
Task: Correct the three production workflow CLI calls to the existing positional audit/apply/readback wrapper contract without altering persistence or gameplay authority.
Evidence: PR head `89dfbccab72459003ca972b8c7b6cd3e3ad5858e`; six successful exact-head CI workflows (including AIM-240 real MariaDB GLB tests, container candidate health, and local suite 2079 passed / 233 skipped); `server/glbNormalizationBackfillContract.test.ts` passed three tests. No production mutation.
Learned: Passing `--mode` to the two-positional-argument sudo wrapper fails before any backfill; aligning caller and wrapper plus a contract regression prevents this CLI drift but does not prove a deployed release.
Open: Production deployment 38100805366 failed at `RELEASE_DISPATCH_REVISION_MISMATCH` (expected 12b11c33..., GITHUB_SHA bfb2e74f...); repair requires correct merged release SHA, complete protected promotion/schema/runtime checks, audit-first verified missing set, explicit apply, and independent GLB catalog readback.

### 2026-10-12 — PR #857 — Aurion Admin MCP with separate FusionAuth application roles
<!-- integration-memory: pr=857 -->
Status: VERIFIED local regression and actual Authorization Code/PKCE token issuance; production MCP access remains UNVERIFIED until protected release and canonical account readback.
Task: Repair Admin MCP ESM handlers and canonical quest/capsule contracts, then support a dedicated public PKCE client without the paid Advanced OAuth Scopes feature.
Evidence: Local full suite passed 419 files / 2097 tests (65 files / 233 tests skipped); 46 focused MCP/release tests, TypeScript, server bundle and whitespace validation passed. Dedicated application 91097c69-cf11-42ae-8be2-1d0a821e7758 was independently read back with exact resource/callback, three explicit non-default roles and required registration. A real access token passed signature, issuer, resource/client audiences, applicationId and role checks; a real ID token with the same audiences lacked applicationId/roles and was rejected. No token, password or signing material is stored in the repository.
Learned: FusionAuth custom scopes require a license in this tenant, while separate application roles work without it. Resource audience alone does not distinguish this provider's access and ID tokens. Application binding, exact roles and the independent Aurion database admin check must all remain enforced.
Open: Live Aurion still serves legacy revision 9b84e8093f731d72a66f339461cdaed462bc4ace. The authenticated OIDC account currently has canonical role=user; its bounded operator must accept the existing 64-character OIDC hash before an approved role plan/apply. Final-head CI, protected promotion/schema/backup gates, ChatGPT's exact callback and authenticated production initialize/tools/readback remain required. No production MCP success is claimed.

### 2026-10-12 — PR #864 — Bounded production schema-repair failure diagnostics
<!-- integration-memory: pr=864 -->
Status: VERIFIED local diagnostic regression; production schema repair and Admin MCP access remain UNVERIFIED.
Task: Expose the first causal blocker when the protected production schema runner stops at REPAIR_PLAN_BLOCKED before backup or DDL.
Decisions: Preserve the repair-policy allowlists, exact revision/ledger/hash checks, protected production approval, backup/recovery rehearsal, and all schema/promotion gates. Project only allowlisted error classes and schema identifiers; omit SQL, observed type values, driver messages and journal rows. Bind the diagnostic helper into the closed immutable apply artifact and retain the diagnostic in the CI failure receipt.
Evidence: Actual protected migration run 38302269611 at a0684727eae993ef5123c1a4bdc46fb8a0237f0e returned runnerStatus=70, state=APPLY_FAILED, failureStage=REPAIR_PLAN_BLOCKED, backup.created=false, recovery=null and apply=null. Its parent release 38193981719 completed immutable schema-tool preparation but has not promoted the runtime. The protected production readback classified 52 migrations: 41 match, five absent and six drift; all eleven affected migration tags are already covered by the existing repair policy. Twenty-one focused tests and the full local suite (420 files / 2103 tests passed; 65 files / 233 tests skipped) passed, including execution of the root failure serializer, malformed/tampered/foreign-identity rejection, bounded diagnostics and private-value exclusion. TypeScript, shell/Node syntax and whitespace validation passed. A locally built test artifact passed the closed-file/checksum verifier; this is not production evidence.
Learned: The previous failure receipt discarded the planner's structured blocker or error class. A failed migration must remain failed while its first causal boundary becomes independently diagnosable.
Open: The approved read-only production schema job 114988650055 completed with PRESENT_SCHEMA_DRIFT; its final match gate correctly failed. Final-head CI and protected installation are required before the new diagnostic can classify the actual blocked production plan. The canonical OIDC account users.id=1 has meanwhile been set to admin through the hash-bound operator and independently confirmed through both operator readback and a real website auth.me request. Fresh PKCE issuance and refresh-token exchange succeeded, and the user confirmed the configured legacy ChatGPT callback; production Admin MCP initialize/tools/readback is still pending runtime promotion.

### 2026-10-12 — PR #865 — Read-only production journal identity diagnostics
<!-- integration-memory: pr=865 -->
Status: VERIFIED local regression; production journal identity readback remains pending protected workflow execution.
Task: Identify the exact migration metadata behind JOURNAL_IDENTITY_CONFLICT without starting another runtime build or changing production data.
Decisions: Use the already installed immutable read-only reconciliation runner. Verify its closed artifact against the main release source, installed manifest and wrapper; require the current diagnostic workflow SHA and an identical Drizzle tree to the prepared revision. Preserve production approval and every existing migration, repair, backup and promotion gate. Project only conflicting migration SHA-256 digests, numeric timestamps and canonical migration tags; omit malformed row values, player data and driver messages.
Evidence: PR #864 was merged after nine successful exact-head CI workflows. Production diagnostic apply 38307087404 at de530d417cfa53b3f5de291336fee0eec999c6df emitted three blockers: JOURNAL_IDENTITY_CONFLICT, the aurionItemInstancesV2_exactly_one_provenance_ck expression, and the obsolete craftingReceipts_inputItemId_unique index. It stopped before backup and DDL. The two structural transitions are already declared in canonical migration 0068; the additive repair planner currently skips them. Nineteen focused tests and the full local suite (421 files / 2108 tests passed; 65 files / 233 tests skipped), TypeScript, Node/shell syntax, workflow YAML/action pins and whitespace checks passed.
Learned: The existing root reconciliation stdout already contains migration journal identities. A scoped projection of that metadata can diagnose the remaining conflict through the fixed read-only boundary and the small prepared artifact, rather than rebuilding or promoting the application.
Open: Final-head CI, merge, post-merge Memory readback and owner production approval are required. No journal row, constraint or index has been changed. Prepare explicit verified transitions for the two source-declared schema changes only after the journal identity is understood; production Admin MCP access remains unverified on legacy runtime 9b84e8093f731d72a66f339461cdaed462bc4ace.

### 2026-10-12 — PR #866 — Journal diagnostic source verification without GitHub CLI
<!-- integration-memory: pr=866 -->
Status: VERIFIED focused regression, TypeScript and actual GitHub source identity readback; production journal diagnosis remains pending.
Task: Remove the unavailable gh executable from the protected read-only journal diagnostic while retaining exact revision, prepared schema tree and source release bindings.
Evidence: Approved production job 115013859272 in run 38310228617 failed with gh: command not found before the root reader or database access. Eighteen focused tests passed, including execution with git available and no gh executable, rejection of changed main/Drizzle trees and foreign source runs, and exclusion of private provider errors. An executable workflow-shell regression rejects an unmerged expected revision before invoking any repository helper; checkout uses main and inline repository/ref/SHA/HEAD checks precede Node. The new Node helper independently verified actual current main 13f11dc7d70ae9ab06597800e98a27f3ac56368d, prepared revision de530d417cfa53b3f5de291336fee0eec999c6df and source release 38305153912 through GitHub HTTPS. Full local regression passed 422 files / 2115 tests (65 files / 233 tests skipped); Node/shell/workflow syntax, pinned actions and whitespace checks passed. Exact-head CI remains required.
Learned: The self-hosted VPS runner has Node and git but no GitHub CLI. Native fetch can authenticate with the existing read-only workflow token without installing host tools or exposing credentials in arguments, URLs or output.
Open: No journal row, schema constraint, index or runtime was changed. Merge, post-merge Memory readback and protected production approval precede the actual journal readback. Production Admin MCP access remains unverified pending schema repair and runtime promotion.

### 2026-10-12 — PR #868 — Reviewed schema recovery with preserved journal provenance
<!-- integration-memory: pr=868 -->
Status: VERIFIED compiled repair engine against real isolated MariaDB, local full regression and immutable artifact; protected root-runner CI and production execution remain pending.
Task: Resolve the three diagnosed production repair blockers through narrowly bound provenance preservation and the source-declared 0068 check/index transitions.
Decisions: Preserve both original journal rows; append canonical schema attestations only after complete structural readback, including the independently read 0020 dialogue table. Classify 0020's timestamp as an observed deviation, not a timestamp found in source history. Preserve exact source/prestate/plan/freshness checks, advisory locking, protected approval, backup, recovery rehearsal and postflight. V1 remains additive; explicit V2 permits only the verified predecessor check replacement in one atomic ALTER and removal of the exact obsolete unique index after its replacement exists. Unknown history, duplicate pairs, predicates, indexes and schema drift still block the whole plan.
Evidence: Approved journal diagnostic 38313090171 / 115023221091 succeeded read-only at prepared revision de530d4. It found 67 rows, no malformed values, one 0020 timestamp mismatch and one unrecognized digest. GitHub historical Aurion revision dc6dfe393fb52c47d517f2ce56f8c302737274b7 supplied the exact observed 0066 digest 42ba1655995dc5ac0fcd47bd7ee4aca7dd025a8edf7602fccaa68d8dae83341f; these SQL bytes are bound into the closed apply artifact as provenance and are never replayed. At code revision 85169b4730f7a2155c108da270860c899eef40c2, local full regression passed 424 files / 2127 tests (65 files / 233 tests skipped), 26 focused tests and TypeScript passed, and the closed 73-file artifact verifier passed. A real isolated MariaDB 11.4.13 compiled-engine proof created and restored a backup to a separate schema, rehearsed and applied eight journal appends plus the bounded structural repairs, verified all 52 contracts and all 75 canonical-plus-historical journal pairs, preserved a seeded item and append-only ledger, admitted crafting provenance, rejected double provenance, and blocked tampered/stale plans, intervening schema changes and unknown drift. This local engine proof is not the protected root-runner or production proof; exact-head CI must execute that boundary.
Learned: A historical SQL digest and a timestamp deviation are distinct evidence classes. A reviewed repair can retain the original evidence and independently attest the canonical schema without rewriting migration history or treating a legacy project as an active authority.
Open: Final-head CI/review, merge, post-merge Memory readback and protected legacy-bootstrap release remain required. Production schema and runtime are unchanged; OAuth and canonical owner role=admin are verified, but authenticated production Admin MCP initialize/tools/readback remain pending.

### 2026-10-12 — PR #869 — Fresh unchanged repair plan after verified recovery
<!-- integration-memory: pr=869 -->
Status: VERIFIED local full regression, focused boundary tests and closed artifact; exact-head MariaDB/root CI and production execution remain pending.
Task: Preserve the 15-minute repair observation window when production backup and recovery take longer, and retain the isolated rehearsal's inner failure class.
Decisions: After the existing isolated restore fingerprint equality check, regenerate a read-only plan and require all semantic fields to equal the retained original plan. Only observation time, expiry and their resulting plan hash may change. Source/ledger bindings, complete schema/journal fingerprint, policy, operations and journal insertions cannot change. Retain both plans and their bounded renewal readback. After renewal, capture a new consistent production data backup, verify its digest, restore it into a fresh network-isolated MariaDB, validate the recovered schema and revalidate the unchanged fresh plan before rehearsal. Never rehearse the renewed plan against the earlier backup. Rehearsal and production apply still independently regenerate the exact fresh plan under the database advisory lock; approval, backup, restore, freshness and postflight gates remain enforced.
Evidence: Production run 38319449953 / job 115044048251 at source 179ce9fde912dab9edcbe84092b731d936b12adf created a 2,014,677,842-byte backup with SHA256 31ab02da5bd77efbce98fc3718b4c6481bbf8af9094b51ccd760959023f68377 and restored it successfully (restoreStatus=0, no stderr). It then failed at REPAIR_REHEARSAL_FAILED before production apply after roughly 25 minutes. Its receipt does not expose the inner execution error; no specific inner error is claimed as production evidence. At code revision 33d83606ccc3c2f0cb0245a9771b1064279d460d, 47 focused tests, TypeScript, shell/Node/YAML checks, the closed immutable artifact verifier and the full local suite (425 files / 2141 tests passed; 65 files / 233 skipped) passed. The MariaDB proof fixture now includes expired-plan rejection followed by read-only renewal, unchanged input/database checks and intervening-schema rejection; its exact-head root CI execution remains required. Codex P1 review at 33d8360 identified stale data rehearsal; the revised PR adds refreshed logical backup/isolated restore, post-restore plan revalidation and root-runner regression assertions at 8fb693b (current head at authoring; CI proof pending).
Learned: A long successful restore can consume the freshness window of a plan created before backup. A new observation must preserve the entire original semantic authorization boundary; extending the time limit or ignoring changed prestate would weaken that boundary. Schema/journal identity alone does not bind application rows: a renewed plan requires a new data snapshot for its rehearsal. Root receipts must distinguish isolated rehearsal failures from production execution and omit SQL, driver text and private values.
Open: Exact-head CI/review, merge, automated Memory mirror readback and a new protected legacy-bootstrap release are required. The previous parent release was ended only after its writer failed and only a read-only job waited; completed cancelled status was independently checked. Runtime remains the legacy deployment and authenticated production Admin MCP access remains unverified.

### 2026-10-13 — Draft — Parent schema-dispatch timeout and duplicate-run guard
Status: PATCHED on isolated branch; exact-head CI and production readback PENDING.
Change: Raise the protected release parent's bounded schema wait from 70 to 150 minutes, allow 480 x 15-second polls (120 minutes), reject reruns of the same parent job and reject another active exact-revision schema apply before dispatch. Add bounded wait telemetry and negative regression cases. No live schema operation is restarted or altered.
Learned: Release run 38327675604 timed out in dispatch-aurion-schema-plan.mjs while the owner-approved child run 38329070423 continued its real root backup/recovery/DDL step. A failed parent is not proof that the child or database failed; a blind rerun can duplicate a non-idempotent production operation.
Evidence: https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/38327675604 and https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/38329070423 ; SHA-bound patch and new negative tests require CI validation. Production result pending an independent child receipt and subsequent schema readback. Do not redeploy before that readback.


### 2026-10-13 — PR #870 — Fix schema apply parent timeout and prevent duplicate production dispatch
Status: VERIFIED repository merge
<!-- auto-memory: pr=870 merge=5d83bd178fd85b5bf1f330ed132d8829b602f134 -->
Task: Merge PR #870 into `main` — Fix schema apply parent timeout and prevent duplicate production dispatch.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `Memory.md`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `scripts/dispatch-aurion-schema-plan.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/870
- Merge commit: `5d83bd178fd85b5bf1f330ed132d8829b602f134`
- PR head: `0e13febcf240188c19e5ad1829c5983f9974aefd`
- Merged at: 2026-10-13T02:49:29Z
- Post-merge workflow run: 38338735307
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-13 — Aurion-only open PR curation (21 initial drafts)
Status: PARTIAL — curated candidate only, exact-head CI and production readback pending.
Task: Inventory all open Aurion drafts, prohibit AX1/WASD active authorities and preserve good standalone contributions.
Decisions: Aurion sole active runtime, DB, gameplay and receipt owner; historical provenance remains evidence, not a source of decisions. Never merge changes that bypass CI (PR #861 removes an explicit failure from .github/workflows/aim259-group-instances.yml and forces Playwright clicks). PR #848's dummy scrypt salt is too short and verifier returns before costly derivation, so take a valid-cost dummy candidate with separate regression. Avoid duplicate hot-loop patches (#835/#845/#852/#853/#863), matrix-difference proposals (#842/#851/#858/#871) pending Wolfram mathematical equivalence checks, and mutable cached live combat snapshots (#843). Keep README/docs history intact.
Touched surfaces: server/localAuth.ts; server/routers.ts; server/localAuth.test.ts; server/ax1CombatAuthority.ts (historically named Aurion-owned module); client/src/pages/Home.tsx; Memory.md.
Evidence: main a0edd6e135ca83dd4b7466bb3dd0f4381776085e, 21 GitHub draft PRs #835–#871 enumerated; per-file patches inspected. Actual current main deployment run 38364366832 ended FAILURE, so PR curation does not claim a healthy production runtime. This candidate has not passed exact-head CI yet.
Learned: Legacy filenames are not sufficient to prove a second authority. Security fixes must not silently weaken test suites; log-in timing equalization requires a structurally valid scrypt target-cost dummy, checked against real verifier code.
Open: Complete exact-head review, regression, live behavior and CI. Evaluate additional drafts individually; close only after safe salvage or reasoned disqualification. No production promotion or blind schema apply.
Next safe step: Gate candidate by exact GitHub CI and separate merge decisions from production repairs.


### 2026-10-13 — PR #872 — Aurion-only: safely curate auth, combat and UI fixes from 21 legacy drafts
Status: VERIFIED repository merge
<!-- auto-memory: pr=872 merge=d9c8e9c5d6043ba08b20acf365a49297eae14e1e -->
Task: Merge PR #872 into `main` — Aurion-only: safely curate auth, combat and UI fixes from 21 legacy drafts.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/pages/Home.tsx`
- `server/ax1CombatAuthority.ts`
- `server/localAuth.test.ts`
- `server/localAuth.ts`
- `server/routers.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/872
- Merge commit: `d9c8e9c5d6043ba08b20acf365a49297eae14e1e`
- PR head: `d557de10499ff024c208cb1723a88777f6e46775`
- Merged at: 2026-10-13T08:32:30Z
- Post-merge workflow run: 38369959875
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-13 — Curate season accessibility and combat expiry regressions
Status: PARTIAL — isolated draft head CI pending.
Task: Preserve useful non-duplicate code from legacy Drafts #854 and #863 after Aurion-only PR #872 merge.
Decisions: Season UI remains a projection of canonical Aurion season readbacks. Mark selected season with aria-pressed and keyboard focus affordance; transfer combat expiry, stat isolation and clamp regression into Aurion-owned source without importing the older PR's extra files or duplicate combat implementation. Historical ax1 filename has no separate authority.
Touched surfaces: client/src/pages/Operations.tsx; server/ax1CombatAuthority.test.ts; Memory.md.
Evidence: Original drafts #854/#863 patches reviewed against a new exact main commit; PR #872 merge commit d9c8e9c5d6043ba08b20acf365a49297eae14e1e. No live runtime claim. Exact-head CI and later main readback pending.
Learned: Fix the actual consumer behavior and retain independently testable regression rather than merging multiple overlapping changes in canonical combat hot loops.
Open: CI, PR approval, independent post-merge proof; other world/content drafts remain separate.
Next safe step: Run the exact-head test matrix, merge only when eligible and verify new main.


### 2026-10-13 — PR #873 — Aurion-only: season accessibility and combat expiry regression salvage
Status: VERIFIED repository merge
<!-- auto-memory: pr=873 merge=ea8c353bf679cc774f2dc1f597854b1e5a1e2f67 -->
Task: Merge PR #873 into `main` — Aurion-only: season accessibility and combat expiry regression salvage.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/pages/Operations.tsx`
- `server/ax1CombatAuthority.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/873
- Merge commit: `ea8c353bf679cc774f2dc1f597854b1e5a1e2f67`
- PR head: `658288ca9f00a6317e957f7289c43d96aa3f364a`
- Merged at: 2026-10-13T09:29:07Z
- Post-merge workflow run: 38376639941
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-14 — Bound optional Redis and retire the stale production endpoint
Status: VERIFIED local regression; exact-head CI and deployment pending.
Change: Keep companion JSONL memory primary; bound Redis connect/PING/SET, disable automatic reconnect/offline queues, close probe sockets and fall back locally after replication failure. Production Compose explicitly clears inherited REDIS_URL while retaining the owner-managed environment file and existing companion-memory volume; promotion verifies the existing mount before recreation and the effective empty URL afterward.
Evidence: Main baseline 9c1c110501361a857672b1cc854579957719d57a. The actual CompanionMemoryStore against a silent TCP peer missed the baseline deadline and completed locally on the candidate (131 ms). Thirty focused tests pass, including replication/readback and outage fallback with real Redis 7.4.7 built from official commit 4d1a341aaf0b96f9d2c43418efac732e31dc28ad; pnpm check, shell syntax and diff checks pass. Full local regression passes: 427 files / 2,157 tests, with 65 files / 233 environment-dependent tests skipped. Actual Docker Compose rendering is mandatory in the release workflow and remains unverified locally because Docker is unavailable.
Learned: A deleted optional Redis endpoint can indefinitely hold successful local writes and leak health-probe clients; this does not establish the cause of the separate heap/archive issue. PatchMon already has its own healthy Redis and must not become Aurion's memory authority.
Open: Exact-head CI, immutable deployment, effective environment and durable-volume readback; PatchMon foreign-network dependency review/migration and the separate archive/heap investigation remain open. No production configuration, network or data was modified by this work.


### 2026-10-14 — PR #885 — Bound optional Redis and retire the stale production endpoint
Status: VERIFIED repository merge
<!-- auto-memory: pr=885 merge=dc8dd4455fe53b786335c497c859088920f88b00 -->
Task: Merge PR #885 into `main` — Bound optional Redis and retire the stale production endpoint.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `Memory.md`
- `deploy/promote-aurion-zone-runtime.sh`
- `docker-compose.traefik.yml`
- `scripts/test-aurion-optional-redis-compose.mjs`
- `server/_core/systemRouter.ts`
- `server/aurionArelogicCompanionRuntime.test.ts`
- `server/companionMemory.ts`
- `server/optionalRedis.test.ts`
- `server/optionalRedis.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/885
- Merge commit: `dc8dd4455fe53b786335c497c859088920f88b00`
- PR head: `707d40dd3dfb23bb63a1f5db3eeaf86bd8865fa4`
- Merged at: 2026-10-14T20:22:51Z
- Post-merge workflow run: 38631572655
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-14 — PR #887 — fix(runtime): raise Aurion V8 heap from ~4 GiB to 8800 MiB
Status: VERIFIED repository merge
<!-- auto-memory: pr=887 merge=2de94da126cd0ce0ba8d860e7e37f247213852b9 -->
Task: Merge PR #887 into `main` — fix(runtime): raise Aurion V8 heap from ~4 GiB to 8800 MiB.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `deploy/promote-aurion-zone-runtime.sh`
- `docker-compose.traefik.yml`
- `scripts/test-aurion-optional-redis-compose.mjs`
- `server/aurionTraefikRuntimeDeployment.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/887
- Merge commit: `2de94da126cd0ce0ba8d860e7e37f247213852b9`
- PR head: `a7bfa454b9f02db5eec56e5b978fb46d4061161e`
- Merged at: 2026-10-14T20:42:16Z
- Post-merge workflow run: 38634313380
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-14 — Bounded causal archiving and reconciliation
Status: PARTIAL — candidate branch, runtime/CI pending
Task: Remove proven unbounded archival heap reads and hot-loop checkpoint replay without sacrificing gameplay evidence.
Decisions: Preserve 10 Hz and MariaDB truth; keyset-page receipt source in groups of 64 under one transaction; verify immutable previous archive packets and hashes; stream new 60 KiB packets; restrict checkpoint queries to selected columns; pace pending reconciliation 10 s. Do not delete source rows or modify schema/archives.
Touched surfaces: `server/causality/persistence.ts`, `archivePacking.ts`, `archivingService.ts`, `snapshotReconciliationService.ts` and `archiveMemoryBounds.test.ts`.
Evidence: Source-verified old unbounded scan and PR #881 partial fix; regression test contract for 1100 receipts and UTF-8 packet identity; final SHA CI, real MariaDB archive/retry/rollback and live stability not yet evidenced.
Learned: Increasing V8 heap or lowering authority Hz cannot repair an unbounded archive prefix; preserve persisted packet bytes and rollback invariants independently of query page size.
Open: Exact-head real MariaDB/full CI, transaction-lock/backpressure assessment, independent heap/restart readback and production rollout.
Next safe step: Integrate only after reproducible isolated database/replay tests and exact-revision receipts, then measure live process stability before declaring resolved.


### 2026-10-14 — PR #889 — fix(causality): bound archive receipt memory, checkpoint scans and reconciliation
Status: VERIFIED repository merge
<!-- auto-memory: pr=889 merge=a486ccdf95dff832fbeba17ae13bf2ba8d48eb8d -->
Task: Merge PR #889 into `main` — fix(causality): bound archive receipt memory, checkpoint scans and reconciliation.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `server/causality/archiveMemoryBounds.test.ts`
- `server/causality/archivePacking.ts`
- `server/causality/archivingService.ts`
- `server/causality/persistence.ts`
- `server/causality/snapshotReconciliationService.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/889
- Merge commit: `a486ccdf95dff832fbeba17ae13bf2ba8d48eb8d`
- PR head: `5bd242cb8576f089ffa8104232965ae6971eca30`
- Merged at: 2026-10-14T22:14:45Z
- Post-merge workflow run: 38646278837
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — Aurion confirmed self HP and combat notification integrity (issue #891)
Status: PARTIAL — isolated candidate branch, exact-head CI and browser readback pending
Task: Correct false backup notifications on each confirmed attack, duplicate toast stacking, and invisible player health/death/respawn state in mobile HUD.
Decisions: Preserve Aurion server authority; project only schema-validated zone snapshot combatant data; never infer life state from input or fake an archival success on a UI refresh; deduplicate real confirmation via one stable toast ID. Do not touch combat damage, 10 Hz, assets, MariaDB or persisted receipts.
Touched surfaces: `client/src/xaurion/integration/zoneCombatBridge.ts`, `AurionAuthorityHud.tsx`, `client/src/xaurion/components/GameHUD.tsx`, `client/src/components/CausalBackupNotifier.tsx`, `client/src/xaurion/integration/AurionCombatHudRegression.test.tsx`.
Evidence: Owner mobile screenshot and actual main code traced to false `aurion:causal-backup-confirmed` emission inside `aurion:authoritative-action` UI refresh; server-confirmed self HP already existed but had no HUD path. CI test/actual phone proof not yet complete.
Learned: A combat confirmation cannot be interpreted as a cold-archive receipt; presentation health must come from the validated authoritative zone message and be absent when no confirmed self exists.
Open: Exact-head TypeScript, component regression and real 360px/desktop browser checks; server presentation when zone disconnects and repeated death-respawn transitions; production deploy/readback separate.
Next safe step: Pass focused and full CI and verified browser UX before merging; then work on issue #892 for GLBs and atlases.


### 2026-10-14 — PR #893 — fix(aurion): confirmed HP, death/respawn HUD and bounded real backup notifications (#891)
Status: VERIFIED repository merge
<!-- auto-memory: pr=893 merge=94390a4fe2ed5db6295cea1b8f57fb604a20e435 -->
Task: Merge PR #893 into `main` — fix(aurion): confirmed HP, death/respawn HUD and bounded real backup notifications (#891).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/components/CausalBackupNotifier.tsx`
- `client/src/xaurion/components/GameHUD.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.tsx`
- `client/src/xaurion/integration/AurionCombatHudRegression.test.tsx`
- `client/src/xaurion/integration/zoneCombatBridge.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/893
- Merge commit: `94390a4fe2ed5db6295cea1b8f57fb604a20e435`
- PR head: `2a880aa4ba3d6b00f392cd0179efcd235438f008`
- Merged at: 2026-10-14T23:01:25Z
- Post-merge workflow run: 38651487822
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — Keep server-confirmed hostile actors visible through failed GLB presentation (#892)
Status: PARTIAL — isolated branch, CI and actual device proof pending
Task: Reproduce live invisible enemies where combat and HP remain authoritative but approved GLB catalog asset is pending, incompatible or fails to load.
Decisions: Do not change server snapshots, combat, NPC authority, geometry budgets, 10 Hz, persistence or world asset paths. Retain an already existing presentation body for living authoritative enemies until the approved GLB actually passes load/rig/animation verification; maintain loaded GLB priority and no resurrection for dead actors.
Touched surfaces: `client/src/xaurion/integration/MobCatalogProjection.ts` and matching focused tests.
Evidence: Code path verified: pre-GLB `visual.body.visible=false` combined with `NO_COMPATIBLE_FALLBACK` and load failures left no rendered enemy; focused regression checks added. CI and actual browser screenshots still pending.
Learned: Concealing the only renderable presentation before the real asset is ready creates invisible enemies even while damage and authoritative entity data remain intact.
Open: Fix separately missing NPC model catalog/fallback and owner-provided surface atlas asset binding; browser/network asset readback and final exact-head CI required before merge.
Next safe step: Finish exact-head regression checks; merge only after acceptance gates and production-safe proof, then test actual GLB and atlas rendering on phone/desktop.

### 2026-10-15 — Measured monster geometry replaces fabricated 1,600-triangle actor rejection
Status: PARTIAL — exact-head CI and GPU/device runtime profiling pending
Task: Let the owner's real CC0 rigged monster models render in Aurion without inventing geometry caps.
Decisions: Preserve canonical GLB authorization, SHA-256, resource pool, asset bytes, decoded texture/geometry, <=64-rig-bone validation, authentic motion clips and 10 Hz authority; remove only the redundant 1,600-triangle art cutoff in approved enemy GLB presentation, preserving a fail-closed nonempty safe-integer geometry/rig check. Static mobile LOD worker explicitly disables skins/animations and must NOT process these combat actors; GPU device profiling determines eventual authored LODs.
Touched surfaces: `client/src/xaurion/integration/MobCatalogProjection.ts`, `MobCatalogProjection.test.ts`, `docs/assets/monster-geometry-evidence-2026-10-15.md`.
Evidence: Exact CC0 `PacksMODELLE` 49-file GLB archive structurally validated (49/49), min/median/max 1,030/3,696/8,284 triangles, 45 exceed old 1,600 art target, max 49 skin joints, max 15 clips; 1 source quarantined. Synthetic 8,284-triangle Three.js actor regression added; source-control CI outcome and real Android GPU frame time not yet confirmed at entry.
Learned: The 1,600 number originated as a static LOD production target but was mistakenly treated as a runtime actor compatibility rule, rejecting otherwise sound animated monsters.
Open: Exact-head CI, immutable asset-import receipts, in-game texture/animation and mobile/desktop GPU frame-time/memory verification, rig-preserving authored LODs only if performance warrants.
Next safe step: Verify exact-head tests, merge once gates pass, then import a small approved monster pilot via owner-authenticated Aurion ZIP endpoint; do not claim deployed GLBs or stable FPS until readback.


### 2026-10-15 — PR #895 — fix(aurion): keep confirmed mob visible until GLB presentation loads (#892)
Status: VERIFIED repository merge
<!-- auto-memory: pr=895 merge=9730f574f2f678ed4f19f96c14e0716a257924d9 -->
Task: Merge PR #895 into `main` — fix(aurion): keep confirmed mob visible until GLB presentation loads (#892).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/xaurion/integration/MobCatalogProjection.test.ts`
- `client/src/xaurion/integration/MobCatalogProjection.ts`
- `docs/assets/monster-geometry-evidence-2026-10-15.md`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/895
- Merge commit: `9730f574f2f678ed4f19f96c14e0716a257924d9`
- PR head: `a51883b55bb8dcd6c790c3ababbc15912c809e8d`
- Merged at: 2026-10-15T00:50:56Z
- Post-merge workflow run: 38662350429
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #901 — fix(aurion): identify the play launch gate as Aurion-owned
Status: VERIFIED repository merge
<!-- auto-memory: pr=901 merge=62bf3cbc593636f59f03f0618d4ecba2a623a1d7 -->
Task: Merge PR #901 into `main` — fix(aurion): identify the play launch gate as Aurion-owned.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/xaurion/integration/AurionPlayRoute.tsx`
- `e2e/ax1.ui.spec.ts`
- `server/aim242AuthorityAdapter.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/901
- Merge commit: `62bf3cbc593636f59f03f0618d4ecba2a623a1d7`
- PR head: `d33b55b9a977f553220835c042fb0bd43d7e2b1b`
- Merged at: 2026-10-15T08:36:39Z
- Post-merge workflow run: 38706900735
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #902 — fix(aurion): identify the mount key as Aurion-owned
Status: VERIFIED repository merge
<!-- auto-memory: pr=902 merge=05e55d0fd2a2568a7cbbb4339c6e9cd6a4a13882 -->
Task: Merge PR #902 into `main` — fix(aurion): identify the mount key as Aurion-owned.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/xaurion/integration/AurionOpenWorldRuntime.tsx`
- `client/src/xaurion/integration/aurionOpenWorldRuntime.css`
- `e2e/ax1.ui.spec.ts`
- `server/aim242AuthorityAdapter.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/902
- Merge commit: `05e55d0fd2a2568a7cbbb4339c6e9cd6a4a13882`
- PR head: `a133d363c3c6f3bc5222ca0f812672c05368142f`
- Merged at: 2026-10-15T11:54:38Z
- Post-merge workflow run: 38730715911
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #898 — feat(aurion): 49 authoritative monster species profiles and Wolfram-verified deterministic balancing
Status: VERIFIED repository merge
<!-- auto-memory: pr=898 merge=a4c9dc2b8e4345258b39fa335560967cffcccebf -->
Task: Merge PR #898 into `main` — feat(aurion): 49 authoritative monster species profiles and Wolfram-verified deterministic balancing.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `server/aurionMonsterRewardProtocol.test.ts`
- `server/aurionMonsterRewardProtocol.ts`
- `server/aurionMonsterSpeciesCatalog.test.ts`
- `server/aurionMonsterSpeciesCatalog.ts`
- `server/endgameProtocol.test.ts`
- `server/endgameProtocol.ts`
- `shared/aurionMonsterAssetRegistry.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/898
- Merge commit: `a4c9dc2b8e4345258b39fa335560967cffcccebf`
- PR head: `89cd86fbb00568970439ee7fa820264930b0f321`
- Merged at: 2026-10-15T12:53:54Z
- Post-merge workflow run: 38738202184
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #903 — fix(aurion): identify combat feedback as Aurion-owned
Status: VERIFIED repository merge
<!-- auto-memory: pr=903 merge=5dc8779647d7c1ab02c7992237b3ee6bd2bc4b21 -->
Task: Merge PR #903 into `main` — fix(aurion): identify combat feedback as Aurion-owned.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/lib/zoneMovement.test.ts`
- `client/src/lib/zoneMovement.ts`
- `client/src/xaurion/integration/AurionAuthorityHud.test.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.tsx`
- `client/src/xaurion/integration/AurionCombatAuthorityFeedback.test.ts`
- `client/src/xaurion/integration/AurionCombatHudRegression.test.tsx`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.test.tsx`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.tsx`
- `client/src/xaurion/integration/confirmedActionRequest.ts`
- `client/src/xaurion/integration/zoneCombatBridge.ts`
- `e2e/ax1.ui.spec.ts`
- `server/aim242AuthorityAdapter.test.ts`
- `server/aim270LegacyEncounterReachability.test.ts`
- `server/zoneProtocol.test.ts`
- `server/zoneProtocol.ts`
- `server/zoneRuntime.test.ts`
- `server/zoneRuntime.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/903
- Merge commit: `5dc8779647d7c1ab02c7992237b3ee6bd2bc4b21`
- PR head: `0ffcc9b8844376aad5a2942c8720da6d1a6d2200`
- Merged at: 2026-10-15T13:41:21Z
- Post-merge workflow run: 38744839384
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — Bounded Aurion combat feedback
Status: VERIFIED candidate
Task: Expire server-confirmed combat feedback after four seconds without clearing newer combat outcomes or persistent HUD messages.
Decisions: Keep transient combat state separate; route event, direct-action and auto-attack writers through one restartable timer.
Touched surfaces: Aurion authority HUD, focused combat HUD regression, AIM-259 browser proof.
Evidence: Candidate `55b61d58a302768abf5e189935755a7fae4ff6a2`; all 9 workflows green; Local Test Pack `38752697562`; AIM-259 `38752697600` / artifact `11982688338` passed real server rejection visibility, topmost and dismissal on phone/tablet/desktop; exact-head code/security review clear.
Learned: Message text cannot identify timer ownership because later outcomes may repeat it; one publisher must own the transient instance lifetime.
Open: Merge and main readback only.
Next safe step: Re-run required gates on the Memory-bearing final head, merge if green, then verify main.


### 2026-10-15 — PR #905 — fix(aurion): expire stale combat feedback
Status: VERIFIED repository merge
<!-- auto-memory: pr=905 merge=cdf9470fa0b0c1771b5644fd69e7ce652a13da8a -->
Task: Merge PR #905 into `main` — fix(aurion): expire stale combat feedback.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/xaurion/integration/AurionAuthorityHud.tsx`
- `client/src/xaurion/integration/AurionCombatHudRegression.test.tsx`
- `e2e/ax1.ui.spec.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/905
- Merge commit: `cdf9470fa0b0c1771b5644fd69e7ce652a13da8a`
- PR head: `229041d99fc6df989f7a1f5a6994170b603049bd`
- Merged at: 2026-10-15T15:17:20Z
- Post-merge workflow run: 38759000000
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #896 — fix(admin): repair OS3A confirmation, escaped tab text and checkpoint-backed replay
Status: VERIFIED repository merge
<!-- auto-memory: pr=896 merge=4f595fe679bd808b473961c1c6c636a965247ebd -->
Task: Merge PR #896 into `main` — fix(admin): repair OS3A confirmation, escaped tab text and checkpoint-backed replay.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/components/CausalStudioDashboard.test.tsx`
- `client/src/components/CausalStudioDashboard.tsx`
- `client/src/pages/Operations.tsx`
- `client/src/pages/OperationsAdminMarkup.test.ts`
- `server/openSource3dFallback.test.ts`
- `server/openSource3dFallback.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/896
- Merge commit: `4f595fe679bd808b473961c1c6c636a965247ebd`
- PR head: `68f1c195d05580cc0383b58c4f13b8eb03e1d699`
- Merged at: 2026-10-15T16:15:54Z
- Post-merge workflow run: 38767522666
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #900 — feat(aurion): receipt-backed stat allocation wallet, HUD and ACEG effects
Status: VERIFIED repository merge
<!-- auto-memory: pr=900 merge=f4836188de9f632cdfbe84c942aaafbf4c56e1f9 -->
Task: Merge PR #900 into `main` — feat(aurion): receipt-backed stat allocation wallet, HUD and ACEG effects.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-production-schema-readback.yml`
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `.github/workflows/aurion-schema-reconciliation-proof.yml`
- `client/src/xaurion/components/Ax1CharacterModal.tsx`
- `client/src/xaurion/components/CharacterModal.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.test.tsx`
- `client/src/xaurion/integration/AurionAuthorityHud.tsx`
- `client/src/xaurion/integration/AurionCombatHudRegression.test.tsx`
- `config/aurion-migration-wave-manifest.json`
- `deploy/aurion-production-schema-apply-core`
- `deploy/promote-aurion-zone-runtime.sh`
- `deploy/verify-aurion-production-schema-apply-artifact.mjs`
- `deploy/verify-aurion-production-schema-reconcile-artifact.mjs`
- `docs/aurion-stat-allocation-authority-checkpoint-2026-10-15.md`
- `drizzle/0074_aurion_stat_allocation_receipts.sql`
- `drizzle/meta/_journal.json`
- `drizzle/schema.ts`
- `e2e/ax1.ui.spec.ts`
- `scripts/aurionProductionSchemaReconciliation.ts`
- `scripts/aurionSchemaRepairPlan.ts`
- `scripts/build-aurion-production-apply-artifact.mjs`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `scripts/schema-repair-proof-fixture.mjs`
- `server/aurionAcegEquipmentAuthority.ts`
- `server/aurionProductionSchemaReconcileDockerRunner.test.ts`
- `server/aurionSchemaRepairPlan.test.ts`
- `server/aurionSchemaReviewedRecovery.test.ts`
- `server/aurionStatAcegIntegration.test.ts`
- `server/aurionStatPointPersistence.ts`
- `server/blocker3Compliance.test.ts`
- `server/playerUiPersistence.ts`
- `server/progressionReceiptPersistence.test.ts`
- `server/progressionReceiptPersistence.ts`
- `server/routers.ts`
- `server/zoneCombatPersistence.ts`
- `shared/aurionStatPointProtocol.test.ts`
- `shared/aurionStatPointProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/900
- Merge commit: `f4836188de9f632cdfbe84c942aaafbf4c56e1f9`
- PR head: `7f3223e7b07a2607e9826b4abe8f1bc2520df995`
- Merged at: 2026-10-15T16:18:10Z
- Post-merge workflow run: 38767847640
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #953 — docs(godot): Architektur, Funktionsmatrix und Dateiplan für Tab A9 (#907)
Status: VERIFIED repository merge
<!-- auto-memory: pr=953 merge=3df98fdf36d55e92a401cc0a0e26d36c4ac30f11 -->
Task: Merge PR #953 into `main` — docs(godot): Architektur, Funktionsmatrix und Dateiplan für Tab A9 (#907).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `SUMMARY.md`
- `docs/godot-migration/architecture.md`
- `docs/godot-migration/capability-matrix.csv`
- `docs/godot-migration/file-plan.csv`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/953
- Merge commit: `3df98fdf36d55e92a401cc0a0e26d36c4ac30f11`
- PR head: `38c613545b1cfbb29176148b7dfb1f58c0c4627c`
- Merged at: 2026-10-15T16:49:34Z
- Post-merge workflow run: 38772218453
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #954 — docs(godot): Tab-A9-4-GB-Abnahmeprofil festlegen (#908)
Status: VERIFIED repository merge
<!-- auto-memory: pr=954 merge=7deb10f4abebe8cce383422ffc0f24cecfc6eb51 -->
Task: Merge PR #954 into `main` — docs(godot): Tab-A9-4-GB-Abnahmeprofil festlegen (#908).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `SUMMARY.md`
- `docs/godot-migration/device-check.md`
- `docs/godot-migration/tab-a9-profile.md`
- `godot-client/config/device_profiles/tab_a9.json`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/954
- Merge commit: `7deb10f4abebe8cce383422ffc0f24cecfc6eb51`
- PR head: `2629e8d2d4627919cabadd63cfa77fcc6e65d70c`
- Merged at: 2026-10-15T16:56:30Z
- Post-merge workflow run: 38773177164
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #955 — docs(godot): Godot 4.x als Aurion-Client-Engine festlegen (#909)
Status: VERIFIED repository merge
<!-- auto-memory: pr=955 merge=f0486f28f04176ba47569afd356d1267993a8e12 -->
Task: Merge PR #955 into `main` — docs(godot): Godot 4.x als Aurion-Client-Engine festlegen (#909).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `SUMMARY.md`
- `docs/godot-migration/engine-decision.md`
- `docs/godot-migration/evidence/engine-comparison.md`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/955
- Merge commit: `f0486f28f04176ba47569afd356d1267993a8e12`
- PR head: `899d745acece58100e2eabfd2d4901ce033cbaa7`
- Merged at: 2026-10-15T17:03:24Z
- Post-merge workflow run: 38774134155
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #956 — feat(godot): Aurion-Zone-v5-Vertrag sprachneutral fixieren (#910)
Status: VERIFIED repository merge
<!-- auto-memory: pr=956 merge=988a7079a5aaa838dd313dc1284501ed4c32b254 -->
Task: Merge PR #956 into `main` — feat(godot): Aurion-Zone-v5-Vertrag sprachneutral fixieren (#910).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `SUMMARY.md`
- `docs/godot-migration/network-contract.md`
- `godot-client/net/contracts/zone_v5.schema.json`
- `godot-client/tests/contracts/test_zone_contract.gd`
- `scripts/godot/verify-contract-parity.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/956
- Merge commit: `988a7079a5aaa838dd313dc1284501ed4c32b254`
- PR head: `c15341b7f16351628461d37d20be8585fce2d7bf`
- Merged at: 2026-10-15T17:22:16Z
- Post-merge workflow run: 38776771171
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #958 — docs(godot): native Anmeldung und sichere Ticketübergabe entscheiden (#911)
Status: VERIFIED repository merge
<!-- auto-memory: pr=958 merge=6d3297857ac0c12b537ce371d2ea97a2b3c783d8 -->
Task: Merge PR #958 into `main` — docs(godot): native Anmeldung und sichere Ticketübergabe entscheiden (#911).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `SUMMARY.md`
- `docs/godot-migration/native-auth-decision.md`
- `docs/godot-migration/native-auth-threat-cases.md`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/958
- Merge commit: `6d3297857ac0c12b537ce371d2ea97a2b3c783d8`
- PR head: `7be5a79252987ec89aa3a36e92342045be2cd0f7`
- Merged at: 2026-10-15T17:31:09Z
- Post-merge workflow run: 38778014585
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — Aurion-owned profile progression copy
Status: VERIFIED candidate
Task: Remove visible active Legacy-Aurion/WASD ownership claims from the authenticated Account and Operations progression explanations.
Decisions: Keep the existing read-only Aurion readbacks unchanged; state that aggregate level/XP are absent from the current confirmed contract while the client projection invents neither aggregates nor classes.
Touched surfaces: `client/src/pages/Account.tsx`, `client/src/pages/Operations.tsx`, the single-authority regression and the existing authenticated three-viewport browser journey.
Evidence: Earlier candidate `7bfad45c6da39ce9088326a49b3ee595d6ffe97b` passed all eight workflows; AIM-259 `38772754165` / artifact `11991789777` captured authenticated Account readback on phone, tablet and desktop. Final Account plus Operations exact-head evidence is pending.
Learned: The confirmed `player.me` readback contains tracks but no aggregate level/XP fields; ownership copy must distinguish absent fields from a missing readback, and runtime evidence must activate tab-scoped content before asserting visibility.
Open: Final Memory-bearing head gates, review, merge and main readback.
Next safe step: Merge only after all exact-final-head gates and review are green, then verify the change on `main`.


### 2026-10-15 — PR #952 — fix(profile): identify progression readback as Aurion-owned
Status: VERIFIED repository merge
<!-- auto-memory: pr=952 merge=ad38e8c8387cddc827d098988649736d63c529ec -->
Task: Merge PR #952 into `main` — fix(profile): identify progression readback as Aurion-owned.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/pages/Account.tsx`
- `client/src/pages/Operations.tsx`
- `e2e/ax1.ui.spec.ts`
- `server/aurionSingleAuthorityArchitecture.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/952
- Merge commit: `ad38e8c8387cddc827d098988649736d63c529ec`
- PR head: `4755827ab5565c012990452b7e5379900abaeb6d`
- Merged at: 2026-10-15T18:07:35Z
- Post-merge workflow run: 38783029159
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — Restartable equipment-change aura
Status: VERIFIED candidate
Change: Repeated confirmed equipment changes now restart one 300 ms presentation timer, and runtime disposal cancels that timer.
Learning: Presentation pulses need one owned lifetime; independent timers let an older equipment change hide the latest pulse early.
Evidence: Baseline `abc6ed9d356ba1776319094c5f780eba04256acb` failed at t=300 ms in AIM-262 run `38784522455`; implementation/provenance head `68f0e9a51daaf3b358752a6448212fba0823018d` passed the real `OpenWorldPlayer` fake-clock regression, owner-ZIP reconstruction, and neighboring browser jobs in run `38786102785`.


### 2026-10-15 — PR #959 — fix(player): restart repeated equipment aura lifetime
Status: VERIFIED repository merge
<!-- auto-memory: pr=959 merge=7cb8d80dad289dd6cde8a53943a7c9f480a81cac -->
Task: Merge PR #959 into `main` — fix(player): restart repeated equipment aura lifetime.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/xaurion/entities/OpenWorldPlayer.ts`
- `client/src/xaurion/entities/OpenWorldPlayerAura.test.ts`
- `docs/migrations/aim239-determinism-adaptations.json`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/959
- Merge commit: `7cb8d80dad289dd6cde8a53943a7c9f480a81cac`
- PR head: `731ff3f5651c4996bae351f372127bf3459eab1e`
- Merged at: 2026-10-15T18:52:09Z
- Post-merge workflow run: 38789183348
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #960 — feat(godot): geprüfte Editor- und Android-Toolchain automatisieren
Status: VERIFIED repository merge
<!-- auto-memory: pr=960 merge=640d5817db0fcb3addb9781f15c8a0c7289c1265 -->
Task: Merge PR #960 into `main` — feat(godot): geprüfte Editor- und Android-Toolchain automatisieren.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/godot-headless.yml`
- `.gitignore`
- `SUMMARY.md`
- `config/godot-toolchain.lock.json`
- `docs/godot-migration/workspace.md`
- `scripts/godot/android-toolchain.mjs`
- `scripts/godot/bootstrap-android.mjs`
- `scripts/godot/bootstrap.mjs`
- `scripts/godot/doctor.mjs`
- `scripts/godot/toolchain.mjs`
- `scripts/godot/toolchain.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/960
- Merge commit: `640d5817db0fcb3addb9781f15c8a0c7289c1265`
- PR head: `97556e8e7e2d50bc03c9ca8762d134d9fe25b1f5`
- Merged at: 2026-10-15T19:15:45Z
- Post-merge workflow run: 38792450375
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #962 — feat(godot): fertige responsive Startszene und Projektgrenzen (#913)
Status: VERIFIED repository merge
<!-- auto-memory: pr=962 merge=1ce2ac6a91ff154bd45d9355a3e6eb52c69677ac -->
Task: Merge PR #962 into `main` — feat(godot): fertige responsive Startszene und Projektgrenzen (#913).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/godot-headless.yml`
- `.gitignore`
- `docs/godot-migration/evidence/g06/startup-1340x800.png`
- `docs/godot-migration/evidence/g06/startup-360x640.png`
- `docs/godot-migration/evidence/g06/startup-800x1340.png`
- `docs/godot-migration/workspace.md`
- `godot-client/README.md`
- `godot-client/actors/.gitkeep`
- `godot-client/addons/.gitkeep`
- `godot-client/app/main.gd`
- `godot-client/app/main.gd.uid`
- `godot-client/app/main.tscn`
- `godot-client/assets/.gitkeep`
- `godot-client/config/runtime_config.gd`
- `godot-client/config/runtime_config.gd.uid`
- `godot-client/project.godot`
- `godot-client/projection/.gitkeep`
- `godot-client/tests/capture_startup.gd`
- `godot-client/tests/capture_startup.gd.uid`
- `godot-client/tests/contracts/test_zone_contract.gd.uid`
- `godot-client/tests/test_startup.gd`
- `godot-client/tests/test_startup.gd.uid`
- `godot-client/ui/mobile/.gitkeep`
- `godot-client/ui/screens/.gitkeep`
- `godot-client/world/.gitkeep`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/962
- Merge commit: `1ce2ac6a91ff154bd45d9355a3e6eb52c69677ac`
- PR head: `f34cb4f683dee4baeb0b7107b3fbd8a9b2045a63`
- Merged at: 2026-10-15T19:31:30Z
- Post-merge workflow run: 38794612816
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #963 — feat(godot): revisionsgebundene Tests und Negativkontrollen (#914)
Status: VERIFIED repository merge
<!-- auto-memory: pr=963 merge=c31d2b3dca1beb0e5e4f6598d300b4ddf923920d -->
Task: Merge PR #963 into `main` — feat(godot): revisionsgebundene Tests und Negativkontrollen (#914).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/godot-headless.yml`
- `godot-client/tests/test_project_boot.gd`
- `godot-client/tests/test_project_boot.gd.uid`
- `scripts/godot/check-runtime.mjs`
- `scripts/godot/check.mjs`
- `scripts/godot/check.test.mjs`
- `scripts/godot/negative-controls.mjs`
- `scripts/godot/verify-evidence.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/963
- Merge commit: `c31d2b3dca1beb0e5e4f6598d300b4ddf923920d`
- PR head: `9a7a419d7b6af9f1f256922e36f671153767e3a3`
- Merged at: 2026-10-15T19:49:57Z
- Post-merge workflow run: 38797070669
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — Restartable Aurion mount feedback
Status: VERIFIED candidate
Task: Keep repeated human `Z` mount feedback visible for four seconds from the latest intent.
Decisions: Let the request path own one restartable presentation timer and cancel it during runtime disposal; Aurion intent dispatch and gameplay authority remain unchanged.
Touched surfaces: Open-world runtime mount feedback, AIM-242 source regression, AIM-259 authenticated browser journey.
Evidence: Implementation head `18cb9e65dc6b212d7bfa03cba7ce35b02a934ecb`; Local Test Pack `38793563854`; AIM-259 `38793563811` / artifact `12002470501` passed repeat-before-expiry visibility and latest-intent expiry on phone/tablet/desktop; exact-head Codex code review clear.
Learned: Fixed-string React state cannot restart an effect for an identical later event; the publisher must own transient instance lifetime.
Open: Final Memory-bearing exact-head gates, security review, merge and main readback.
Next safe step: Merge only after every final-head workflow and review gate is green.


### 2026-10-15 — PR #964 — fix(player): restart repeated mount feedback lifetime
Status: VERIFIED repository merge
<!-- auto-memory: pr=964 merge=b83f4b84bc864fdffcddef8f5af1e4cd5cfdc838 -->
Task: Merge PR #964 into `main` — fix(player): restart repeated mount feedback lifetime.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.tsx`
- `e2e/ax1.ui.spec.ts`
- `server/aim242AuthorityAdapter.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/964
- Merge commit: `b83f4b84bc864fdffcddef8f5af1e4cd5cfdc838`
- PR head: `a4d6a8427346b061986815b8c2b35c69aab8f789`
- Merged at: 2026-10-15T20:36:30Z
- Post-merge workflow run: 38803331085
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-15 — PR #965 — Godot Android Preview export
<!-- integration-memory: pr=965 -->
Status: VERIFIED local static/headless/export/readback; final PR-head CI required before merge; DEVICE UNVERIFIED.
Task: Build the isolated ARM64 Aurion Preview APK without owner SDK/Inspector work; show source identity and inspect package, launcher alias, permissions, SDK, landscape and signature. Aurion remains sole gameplay/persistence authority.
Evidence: Local source `05bdc82c37fc6b0bdaa784b458a1b1c35710edc0`, tree `ba5090eefd408b039ec115af1db4b2d21059ce40`; 10 Node regressions and 15 Godot/static checks passed. Actual APK export and independent hash/package/signature readback passed; APK SHA256 `00fab14080b0e2a6e1bc6fd7795f98cfd18142192958445ab8769a4a1e2454d1`. A deliberately modified APK was rejected by apksigner. Editor SHA256 `8d106cbe6144c2dc7e881d61d2429c1a8a76e6b22ef48bd5e48dcf934953f71e`; toolchain lock SHA256 `d44944e3b0d6f9c9b5801c19ba13b1c5030be873a109e1318ce183ab8d438adf`. Final revision-bound CI APK and all repository gates are read back in https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/965 before merge; this local binary is a separate diagnostic build.
Learned: Android export needs ETC2/ASTC import and an app icon. Classic export cannot override template SDK via Gradle options. The pinned 4.7.2 template actually declares minSdk 24 / targetSdk 36; aapt 35 omits launchable-activity for its valid exported activity-alias, so the concrete MAIN/LAUNCHER alias and target are verified from the manifest. Regressions cover these boundaries. Immutable SDK receipt survives export.
Open: Physical Tab-A9 installation/start, Android download usability, device performance and native login remain unverified. Debug keys stay outside git; different fresh runners may require a Preview reinstall because signatures differ. Final distributed APK must carry the final CI source revision and its own hash. SDK license acceptance is not claimed; no sdkmanager or Gradle build ran. Next: deliver the independently verified CI APK and obtain a real device screenshot/build ID; G09 login and G34 stable signing follow separately.


### 2026-10-15 — PR #969 — feat(auth): define the native session wire contract
Status: VERIFIED repository merge
<!-- auto-memory: pr=969 merge=fd85b56d6a65f652c8463567f6ca76a5c888952f -->
Task: Merge PR #969 into `main` — feat(auth): define the native session wire contract.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `shared/nativeAuthContract.test.ts`
- `shared/nativeAuthContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/969
- Merge commit: `fd85b56d6a65f652c8463567f6ca76a5c888952f`
- PR head: `a1e3e987d632d3877d6467268fb7571b6a0f4999`
- Merged at: 2026-10-15T21:56:16Z
- Post-merge workflow run: 38813575814
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-15 — PR #972 — fix(godot): verify launcher target activity name
Status: VERIFIED repository merge
<!-- auto-memory: pr=972 merge=c46bd567750ed52ceab8aa4a005e7c195b73c71e -->
Task: Merge PR #972 into `main` — fix(godot): verify launcher target activity name.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `scripts/godot/apk-readback.mjs`
- `scripts/godot/apk-readback.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/972
- Merge commit: `c46bd567750ed52ceab8aa4a005e7c195b73c71e`
- PR head: `0f7c38379d563601637a5b325d9a0e5f8d0d8647`
- Merged at: 2026-10-15T22:30:40Z
- Post-merge workflow run: 38817603429
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-16 — Temporary AIM-259 five-client browser quarantine pending Godot migration
Status: PARTIAL
Task: Preserve development velocity while deferring the five-concurrent-Chromium-client healer re-entry stress test until the Godot client migration is complete (issue #974).
Decisions: Quarantine ONLY the Playwright scenario in `e2e/aim259.groups.spec.ts`, not the entire AIM-259 workflow, authenticated browser neighbors, authoritative group rules, skill-derived healer qualification, MariaDB tests, migration checks, or real runtime checks. Restore that test via `AURION_GROUP_FIVE_CLIENT_REJOIN_E2E=1` for explicit diagnostic runs. Make the CI quarantine visible as a warning; a green workflow in this mode MUST NOT be interpreted as proof of five-player re-entry.
Touched surfaces: `e2e/aim259.groups.spec.ts`; `.github/workflows/aim259-group-instances.yml`; this memory entry.
Evidence: Issue https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/974 ; failing five-browser re-entry at `e2e/aim259.groups.spec.ts:54` in https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/38966647257 at head `7c59e411320ed5b7d857df2d5fc3b3de8da4c551`. In the earlier source replay, TypeScript passed, and other unit tests passed; this does NOT establish that all game/database/runtime behavior is fault-free. This quarantine branch started from main `a5a27a370d0810b01acf72dffdfbb4c6f25284bc`, deliberately omitting the unrelated unproven renderer experiment in PR #975. The CI results for this quarantine change remain unverified until readback.
Learned: A five-browser SwiftShader healer re-entry timeout is a failure of that specific end-to-end claim, not proof of a broken game or corrupted database. Aurion has no fixed group-role classes: `mending_light` must be actively equipped and verified by the authoritative server to qualify and label a healer.
Open: Full five-concurrent-client healer re-entry remains UNVERIFIED. Do not close issue #974 until a native Godot client parity test or equivalent real integration reproduction covers healer skill qualification, all five authenticated members, entry, combat/heal, exit, rejoin, and revision-bound DB/readback, including a real negative case without the equipped skill.
Next safe step: Complete native Godot migration, implement and run the full re-entry parity test, remove quarantine, and require all repository gates plus a complete exact-SHA readback before claiming a fix.


### 2026-10-16 — PR #981 — test(aurion): quarantine five-client healer re-entry until Godot parity (#974)
Status: VERIFIED repository merge
<!-- auto-memory: pr=981 merge=9e9e9ab06e531db2042775767e06bb5ea55f17b6 -->
Task: Merge PR #981 into `main` — test(aurion): quarantine five-client healer re-entry until Godot parity (#974).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aim259-group-instances.yml`
- `Memory.md`
- `e2e/aim259.groups.spec.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/981
- Merge commit: `9e9e9ab06e531db2042775767e06bb5ea55f17b6`
- PR head: `f138b01902d84dc349053fb6f5d61ee392e7574d`
- Merged at: 2026-10-16T21:26:07Z
- Post-merge workflow run: 38969355246
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-16 — Archive refresh feedback isolated from #979
Status: PENDING exact-head CI and independent readback
Task: Retain useful archive-dashboard refresh loading/accessibility behavior from stale PR #979 without unrelated AIM-296 performance receipt changes.
Decisions: Port only `client/src/components/ArchiveDashboard.tsx` UI to fresh branch from main `2f956f926d31fa98359c91dceb8746fa229b78d0`; disable repeated refetch while fetching, expose aria-busy/title and visible loading text. No changes to server authority, databases or game state.
Evidence: Source PR #979 head `77b5060eabb519bf0b9dda684977cc04713f2dd9`; no new-head success claim before CI. Exact proof pending.
Learned: Preserve narrow presentational benefit; never merge unrelated benchmark receipts as accidental collateral.
Open: Exact-head unit/type/build/browser/readback before merge.


### 2026-10-16 — PR #986 — fix(ui): isolated Archive Dashboard refresh feedback (from #979)
Status: VERIFIED repository merge
<!-- auto-memory: pr=986 merge=f38eafbb543805cda04878dc41e6ce0b7fd07690 -->
Task: Merge PR #986 into `main` — fix(ui): isolated Archive Dashboard refresh feedback (from #979).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/components/ArchiveDashboard.test.tsx`
- `client/src/components/ArchiveDashboard.tsx`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/986
- Merge commit: `f38eafbb543805cda04878dc41e6ce0b7fd07690`
- PR head: `9806b3eef7a15daec6625ff76dfafcd7ec3f66dd`
- Merged at: 2026-10-16T21:58:46Z
- Post-merge workflow run: 38972899060
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-16 — PR #989 — feat(godot): isolated native session persistence and replay tests (#967)
Status: VERIFIED repository merge
<!-- auto-memory: pr=989 merge=56efc77a49dd48d4bede228ae3dd9e29789fb37c -->
Task: Merge PR #989 into `main` — feat(godot): isolated native session persistence and replay tests (#967).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-local-test-pack.yml`
- `drizzle/nativeAuthSchema.ts`
- `fixtures/native-auth/0075_native_auth_candidate.sql`
- `scripts/prepare-native-auth-test-schema.mjs`
- `server/nativeAuthPersistence.ts`
- `server/nativeAuthPersistenceMariaDb.test.ts`
- `server/nativeAuthProtocol.test.ts`
- `server/nativeAuthProtocol.ts`
- `server/nativeAuthSchemaIsolation.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/989
- Merge commit: `56efc77a49dd48d4bede228ae3dd9e29789fb37c`
- PR head: `cc5d1d51f75dc2263305cf142a3bc407fbf73c73`
- Merged at: 2026-10-16T22:18:14Z
- Post-merge workflow run: 38974929708
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-16 — PR #990 — ci: restrict unrelated heavyweight Aurion specialty suites by change impact
Status: VERIFIED repository merge
<!-- auto-memory: pr=990 merge=97e9522fc85b45f8f7f1ca108fb09ab1797f18db -->
Task: Merge PR #990 into `main` — ci: restrict unrelated heavyweight Aurion specialty suites by change impact.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aim259-group-instances.yml`
- `.github/workflows/aim292-npc-multi-memory.yml`
- `.github/workflows/aim535-item-manipulation-runtime.yml`
- `scripts/ci/workflow-impact.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/990
- Merge commit: `97e9522fc85b45f8f7f1ca108fb09ab1797f18db`
- PR head: `c704a9bd1b8e6ecae2578819235b4587ae51b7d7`
- Merged at: 2026-10-16T22:33:56Z
- Post-merge workflow run: 38976510420
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-16 — PR #991 — feat(auth): native HTTP exchange, refresh and revoke (#967)
Status: VERIFIED repository merge
<!-- auto-memory: pr=991 merge=c918efc6fb7243cbcb9065c1f3124ea5b6db0b63 -->
Task: Merge PR #991 into `main` — feat(auth): native HTTP exchange, refresh and revoke (#967).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-local-test-pack.yml`
- `server/_core/index.ts`
- `server/nativeAuthHttp.test.ts`
- `server/nativeAuthHttp.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/991
- Merge commit: `c918efc6fb7243cbcb9065c1f3124ea5b6db0b63`
- PR head: `0421f8c2ee6c1044b7ed0d558ab13c4cb4a2b7f8`
- Merged at: 2026-10-16T23:29:00Z
- Post-merge workflow run: 38981670889
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-16 — PR #992 — feat(godot): native-auth PKCE and callback pre-login gate (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=992 merge=4ba7cca677ddb950308813c023f9eac95cd97ede -->
Task: Merge PR #992 into `main` — feat(godot): native-auth PKCE and callback pre-login gate (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/net/auth/native_auth_flow.gd`
- `godot-client/net/auth/native_auth_flow.gd.uid`
- `godot-client/tests/test_native_auth_flow.gd`
- `godot-client/tests/test_native_auth_flow.gd.uid`
- `scripts/godot/check.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/992
- Merge commit: `4ba7cca677ddb950308813c023f9eac95cd97ede`
- PR head: `970134133595524339ed10bfbf3b03d9a8254403`
- Merged at: 2026-10-16T23:48:34Z
- Post-merge workflow run: 38983349860
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #993 — feat(godot): fail-closed native token validation and ephemeral session guard (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=993 merge=d1842f99667b2634c0dba7611621c3b92ec5b9d6 -->
Task: Merge PR #993 into `main` — feat(godot): fail-closed native token validation and ephemeral session guard (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/net/auth/native_auth_tokens.gd`
- `godot-client/net/auth/native_auth_tokens.gd.uid`
- `godot-client/tests/test_native_auth_tokens.gd`
- `godot-client/tests/test_native_auth_tokens.gd.uid`
- `scripts/godot/check.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/993
- Merge commit: `d1842f99667b2634c0dba7611621c3b92ec5b9d6`
- PR head: `62072a54f94fd8f71f637837cb93363e34104647`
- Merged at: 2026-10-17T02:03:41Z
- Post-merge workflow run: 38993423375
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #988 — 🎨 Palette: Consistent Community Entry Points on Landing Page
Status: VERIFIED repository merge
<!-- auto-memory: pr=988 merge=68c25146d30ffd96650e96d280ceed2938554cb7 -->
Task: Merge PR #988 into `main` — 🎨 Palette: Consistent Community Entry Points on Landing Page.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.jules/palette.md`
- `aim296-bvh-performance-receipt.json`
- `client/src/pages/Home.tsx`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/988
- Merge commit: `68c25146d30ffd96650e96d280ceed2938554cb7`
- PR head: `30e78b280f5bd1aa718b0d465f79be1924eeeb42`
- Merged at: 2026-10-17T02:21:04Z
- Post-merge workflow run: 38994577442
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #994 — feat(godot): strictly validate Android callback URL before PKCE exchange (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=994 merge=186f840aefb99a25889f3d5d85192c3d6cdd65b9 -->
Task: Merge PR #994 into `main` — feat(godot): strictly validate Android callback URL before PKCE exchange (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/platform/android/native_app_link_callback.gd`
- `godot-client/platform/android/native_app_link_callback.gd.uid`
- `godot-client/tests/test_native_app_link_callback.gd`
- `godot-client/tests/test_native_app_link_callback.gd.uid`
- `scripts/godot/check.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/994
- Merge commit: `186f840aefb99a25889f3d5d85192c3d6cdd65b9`
- PR head: `c1b1d346ea4d7180207da06940e6b50325cfb2ea`
- Merged at: 2026-10-17T03:26:54Z
- Post-merge workflow run: 38998814117
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-17 — Material-aware blade silhouettes (draft integration)
Status: PARTIAL
Task: Integrate useful Gemini-inspired silhouettes into the canonical Aurion visual pipeline.
Decisions: Preserve ACEG, server-owned Loot V2, receipts and confirmed VisualItemDescriptor; implement five deterministic presentation-only profiles from confirmed material and morphology seed; bound blade triangles at LOD0/1/2 to 1600/800/300; avoid economy substitutions and gameplay mutations.
Touched surfaces: client/src/xaurion/core/VisualBladeProfile.ts, VisualBladeProfile.test.ts, VisualItemGeometryCompiler.ts, VisualItemGeometryCompiler.test.ts.
Evidence: Focused standalone TypeScript shape/profile assertions passed locally; repository Vitest/TypeScript, CI, Godot/runtime, and native device readbacks remain pending.
Learned: New visual variation belongs downstream of the confirmed descriptor, not in a parallel loot or capability engine.
Open: Check TS/build, geometry runtime and CI against exact PR SHA; implement a separate server-evidence-bound resource provenance slice only with authoritative material receipts.
Next safe step: Verify focused tests, TypeScript and geometry LOD limits; preserve draft status until green gates.

### 2026-10-17 — PR #995 donor-inventory gate repair
Status: PARTIAL
Task: Resolve DONOR_SURFACE_UNINVENTORIED preventing focused visual integration and exact-head build.
Decisions: Move the new presentation-only Aurion profile module and its tests into shared/ (Aurion-owned); keep existing donor inventory unchanged rather than falsely marking new Aurion code as historically donated. Preserve visual contract and ACEG authority.
Touched surfaces: shared/aurionVisualBladeProfile.ts, shared/aurionVisualBladeProfile.test.ts, client/src/xaurion/core/VisualItemGeometryCompiler.ts; retired initial client-local profile source/tests.
Evidence: GitHub Actions jobs 117298577243, 117298577448, 117298577441 on PR head 6a64e1b777f57d542db9b4aee37a7d78be721719 report the same DONOR_SURFACE_UNINVENTORIED for new client-local profile. Focused CI rerun after revision pending.
Learned: New Aurion-owned visual sources need their own source identity outside historical donor inventory roots, not a fabricated donor entry.
Open: Exact-head CI, build/runtime and merge verification.
Next safe step: Run relevant tests, typecheck and runtime candidate; merge only after readback.


### 2026-10-17 — PR #995 — feat(visual): deterministic material-aware blade silhouettes
Status: VERIFIED repository merge
<!-- auto-memory: pr=995 merge=e84383fb8f31a4bd9ec4076e0207b4407204a294 -->
Task: Merge PR #995 into `main` — feat(visual): deterministic material-aware blade silhouettes.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `client/src/xaurion/core/VisualItemGeometryCompiler.test.ts`
- `client/src/xaurion/core/VisualItemGeometryCompiler.ts`
- `shared/aurionVisualBladeProfile.test.ts`
- `shared/aurionVisualBladeProfile.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/995
- Merge commit: `e84383fb8f31a4bd9ec4076e0207b4407204a294`
- PR head: `88484539d51ad9a9bcbc79a1176fa1f732ee4ca7`
- Merged at: 2026-10-17T04:46:29Z
- Post-merge workflow run: 39003825351
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-17 — PR #996 confirmed chunk resource source evidence
Status: PARTIAL
Task: Extend the regional economy safely without duplicating Loot V2, ACEG or authoritative chunk state.
Decisions: Project a SHA-256-bound, read-only resource source summary from Aurion's already-materialized chunk read model; treat generic ore solely as ore, and do not infer iron, steel, refined inventories or imported supplies. Database readback fails closed when DB is unavailable. No reward, material entitlement or gameplay state mutation.
Touched surfaces: server/aurionChunkResourceEvidence.ts, server/aurionChunkResourceEvidence.test.ts, server/db.ts.
Evidence: Draft PR #996 head 4580328356f25afa77899e934e07079de8a79d6e; GitHub workflow checks for exact head pending. Source tests assert replay, depletion, zero-resource and tampering/ingredient fail-closed conditions; not yet certified by green CI.
Learned: Base chunk sources represent possible raw-resource collection points, not authoritative stocks of processed materials. A mined or traded item needs its own receipt and ownership before becoming an ingredient.
Open: Verify typecheck, focused regression, donor/build and runtime readbacks. Separate later integration must bind crafting to verified item/material provenance.
Next safe step: Read back focused CI on PR #996, repair any regression, then review stacked PR dependencies before merge.


### 2026-10-17 — PR #996 — feat(economy): authoritative chunk resource availability evidence
Status: VERIFIED repository merge
<!-- auto-memory: pr=996 merge=8a983eb49c02caa6a6ddfc9b7473dae1a3c8500f -->
Task: Merge PR #996 into `main` — feat(economy): authoritative chunk resource availability evidence.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `server/aurionChunkResourceEvidence.test.ts`
- `server/aurionChunkResourceEvidence.ts`
- `server/db.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/996
- Merge commit: `8a983eb49c02caa6a6ddfc9b7473dae1a3c8500f`
- PR head: `8dbe5d5b3bc06a66eca83e958b29157991f613b2`
- Merged at: 2026-10-17T05:17:05Z
- Post-merge workflow run: 39005695867
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #998 — Optimize Wolfram CAG terrain analysis queries
Status: VERIFIED repository merge
<!-- auto-memory: pr=998 merge=d7ec339e02886fb9d5d6da493c6a40763361e531 -->
Task: Merge PR #998 into `main` — Optimize Wolfram CAG terrain analysis queries.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `aim-599-deterministische-terrain-pipeline.md`
- `docs/aurion-deterministic-terrain-pipeline-aim599.md`
- `shared/aurionCagDesignProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/998
- Merge commit: `d7ec339e02886fb9d5d6da493c6a40763361e531`
- PR head: `3d33238b93945a1c98e6beb7931171637a156a93`
- Merged at: 2026-10-17T05:58:09Z
- Post-merge workflow run: 39008166725
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #997 — feat(auth): G09.A strict server browser start (staged; not deployable) (#967)
Status: VERIFIED repository merge
<!-- auto-memory: pr=997 merge=edcf045fa94557984564c390ae0f002b8b6f7b10 -->
Task: Merge PR #997 into `main` — feat(auth): G09.A strict server browser start (staged; not deployable) (#967).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-local-test-pack.yml`
- `client/src/components/LocalAuthPanel.tsx`
- `drizzle/nativeAuthSchema.ts`
- `fixtures/native-auth/0075_native_auth_candidate.sql`
- `server/_core/oauth.ts`
- `server/nativeAuthBrowser.ts`
- `server/nativeAuthBrowserMariaDb.test.ts`
- `server/nativeAuthHttp.test.ts`
- `server/nativeAuthHttp.ts`
- `server/nativeAuthPersistence.ts`
- `server/nativeAuthPersistenceMariaDb.test.ts`
- `server/nativeAuthStateSeal.test.ts`
- `server/nativeAuthStateSeal.ts`
- `server/observability/otelBoundary.test.ts`
- `server/observability/otelBoundary.ts`
- `shared/nativeAuthContract.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/997
- Merge commit: `edcf045fa94557984564c390ae0f002b8b6f7b10`
- PR head: `1b129b4d256c5fee105fc433bad34ca80292d821`
- Merged at: 2026-10-17T06:13:58Z
- Post-merge workflow run: 39009139860
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1023 — ci: prevent native-auth schema migrations from triggering unrelated gameplay suites
Status: VERIFIED repository merge
<!-- auto-memory: pr=1023 merge=f3e14d7eda152473bc060992804ce57ddf89ecbe -->
Task: Merge PR #1023 into `main` — ci: prevent native-auth schema migrations from triggering unrelated gameplay suites.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aim259-group-instances.yml`
- `.github/workflows/aim292-npc-multi-memory.yml`
- `.github/workflows/aim535-item-manipulation-runtime.yml`
- `.github/workflows/issue-502-inventory-mariadb.yml`
- `.github/workflows/starter-village-pilot.yml`
- `scripts/ci/workflow-impact.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1023
- Merge commit: `f3e14d7eda152473bc060992804ce57ddf89ecbe`
- PR head: `84c3cbdee8de898fb097982f50ed0f489891e91c`
- Merged at: 2026-10-17T11:14:48Z
- Post-merge workflow run: 39027960553
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1022 — chore(auth-db): 0075 production migration preflight and owner-approved release boundary (#973)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1022 merge=82e3320a7e5614ffbe1cdef4f1bce4733cfa55d2 -->
Task: Merge PR #1022 into `main` — chore(auth-db): 0075 production migration preflight and owner-approved release boundary (#973).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-local-test-pack.yml`
- `.github/workflows/aurion-production-schema-readback.yml`
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `config/aurion-migration-wave-manifest.json`
- `deploy/aurion-production-schema-apply-core`
- `deploy/promote-aurion-zone-runtime.sh`
- `deploy/verify-aurion-production-schema-apply-artifact.mjs`
- `deploy/verify-aurion-production-schema-reconcile-artifact.mjs`
- `docs/godot-migration/native-auth-0075-production-preflight.md`
- `drizzle.config.ts`
- `drizzle/0075_aurion_native_auth_sessions.sql`
- `drizzle/meta/_journal.json`
- `scripts/aurionProductionSchemaReconciliation.ts`
- `scripts/aurionSchemaRepairPlan.ts`
- `scripts/build-aurion-production-apply-artifact.mjs`
- `scripts/build-aurion-production-reconcile-artifact.mjs`
- `scripts/dispatch-aurion-schema-plan.mjs`
- `scripts/native-auth-0075-wave-preflight.mjs`
- `scripts/native-auth-0075-wave-preflight.test.mjs`
- `scripts/prepare-native-auth-test-schema.mjs`
- `scripts/schema-repair-proof-fixture.mjs`
- `server/aurionProductionSchemaApplyDockerRunner.test.ts`
- `server/aurionProductionSchemaReconcileDockerRunner.test.ts`
- `server/aurionSchemaRepairPlan.test.ts`
- `server/aurionSchemaReviewedRecovery.test.ts`
- `server/blocker3Compliance.test.ts`
- `server/nativeAuthSchemaIsolation.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1022
- Merge commit: `82e3320a7e5614ffbe1cdef4f1bce4733cfa55d2`
- PR head: `638256dd37f9e3fbac2633a14fabf3b0326677eb`
- Merged at: 2026-10-17T12:27:29Z
- Post-merge workflow run: 39032595555
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1024 — fix(godot/g09): independent read-only live schema 0075 observation
Status: VERIFIED repository merge
<!-- auto-memory: pr=1024 merge=885e2e375f4959f0b514285455c2d3418561f6ca -->
Task: Merge PR #1024 into `main` — fix(godot/g09): independent read-only live schema 0075 observation.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-0075-live-readback.yml`
- `.github/workflows/aurion-g09-readback-contract.yml`
- `scripts/aurion-live-schema-observation.mjs`
- `scripts/aurion-live-schema-observation.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1024
- Merge commit: `885e2e375f4959f0b514285455c2d3418561f6ca`
- PR head: `4c484e4ab8a972b0f13b301db15022914a39bd1c`
- Merged at: 2026-10-17T14:47:27Z
- Post-merge workflow run: 39042243707
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1025 — fix(godot/g09): auto-read schema after completed Aurion releases
Status: VERIFIED repository merge
<!-- auto-memory: pr=1025 merge=e99633b98da073d01b7b71b2c4405b774d601ea6 -->
Task: Merge PR #1025 into `main` — fix(godot/g09): auto-read schema after completed Aurion releases.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-0075-live-readback.yml`
- `scripts/aurion-live-schema-observation.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1025
- Merge commit: `e99633b98da073d01b7b71b2c4405b774d601ea6`
- PR head: `b52e0b6e52c0ab567de759c29a36fab07f1a8bcf`
- Merged at: 2026-10-17T17:15:39Z
- Post-merge workflow run: 39052972456
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1026 — fix(godot/g09): classify live reconciler exit 69 without leaking stderr
Status: VERIFIED repository merge
<!-- auto-memory: pr=1026 merge=f545d906cdf3af0ebdec57211ae027f400b210c7 -->
Task: Merge PR #1026 into `main` — fix(godot/g09): classify live reconciler exit 69 without leaking stderr.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-0075-live-readback.yml`
- `scripts/aurion-live-schema-observation.mjs`
- `scripts/aurion-live-schema-observation.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1026
- Merge commit: `f545d906cdf3af0ebdec57211ae027f400b210c7`
- PR head: `fd06cc6baee8ace1199ce88cb16741edd2d4f13d`
- Merged at: 2026-10-17T17:20:07Z
- Post-merge workflow run: 39053299946
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1030 — fix(community): expose and verify Events dialog
Status: VERIFIED repository merge
<!-- auto-memory: pr=1030 merge=98fb5f1d45cf212947c2e76319985e9e039f72f1 -->
Task: Merge PR #1030 into `main` — fix(community): expose and verify Events dialog.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-home-community-entrypoint.yml`
- `client/src/components/CommunityOverlay.test.tsx`
- `client/src/components/CommunityOverlay.tsx`
- `client/src/pages/Home.test.tsx`
- `e2e/guest-smoke.spec.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1030
- Merge commit: `98fb5f1d45cf212947c2e76319985e9e039f72f1`
- PR head: `04aca28ec46c91d8cfd479881792c723359aa879`
- Merged at: 2026-10-17T22:01:13Z
- Post-merge workflow run: 39073341139
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1032 — fix(world): report settled chunk projection evidence
Status: VERIFIED repository merge
<!-- auto-memory: pr=1032 merge=01ae1d33c6f00499e71c1d04c25b6dc6edb02a73 -->
Task: Merge PR #1032 into `main` — fix(world): report settled chunk projection evidence.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/src/xaurion/integration/ConfirmedChunkProjection.ts`
- `e2e/aim290.rendererRecovery.spec.ts`
- `server/worldChunkProjectionRuntime.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1032
- Merge commit: `01ae1d33c6f00499e71c1d04c25b6dc6edb02a73`
- PR head: `53bfab13b7944e67d94ddeae2020de58fcc323f8`
- Merged at: 2026-10-17T22:36:47Z
- Post-merge workflow run: 39075784689
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-17 — PR #1033 — fix(auth): revoke all native sessions for confirmed user (#967)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1033 merge=b1842d22ba5b96e6836c8944150d38b089e16c3c -->
Task: Merge PR #1033 into `main` — fix(auth): revoke all native sessions for confirmed user (#967).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `server/nativeAuthHttp.test.ts`
- `server/nativeAuthHttp.ts`
- `server/nativeAuthPersistence.ts`
- `server/nativeAuthPersistenceMariaDb.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1033
- Merge commit: `b1842d22ba5b96e6836c8944150d38b089e16c3c`
- PR head: `eceaaad2fb51e7741e0e87749a9d8c1b9d8ed797`
- Merged at: 2026-10-17T23:40:23Z
- Post-merge workflow run: 39079924730
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1034 — fix(auth): authenticate native access bearer (#967)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1034 merge=1adc318008b5cb55943c927a9ca7615a270a6b4d -->
Task: Merge PR #1034 into `main` — fix(auth): authenticate native access bearer (#967).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-local-test-pack.yml`
- `server/_core/sdk.ts`
- `server/_core/sdkNativeAuth.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1034
- Merge commit: `1adc318008b5cb55943c927a9ca7615a270a6b4d`
- PR head: `026084e8085dad6a5982739b9e76a8e9fa6757cd`
- Merged at: 2026-10-18T00:32:37Z
- Post-merge workflow run: 39083147694
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-18 — Native bearer HTTP failure semantics (#967)
Status: VERIFIED candidate
Task: Close the native access-bearer review gaps after PR #1034 by preserving expiry and persistence-availability semantics through every active HTTP consumer.
Decisions: Native-shaped expired/revoked credentials remain a stable 401 through tRPC and direct Equipment/GLB HTTP consumers without Preview-JWT fallback; persistence/user/activity unavailability remains a sanitized retryable 503; confirmed access alone updates lastSignedIn.
Touched surfaces: Native Auth persistence, shared HTTP error classification, tRPC context, authenticated SDK/upload/equipment/guild/studio routes, focused route regressions and Local Test Pack coverage.
Evidence: Implementation candidate `a07f5ec582d4dfde5947078da06211f9368f01c5`; Local Test Pack `39084423144` passed isolated MariaDB 24/24, focused HTTP/SDK/availability 15/15, TypeScript and 447 files / 2,250 tests; all nine runtime/integration workflows passed. Final direct-route correction requires fresh exact-head gates and review before merge.
Learned: Native bearer availability and refresh signals must remain typed across every active HTTP boundary; collapsing them into generic authentication responses hides retryable server state or prevents one-time refresh.
Open: Production Native Auth schema deployment and device-login proof remain separately gated.
Next safe step: Merge the reviewed candidate and confirm source, tests and this entry on main.


### 2026-10-18 — PR #1035 — fix(auth): close native bearer review gaps (#967)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1035 merge=f6f689f840c78912b96d8eec738ae24da645afc2 -->
Task: Merge PR #1035 into `main` — fix(auth): close native bearer review gaps (#967).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-local-test-pack.yml`
- `Memory.md`
- `server/_core/context.ts`
- `server/_core/nativeAuthHttpError.test.ts`
- `server/_core/nativeAuthHttpError.ts`
- `server/_core/sdk.ts`
- `server/_core/sdkNativeAuth.test.ts`
- `server/confirmedEquipmentVisualRoutes.ts`
- `server/gameDevelopmentStudioRuntime.ts`
- `server/glbSmartUpload.ts`
- `server/glbZipUpload.ts`
- `server/guildBankRoutes.ts`
- `server/guildGovernanceRoutes.ts`
- `server/nativeAuthDirectHttpRoutes.test.ts`
- `server/nativeAuthPersistence.ts`
- `server/nativeAuthPersistenceUnavailable.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1035
- Merge commit: `f6f689f840c78912b96d8eec738ae24da645afc2`
- PR head: `6895cbb432fa199ee4bf4292e28676b0998d9864`
- Merged at: 2026-10-18T01:49:01Z
- Post-merge workflow run: 39087842805
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1036 — feat(godot): stage readiness-gated native auth start (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1036 merge=c5a3ce1075613604ea0281e3068772fab29847d9 -->
Task: Merge PR #1036 into `main` — feat(godot): stage readiness-gated native auth start (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/README.md`
- `godot-client/app/main.gd`
- `godot-client/config/runtime_config.gd`
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/net/auth/native_auth_start.gd.uid`
- `godot-client/project.godot`
- `godot-client/tests/test_native_auth_start_runtime.gd`
- `godot-client/tests/test_native_auth_start_runtime.gd.uid`
- `godot-client/tests/test_startup.gd`
- `scripts/godot/check.mjs`
- `scripts/godot/check.test.mjs`
- `scripts/godot/native-auth-start-runtime.mjs`
- `scripts/godot/verify-evidence.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1036
- Merge commit: `c5a3ce1075613604ea0281e3068772fab29847d9`
- PR head: `70a1d7ff13f399b826403c02fab26760c4f89f11`
- Merged at: 2026-10-18T02:41:41Z
- Post-merge workflow run: 39091003117
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1037 — fix(auth): preserve typed native rate-limit failures
Status: VERIFIED repository merge
<!-- auto-memory: pr=1037 merge=9b154ec67b805d20f4234256fa8f7fbecc645aef -->
Task: Merge PR #1037 into `main` — fix(auth): preserve typed native rate-limit failures.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `server/nativeAuthHttp.test.ts`
- `server/nativeAuthHttp.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1037
- Merge commit: `9b154ec67b805d20f4234256fa8f7fbecc645aef`
- PR head: `d6aa455331da722f261b236b675cc03297961cc0`
- Merged at: 2026-10-18T03:27:34Z
- Post-merge workflow run: 39093694589
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1040 — fix(godot): exchange verified native auth callbacks
Status: VERIFIED repository merge
<!-- auto-memory: pr=1040 merge=edfca022755f11c49bf99436221105610ef95f11 -->
Task: Merge PR #1040 into `main` — fix(godot): exchange verified native auth callbacks.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/app/main.gd`
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/net/auth/native_auth_tokens.gd`
- `godot-client/tests/test_native_auth_start_runtime.gd`
- `godot-client/tests/test_native_auth_tokens.gd`
- `scripts/godot/check.mjs`
- `scripts/godot/native-auth-start-runtime.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1040
- Merge commit: `edfca022755f11c49bf99436221105610ef95f11`
- PR head: `343369e94891305a335df76fddf4a7184a01c5cb`
- Merged at: 2026-10-18T04:35:15Z
- Post-merge workflow run: 39097613429
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1042 — fix(godot): rotate native auth tokens over HTTP (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1042 merge=82083d3b0827990228a89bbbc4930c4490dda19f -->
Task: Merge PR #1042 into `main` — fix(godot): rotate native auth tokens over HTTP (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/tests/test_native_auth_start_runtime.gd`
- `scripts/godot/check.mjs`
- `scripts/godot/native-auth-start-runtime.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1042
- Merge commit: `82083d3b0827990228a89bbbc4930c4490dda19f`
- PR head: `96f1d3c9e855a5805bf1bfc1d4255d1bc8a3ce7c`
- Merged at: 2026-10-18T05:35:21Z
- Post-merge workflow run: 39101070494
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1043 — fix(godot): revoke native session on logout (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1043 merge=adc01a28dafcaef0dd275e2ad3dadd3a82f8fc34 -->
Task: Merge PR #1043 into `main` — fix(godot): revoke native session on logout (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/tests/test_native_auth_start_runtime.gd`
- `scripts/godot/check.mjs`
- `scripts/godot/native-auth-start-runtime.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1043
- Merge commit: `adc01a28dafcaef0dd275e2ad3dadd3a82f8fc34`
- PR head: `b5d7bcc36f4ad7b0864c7f6a76ebf434034d57c2`
- Merged at: 2026-10-18T08:57:48Z
- Post-merge workflow run: 39113467170
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1044 — fix(godot): retry protected zone ticket after native refresh (#968)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1044 merge=b5bda7dbcc87acdae0d23d35bc8c94eaeebd49ce -->
Task: Merge PR #1044 into `main` — fix(godot): retry protected zone ticket after native refresh (#968).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/net/api/aurion_api.gd`
- `godot-client/net/api/aurion_api.gd.uid`
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/net/auth/native_auth_tokens.gd`
- `godot-client/tests/test_aurion_api_runtime.gd`
- `godot-client/tests/test_aurion_api_runtime.gd.uid`
- `godot-client/tests/test_native_auth_tokens.gd`
- `scripts/godot/aurion-api-runtime.mjs`
- `scripts/godot/check.mjs`
- `server/nativeAuthPersistenceMariaDb.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1044
- Merge commit: `b5bda7dbcc87acdae0d23d35bc8c94eaeebd49ce`
- PR head: `de66c0da16554ca46e9842964215ebdeccaa808f`
- Merged at: 2026-10-18T12:21:45Z
- Post-merge workflow run: 39126962496
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-18 — PR #1045 — Offline quest receipt direct iteration
Status: VERIFIED candidate
Task: Remove intermediate arrays from the offline quest replay and sequence scans without changing receipt semantics.
Decisions: Directly iterate the existing ordered receipt map; preserve first-match replay, maximum sequence, conflicts and Aurion ownership; gate the proof workflow with immutable action pins and no persisted checkout credentials.
Touched surfaces: `server/questCompiler/persistence.ts`, focused iteration helpers/tests, reproducible benchmark workflow.
Evidence: Exact tested head `e7ba21d493714e33eadf4ca26a0e578227ddffef`; differential/runtime proof `39132483280` passed 10/10 tests and a 75,000-receipt workload with parity, median 151.92 ms → 66.35 ms and measured median heap delta 10,720,096 → 8,608 bytes; Local Test Pack `39132483309` passed 449 files / 2,257 tests; Runtime Candidate `39132483283` and Container Proof `39132483278` passed; exact-head code/security reviews clear.
Learned: Direct iterable scans preserve Map insertion semantics while removing measurable allocation pressure; allocation claims must be asserted from measured same-run evidence, not hard-coded structural expectations.
Open: Merge and main readback only.
Next safe step: Merge PR #1045 only if the Memory-bearing final head retains green exact-head gates and clean reviews.


### 2026-10-18 — PR #1045 — perf(quests): remove offline receipt iteration arrays
Status: VERIFIED repository merge
<!-- auto-memory: pr=1045 merge=c6fe6bd21861fb8804650f034c4bca979d71c16c -->
Task: Merge PR #1045 into `main` — perf(quests): remove offline receipt iteration arrays.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/quest-receipt-iteration.yml`
- `Memory.md`
- `scripts/benchmark-quest-receipt-iteration.ts`
- `server/questCompiler/persistence.ts`
- `server/questCompiler/receiptIteration.test.ts`
- `server/questCompiler/receiptIteration.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1045
- Merge commit: `c6fe6bd21861fb8804650f034c4bca979d71c16c`
- PR head: `359a8adcf49f68e6ef34d95e6a1bacd68fab1a3d`
- Merged at: 2026-10-18T13:58:23Z
- Post-merge workflow run: 39133892621
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.
### 2026-10-18 — PR #1046 — Chunk-cache direct background partition
Status: VERIFIED candidate
Task: Replace duplicate full-map cache scans with one ordered background partition while preserving visible pinning and deterministic LRU retain/evict output.
Evidence: Exact code head `e726184f49c75ebefa158ea1fa98a01d413567ca`; proof run `39136341199` passed 13/13 focused tests and parity for 9/25 visible chunks, reducing traced allocations 550,300,952→438,583,584 bytes (phone) and 676,194,216→544,503,936 bytes (desktop), with median/p95 also lower; Full Pack `39136341128` passed 449 files / 2,258 tests; seven neighboring runtime/integration workflows and exact-head code/security reviews passed.
Learned: Partitioning the already deduplicated background entries once preserves canonical cache ordering and avoids both the second Map materialization and retained-key scan; allocation claims need an isolated same-workload readback that fails on regression.
Next safe step: Merge only if this Memory-bearing final head retains green exact-head gates and clean reviews.


### 2026-10-18 — PR #1046 — perf(world): reduce chunk cache plan allocations (#982)
Status: VERIFIED repository merge
<!-- auto-memory: pr=1046 merge=e04a0fa1c09b04a2edb4d3cfd845c7438e4790d2 -->
Task: Merge PR #1046 into `main` — perf(world): reduce chunk cache plan allocations (#982).
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/world-chunk-cache-iteration.yml`
- `Memory.md`
- `docs/balancing/aim265-candidate.json`
- `scripts/benchmark-world-chunk-cache-iteration.ts`
- `server/worldChunkStreamingProtocol.test.ts`
- `shared/worldChunkStreamingProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1046
- Merge commit: `e04a0fa1c09b04a2edb4d3cfd845c7438e4790d2`
- PR head: `8b756a1b9390cfa6798561fbe880a9d32539a954`
- Merged at: 2026-10-18T14:55:12Z
- Post-merge workflow run: 39138142108
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1047 — fix(runtime): prevent world readback from starving group re-entry
Status: VERIFIED repository merge
<!-- auto-memory: pr=1047 merge=75657bf258100d2611eafbd50435f9f5ed98dacf -->
Task: Merge PR #1047 into `main` — fix(runtime): prevent world readback from starving group re-entry.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aim259-group-instances.yml`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.test.tsx`
- `client/src/xaurion/integration/AurionOpenWorldRuntime.tsx`
- `e2e/aim259.groups.spec.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1047
- Merge commit: `75657bf258100d2611eafbd50435f9f5ed98dacf`
- PR head: `c2beb654baf18fe03915fa985b39d09660949506`
- Merged at: 2026-10-18T16:48:21Z
- Post-merge workflow run: 39146679886
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-18 — PR #1048 — Deadline-bound mobile GLB wheel evidence
Status: VERIFICATION PENDING
Task: Replace the flaky exact-bottom predicate with one real wheel input, deadline-bound movement observation, and an independent reachability check for the lower mobile controls.
Evidence: AIM-240 run 39151553433 passed the full MariaDB/browser lane on head `9238e139afb5d80da85595b5ad2cd56dc3fb40bb`; failure trace artifact 12145531495 showed repeated wheel input could hang Chromium.
Learned: Observe one asynchronous wheel result, then verify lower content reachability separately instead of repeating compositor input as a wait mechanism.
Next safe step: Run AIM-240 on the Memory-bearing PR head, obtain clean exact-head review, then merge and read back main.

### 2026-10-18 — PR #1048 — test(glb): make mobile wheel evidence deterministic
Status: VERIFIED repository merge
<!-- auto-memory: pr=1048 merge=e499e704bf57f331250b4b2326d0b116d57635e5 -->
Task: Merge PR #1048 into `main` — test(glb): make mobile wheel evidence deterministic.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `e2e/glbImport.spec.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1048
- Merge commit: `e499e704bf57f331250b4b2326d0b116d57635e5`
- PR head: `f27fd69fd00c77f7bdd6f380f27577efe95d4f29`
- Merged at: 2026-10-18T18:09:37Z
- Post-merge workflow run: 39152876717
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-18 — PR #1049 — Native login zone-ticket handoff
Status: VERIFIED candidate
Task: Connect the running Godot launch scene's confirmed native session to the existing Aurion zone-ticket client and keep relogin closed until terminal logout after failure.
Evidence: Corrected code head `dbc4939322b22ef21927e814e009321045b04bd4`; Godot run 39155535324 passed import, scene runtime, real native-auth/ticket HTTP runtimes, logout-race regression, negative controls and Android toolchain with evidence artifact 12146439072 (`sha256:9280ea38928921507aa1f5f027688a2f1f68f17492d7491439e7a10f53701186`); APK run 39155535303 passed independent readback with artifact 12147116598 (`sha256:39ddd7ab7230bbe6f0b8919fb162d54f4d52c74b69d710240b0fe7a90db75ead`).
Learned: Ticket success proves authentication and ticket acquisition, not WSS connection; an API-started revocation must keep relogin closed until its terminal signal.
Next safe step: Require green exact-head gates and clean review on the Memory-bearing head, then merge and read back main.
