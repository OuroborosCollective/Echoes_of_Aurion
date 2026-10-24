Warning: truncated output (original token count: 96722)
Total output lines: 4774

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
Follow-up evidence: The added welcome-membership regression failed on the proposed shared presence array (player:10 leaked into player:2's earlier welcome). Keep outward membership lists separate across the g…46722 tokens truncated…ameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/godot-android-build.yml`
- `config/godot-toolchain.lock.json`
- `scripts/godot/gradle-prerequisites.mjs`
- `scripts/godot/gradle-prerequisites.test.mjs`
- `scripts/godot/verify-gradle-template.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1069
- Merge commit: `0e6fe3303c86ba79bf568b43429bad1f00de7d3f`
- PR head: `71445723455c7e185633e29b6ff3a433a9e6de4e`
- Merged at: 2026-10-19T21:03:29Z
- Post-merge workflow run: 39324442469
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-19 — PR #1071 — test(g09): fail-closed real login signer and APK App Link readback
Status: VERIFIED repository merge
<!-- auto-memory: pr=1071 merge=eaa5f9aaf6b576612840fd8bff9dca124cdbf7b2 -->
Task: Merge PR #1071 into `main` — test(g09): fail-closed real login signer and APK App Link readback.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/godot-android-build.yml`
- `scripts/godot/android-gradle-link.mjs`
- `scripts/godot/apk-readback.mjs`
- `scripts/godot/login-gradle-export.mjs`
- `scripts/godot/login-gradle-export.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1071
- Merge commit: `eaa5f9aaf6b576612840fd8bff9dca124cdbf7b2`
- PR head: `df706f368aaae83c2d6e4f33cf685278d0656ee6`
- Merged at: 2026-10-19T22:02:41Z
- Post-merge workflow run: 39332107711
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-19 — PR #1058 — ⚡ Bolt: Optimize Wolfram CAG terrain analysis queries
Status: VERIFIED repository merge
<!-- auto-memory: pr=1058 merge=89a7350f2a01eaac0251c03100d0361c58da192d -->
Task: Merge PR #1058 into `main` — ⚡ Bolt: Optimize Wolfram CAG terrain analysis queries.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `server/aurionCagDesignOracle.test.ts`
- `server/deterministicTerrainPipeline.test.ts`
- `shared/aurionCagDesignProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1058
- Merge commit: `89a7350f2a01eaac0251c03100d0361c58da192d`
- PR head: `fb4bf8120e332b71b3a1f19ee2baf3360dadfa8e`
- Merged at: 2026-10-19T22:56:47Z
- Post-merge workflow run: 39338403859
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-19 — PR #1072 — feat(g09): gated signed Godot Gradle login APK export
Status: VERIFIED repository merge
<!-- auto-memory: pr=1072 merge=7cc60c7b5f32bb338ff8de21873165d188208a6f -->
Task: Merge PR #1072 into `main` — feat(g09): gated signed Godot Gradle login APK export.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/godot-android-build.yml`
- `scripts/godot/export-login-android.mjs`
- `scripts/godot/login-release-gates.mjs`
- `scripts/godot/login-release-gates.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1072
- Merge commit: `7cc60c7b5f32bb338ff8de21873165d188208a6f`
- PR head: `11d13fd0c6bca73ef0a01f9fbdcd5553e61e84d8`
- Merged at: 2026-10-19T23:36:27Z
- Post-merge workflow run: 39342619176
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — PR #1075 — fix(g09): enable native auth in signed Login APK
Status: VERIFIED repository merge
<!-- auto-memory: pr=1075 merge=cd08e1e2dc043d76da209aa27752b25c257e1a7d -->
Task: Merge PR #1075 into `main` — fix(g09): enable native auth in signed Login APK.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `scripts/godot/export-login-android.mjs`
- `scripts/godot/login-release-gates.mjs`
- `scripts/godot/login-release-gates.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1075
- Merge commit: `cd08e1e2dc043d76da209aa27752b25c257e1a7d`
- PR head: `a07d3e4605b7f14c357b88b40e0a52c0febd4bfc`
- Merged at: 2026-10-20T07:37:03Z
- Post-merge workflow run: 39387692513
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — PR #1076 — fix(g09): discard stale App Link intent before relogin
Status: VERIFIED repository merge
<!-- auto-memory: pr=1076 merge=00918a5f7f793681a4435d28fc68dc98e33f8582 -->
Task: Merge PR #1076 into `main` — fix(g09): discard stale App Link intent before relogin.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/platform/android/native_intent_bridge.gd`
- `godot-client/tests/test_native_intent_bridge.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1076
- Merge commit: `00918a5f7f793681a4435d28fc68dc98e33f8582`
- PR head: `7c78b1720d3b72d5a9cbffa87b85db0cafdfa587`
- Merged at: 2026-10-20T08:27:44Z
- Post-merge workflow run: 39393569134
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G09 malformed Android App Link termination
Status: VERIFIED candidate
Task: Forward a malformed callback on the exact Aurion Android App-Link route once to the existing fail-closed auth validator instead of trapping it in the Activity intent.
Decisions: Keep exact route recognition and intent consumption in the native bridge; keep URI, field and PKCE/state validation in the canonical callback parser; foreign URLs remain blocked.
Touched surfaces: `godot-client/platform/android/native_intent_bridge.gd`, `godot-client/tests/test_native_intent_bridge.gd`.
Evidence: Candidate `d5c5939138af8b645f03b28da8522138c2e9cbf5`; Godot headless run 39402371895/artifact 12255260920 and Android Preview APK run 39402371812/artifact 12256136104 passed; queryless and fragment callback regressions address both P2 review findings.
Learned: Transport prefiltering must not prevent the canonical validator from terminating malformed callbacks, or the retained Android intent creates an endless pending-login loop.
Open: Merge and main readback.
Next safe step: Merge after final-head gates and reviews remain clean, then read back main.


### 2026-10-20 — PR #1077 — fix(g09): terminate malformed canonical App Links
Status: VERIFIED repository merge
<!-- auto-memory: pr=1077 merge=7f1df7a09a6cf398adbaae647304afddaec56a2b -->
Task: Merge PR #1077 into `main` — fix(g09): terminate malformed canonical App Links.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/platform/android/native_intent_bridge.gd`
- `godot-client/tests/test_native_intent_bridge.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1077
- Merge commit: `7f1df7a09a6cf398adbaae647304afddaec56a2b`
- PR head: `90e1b36db8b046326596e1e7b5fdfcb9d9b1edab`
- Merged at: 2026-10-20T09:49:07Z
- Post-merge workflow run: 39403453736
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — G09 duplicate Android App Link consumption
Status: VERIFIED candidate
Task: Remove a redelivered canonical Android auth callback from the Activity intent without forwarding it to the in-flight exchange twice.
Decisions: Keep route recognition and one-shot delivery in the native bridge; duplicate callbacks are consumed only while login is pending, and unrelated intents remain untouched.
Touched surfaces: `godot-client/platform/android/native_intent_bridge.gd`, `godot-client/tests/test_native_intent_bridge.gd`.
Evidence: Baseline `16845618d5e0ad9bbdc4a5dd672e3e916e5708f2` failed Godot run 39407378017 with the causal duplicate-intent assertion. Fixed code head `09d5e2724436c5dfc88938d2b7fba78bf7e7df81` passed Godot headless run 39407534089/artifact 12257078717 and Android Preview APK run 39407534018/artifact 12257159065.
Learned: Signal deduplication does not consume a newly redelivered Android Activity intent; canonical transport cleanup must be independent from downstream delivery acceptance.
Open: Exact final-head gates, shared review, merge and main readback.
Next safe step: Merge only after final-head gates and reviews are clean, then read back main.


### 2026-10-20 — PR #1078 — fix(g09): consume duplicate Android App Link intents
Status: VERIFIED repository merge
<!-- auto-memory: pr=1078 merge=6eed541e3a35a44c68cfde409ecccd4b684131f0 -->
Task: Merge PR #1078 into `main` — fix(g09): consume duplicate Android App Link intents.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/platform/android/native_intent_bridge.gd`
- `godot-client/tests/test_native_intent_bridge.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1078
- Merge commit: `6eed541e3a35a44c68cfde409ecccd4b684131f0`
- PR head: `1ce2b29a7f233cd34dd407e90ba6b8ef0671fb18`
- Merged at: 2026-10-20T10:31:01Z
- Post-merge workflow run: 39408497378
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G09 pre-launch App Link reset ordering
Status: VERIFIED candidate
Task: Preserve the current Android login across stale callback races without losing its fast post-launch callback.
Change: The transport provides a synchronous pre-browser-open cleanup boundary, and the strict callback parser harmlessly consumes a well-formed mismatched stale state while malformed, expired and matching callbacks retain their fail-closed/one-time semantics.
Evidence: Baseline `b960f5d8faf21d668039b76e98f5fc540dc39f1f` failed Godot run 39414331617; review-corrected candidate `1905ee4038fd04f2d45eb0f4fecacb9595c4dc0d` passed Godot run 39416982340/artifact 12260969300 and Android Preview APK run 39416982369/artifact 12260709961.
Learned: Timing cleanup narrows Android callback races, but transaction state must distinguish a valid old callback from malformed input so stale browser completion cannot cancel a newer PKCE attempt.
Open: Exact Memory-bearing final-head gates, refreshed reviews, merge and main readback.
Next safe step: Merge only after the Memory-bearing final head is green and reviews are clear.


### 2026-10-20 — PR #1079 — fix(g09): preserve fast App Link after browser launch
Status: VERIFIED repository merge
<!-- auto-memory: pr=1079 merge=a5c3221f2f5a40ce5656abb27268222fc15f04b3 -->
Task: Merge PR #1079 into `main` — fix(g09): preserve fast App Link after browser launch.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/net/auth/native_auth_flow.gd`
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/platform/android/native_app_link_callback.gd`
- `godot-client/tests/test_native_app_link_callback.gd`
- `godot-client/tests/test_native_auth_start_runtime.gd`
- `godot-client/tests/test_native_intent_bridge.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1079
- Merge commit: `a5c3221f2f5a40ce5656abb27268222fc15f04b3`
- PR head: `5cab4fd9a99b81e3006ec489fc55f1afea928cf5`
- Merged at: 2026-10-20T11:55:15Z
- Post-merge workflow run: 39418415965
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G09 stale App Link runtime preservation
Status: VERIFIED candidate
Task: Preserve the current Android login when a well-formed callback from an older browser attempt reaches the active auth runtime.
Change: NativeAuthStart now distinguishes the parser's preserved-current-flow result from malformed callback failure, and the launch UI remains waiting and cancellable until the current callback starts exchange.
Evidence: Candidate `5bbac9b89cf7cc8edd93b4b39afc0186eeebb27b`; Godot headless run 39421731007/artifact 12263474803 and Android Preview APK run 39421730952/artifact 12264615704 passed.
Learned: Preserving PKCE state inside the URI parser is insufficient if its caller collapses an empty stale-callback result into terminal session failure.
Open: Exact Memory-bearing final-head gates, shared code/security review, merge and main readback.
Next safe step: Merge only after the final head is green and reviews are clear.


### 2026-10-20 — PR #1080 — fix(g09): preserve current login after stale App Link
Status: VERIFIED repository merge
<!-- auto-memory: pr=1080 merge=55d2eeecdf55a24b058da003e02842791606f978 -->
Task: Merge PR #1080 into `main` — fix(g09): preserve current login after stale App Link.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/net/auth/native_auth_start.gd`
- `godot-client/tests/test_native_auth_start_runtime.gd`
- `godot-client/tests/test_native_intent_bridge.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1080
- Merge commit: `55d2eeecdf55a24b058da003e02842791606f978`
- PR head: `434d48d9635977cd14b19bfcce542d7522624cd5`
- Merged at: 2026-10-20T12:29:05Z
- Post-merge workflow run: 39422601952
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G10 post-welcome command-reject runtime regression
Status: VERIFIED candidate
Task: Prove that a command-level reject after verified welcome does not terminate the authenticated Godot zone session.
Decisions: Extend the existing real WebSocketPeer loopback movement path only; inject STALE_CLIENT_SEQUENCE after the first move, require one reject and no close, then send a second canonical move over the same peer.
Touched surfaces: `godot-client/tests/integration/test_zone_socket.gd`.
Evidence: Candidate `51177d48fcc6c62bf704112ae97bbdd7dd889c4d`; Godot headless run 39430690336/artifact 12268216433 and Android Preview APK run 39430690262/artifact 12268301144 passed.
Learned: Command rejection is recoverable transport feedback only when runtime evidence proves both callback delivery and subsequent same-peer command transmission.
Open: Exact Memory-bearing final-head gates, shared code/security review, merge and main readback.
Next safe step: Merge only after the final head is green and reviews are clear.


### 2026-10-20 — PR #1081 — test(g10): prove command rejects keep zone session open
Status: VERIFIED repository merge
<!-- auto-memory: pr=1081 merge=41d480795507655af85ebde747511d62a763a974 -->
Task: Merge PR #1081 into `main` — test(g10): prove command rejects keep zone session open.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/tests/integration/test_zone_socket.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1081
- Merge commit: `41d480795507655af85ebde747511d62a763a974`
- PR head: `2950e9ac8dc42b79cc371494c4041ff265b0afb3`
- Merged at: 2026-10-20T13:39:04Z
- Post-merge workflow run: 39432241069
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G10 unknown post-welcome server-frame rejection
Status: VERIFIED candidate
Task: Close the authenticated Godot zone session when a post-welcome server frame is not a valid member of the versioned v5 server-message union.
Decisions: Preserve recoverable command rejects; fully validate known combat/telegraph event shapes; classify fractional, malformed-known and unknown connected frames with one `invalid_server_message` callback.
Touched surfaces: `godot-client/net/zone_socket.gd`, `godot-client/net/zone_codec.gd`, `godot-client/tests/integration/test_zone_socket.gd`.
Evidence: Baseline `6deced4696362acea759971fe65624379c8cec77` failed causally in Godot run 39438524023/job 118681885806; candidate `51d7d53e0ffcd61457afe72a5764f61591bcca0b` passed Godot run 39440410384, Determinism run 39440410395 and Memory sync 39440410932; Android Preview run 39440410672 remained the final pending gate.
Learned: Discriminator checks alone do not establish server-union membership, and lexical numeric failures need connection-phase-aware diagnostics.
Open: Android Preview and refreshed exact-head review remain pending before merge.
Next safe step: Integrate validated combat/telegraph projection in a separate G10/G11 slice.


### 2026-10-20 — PR #1082 — fix(g10): fail closed on unknown server frames
Status: VERIFIED repository merge
<!-- auto-memory: pr=1082 merge=7ad78e5aa28d1be87a9e9277d9a7243833aa0133 -->
Task: Merge PR #1082 into `main` — fix(g10): fail closed on unknown server frames.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/net/zone_codec.gd`
- `godot-client/net/zone_socket.gd`
- `godot-client/tests/integration/test_zone_socket.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1082
- Merge commit: `7ad78e5aa28d1be87a9e9277d9a7243833aa0133`
- PR head: `f14f68e083e3c12cc63a00746877f4f2d2882109`
- Merged at: 2026-10-20T14:45:33Z
- Post-merge workflow run: 39442171132
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G10 validated server-event callbacks
Status: VERIFIED candidate
Task: Deliver fully validated post-welcome combat and telegraph frames from the Godot zone transport instead of silently dropping them.
Change: `zone_socket.gd` emits typed deep-copied callbacks only after existing v5 schema validation and preserves synchronous listener-close safety plus fail-closed invalid-frame handling.
Evidence: Baseline `81778ff2894958c198f631eadea79059f83737ea` failed causally in Godot run 39448088162; candidate `5d120fc0824bcb76859be498c902155306107de5` passed the real WebSocketPeer loopback in Godot run 39448418274/artifact 12275574861 and Android Preview APK run 39448418215/artifact 12277053446.
Learned: Full wire validation is insufficient for gameplay presentation when accepted server events are discarded before the client callback boundary.
Open: Exact Memory-bearing final-head gates, shared review, merge and main readback.
Next safe step: Connect these confirmed callbacks to a bounded combat/telegraph presentation in a separate G11 slice.


### 2026-10-20 — PR #1083 — fix(g10): project validated zone server events
Status: VERIFIED repository merge
<!-- auto-memory: pr=1083 merge=f8a706c10671c8f894c53b011d16b6e1b3e0ae57 -->
Task: Merge PR #1083 into `main` — fix(g10): project validated zone server events.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/net/zone_socket.gd`
- `godot-client/tests/integration/test_zone_socket.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1083
- Merge commit: `f8a706c10671c8f894c53b011d16b6e1b3e0ae57`
- PR head: `5b25a6abc51da9b26e3922dbbdfbe9b5c42bba7d`
- Merged at: 2026-10-20T15:35:42Z
- Post-merge workflow run: 39449871667
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G11 confirmed combat notice
Status: VERIFIED candidate
Task: Make validated Aurion combat results visible in the active Godot scene.
Change: The runtime now shows self-involved confirmed combat results once, deduplicates bounded exact event identities without assuming cross-tick monotonicity, and clears presentation with the authenticated zone projection.
Evidence: Candidate `96d04095b27bc77872a39184af037a507bd689b0`; Godot headless run 39457130332/artifacts 12280623218 and 12279983580, plus Android Preview APK run 39457130263/artifact 12280777841, passed.
Learned: Combat events have a productive server broadcast, but their tick-derived sequence is not a cross-tick watermark; telegraphs still lack a productive producer and remain a separate slice.
Open: Exact corrected-head gates, shared review, merge and main readback.
Next safe step: Merge only after the corrected head is green and reviews are clear.


### 2026-10-20 — PR #1084 — feat(g11): show confirmed combat results
Status: VERIFIED repository merge
<!-- auto-memory: pr=1084 merge=594484d53533a728e324f1ea2a3c8b7162014156 -->
Task: Merge PR #1084 into `main` — feat(g11): show confirmed combat results.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/app/main.tscn`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1084
- Merge commit: `594484d53533a728e324f1ea2a3c8b7162014156`
- PR head: `5a34252831b3768c3d941a888ad9e47604cf69c7`
- Merged at: 2026-10-20T16:47:21Z
- Post-merge workflow run: 39460516812
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G11 bounded confirmed-combat notice
Status: VERIFIED candidate
Task: Remove stale confirmed combat feedback from the active Godot scene.
Change: Each accepted self-involved combat event now refreshes a two-second presentation deadline; expiry and projection reset both clear text and layout without changing Aurion combat truth.
Evidence: Baseline `047ca97eeb5174bcf3a20eb3f71be33ce75656df` failed causally in Godot run 39465336479; candidate `a26341d535cbd8927d49ee94b276902f701dfc82` passed Godot/render run 39465407832 and Android Preview run 39465407619/artifact 12285430649.
Learned: Confirmed event identity and presentation lifetime are separate; bounded deduplication alone does not prevent stale on-screen feedback.
Open: Exact documentation-head gates, shared review, merge and main readback.
Next safe step: Merge only after the final head is green and review is clear.


### 2026-10-20 — PR #1085 — fix(g11): expire confirmed combat notice
Status: VERIFIED repository merge
<!-- auto-memory: pr=1085 merge=96b792a916d20913bbff1867c689fbd20f0999db -->
Task: Merge PR #1085 into `main` — fix(g11): expire confirmed combat notice.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1085
- Merge commit: `96b792a916d20913bbff1867c689fbd20f0999db`
- PR head: `59dae7b0d1f8fc976f22c41e58356836f54cb9d5`
- Merged at: 2026-10-20T17:29:42Z
- Post-merge workflow run: 39466564712
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — PR #1086 — fix(probe): retain secret-safe runner failure stages
Status: VERIFIED repository merge
<!-- auto-memory: pr=1086 merge=6ec4953c1446feb8061dea64b12d29ebb2062e2c -->
Task: Merge PR #1086 into `main` — fix(probe): retain secret-safe runner failure stages.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-production-probe-approval-proof.yml`
- `scripts/aurion-production-probe-client.mjs`
- `scripts/aurion-production-probe-client.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1086
- Merge commit: `6ec4953c1446feb8061dea64b12d29ebb2062e2c`
- PR head: `5e536e0c3e35d6515c16820fb353790e8c05a4a3`
- Merged at: 2026-10-20T17:47:23Z
- Post-merge workflow run: 39469128103
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G11 confirmed lethal-combat feedback
Status: VERIFIED candidate
Task: Preserve Aurion's confirmed lethal combat result in the active Godot scene.
Change: Self-involved combat notices now distinguish a server-confirmed defeat from generic damage while retaining exact-event deduplication, projection reset and the two-second presentation bound.
Evidence: Baseline `0acb88f7b95b0fd26d7da6c83c063d743644ea1f` failed causally in Godot run 39473942330/job 118804914916; candidate `79c36706b4d591e723e42417f8bc421a6d078e40` passed Godot/runtime run 39474362277 and Android Preview run 39474365304.
Learned: The validated `killed` field reached the active scene but was previously discarded by generic hit wording; presentation can preserve it without becoming combat authority.
Open: Exact Memory-bearing head gates, shared review, merge and main readback.
Next safe step: Merge only after the final head is green and review is clear.


### 2026-10-20 — PR #1087 — fix(g11): preserve confirmed lethal feedback
Status: VERIFIED repository merge
<!-- auto-memory: pr=1087 merge=69d4344714fa593e3569a60807f9743c9a596f42 -->
Task: Merge PR #1087 into `main` — fix(g11): preserve confirmed lethal feedback.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1087
- Merge commit: `69d4344714fa593e3569a60807f9743c9a596f42`
- PR head: `c157a48e7d919d917b0634a536dc19f763d14c51`
- Merged at: 2026-10-20T18:30:44Z
- Post-merge workflow run: 39475390839
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — PR #1088 — fix(ops): show production approval request outcomes
Status: VERIFIED repository merge
<!-- auto-memory: pr=1088 merge=c9a5a5072f7796057c028f7df84e9007de424f24 -->
Task: Merge PR #1088 into `main` — fix(ops): show production approval request outcomes.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-production-probe-approval-proof.yml`
- `client/src/components/ProductionProbeApproval.test.tsx`
- `client/src/components/ProductionProbeApproval.tsx`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1088
- Merge commit: `c9a5a5072f7796057c028f7df84e9007de424f24`
- PR head: `8090c4772df91325f55d2b8dbb34378bafda6494`
- Merged at: 2026-10-20T18:39:20Z
- Post-merge workflow run: 39476652052
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — G11 confirmed critical-hit feedback
Status: VERIFIED candidate
Task: Preserve Aurion's confirmed critical-hit result in the active Godot scene.
Change: Self-involved combat notices now distinguish a validated critical hit from generic damage while retaining lethal priority, exact-event deduplication, projection reset and bounded expiry.
Evidence: Regression-only head `d54a628d442d784663488d3421ae93e648ee13e7` failed causally in Godot run 39482189369/job 118833305518; candidate `8de444f6f9695824876debea00b3decb1c2ee227` passed Godot/runtime run 39482447312 with artifacts 12292445810 and 12292271116 plus Android Preview run 39482447235/artifact 12290569284.
Learned: The strict combat contract already delivered `crit`; only the active presentation discarded it, so the fix remains downstream of Aurion authority.
Open: Exact Memory-bearing head gates, shared review, merge and main readback.
Next safe step: Merge only after the final head is green and both reviews are clear.

### 2026-10-20 — PR #1089 — fix(g11): preserve confirmed critical-hit feedback
Status: VERIFIED repository merge
<!-- auto-memory: pr=1089 merge=ac9496e4ed8f6eac080056a208557040d7ffbc60 -->
Task: Merge PR #1089 into `main` — fix(g11): preserve confirmed critical-hit feedback.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1089
- Merge commit: `ac9496e4ed8f6eac080056a208557040d7ffbc60`
- PR head: `d809de243d297b7450c2630235503123f37e12e9`
- Merged at: 2026-10-20T19:28:33Z
- Post-merge workflow run: 39483776510
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — PR #1090 — fix(android): serve Login app association with verified Sovereign certificate
Status: VERIFIED repository merge
<!-- auto-memory: pr=1090 merge=7ac274ba1305f155e10fdb9223de874e93fb6f5e -->
Task: Merge PR #1090 into `main` — fix(android): serve Login app association with verified Sovereign certificate.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `client/public/.well-known/assetlinks.json`
- `server/_core/vite.ts`
- `server/androidAssetLinks.test.ts`
- `server/androidAssetLinks.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1090
- Merge commit: `7ac274ba1305f155e10fdb9223de874e93fb6f5e`
- PR head: `615450ccf7b7aca6191048595d7e66898e38797d`
- Merged at: 2026-10-20T20:01:11Z
- Post-merge workflow run: 39488394933
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-20 — G11 confirmed incoming-telegraph presentation
Status: VERIFIED candidate
Task: Preserve Aurion's validated self-targeted telegraph event in the active Godot scene.
Change: The scene now subscribes to confirmed telegraphs, displays each self-targeted warning once, ignores other players, and bounds replay memory, expiry and projection reset.
Evidence: Regression-only head `52b1f4749582ebd054156ed09ebfa6808a443765` failed causally in Godot run 39490785458/job 118863085489; candidate `592966e04a8561d050b9ece12337c2fa8e4bf44d` passed Godot/runtime run 39491032929 and Android Preview run 39491033214.
Learned: The strict transport already emitted validated telegraphs, but the active scene discarded them because it never subscribed; presentation remains downstream of Aurion authority.
Open: Exact Memory-bearing head gates, shared review, merge and main readback.
Next safe step: Merge only after the final head is green and both reviews are clear.


### 2026-10-20 — PR #1091 — fix(g11): present confirmed incoming telegraphs
Status: VERIFIED repository merge
<!-- auto-memory: pr=1091 merge=2b55429c322e64f6ab6a9d3ac9ead37cd703963d -->
Task: Merge PR #1091 into `main` — fix(g11): present confirmed incoming telegraphs.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1091
- Merge commit: `2b55429c322e64f6ab6a9d3ac9ead37cd703963d`
- PR head: `44ed00d5fff70c2504f28b368040436f0134407a`
- Merged at: 2026-10-20T20:29:01Z
- Post-merge workflow run: 39492349377
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G11 confirmed self-position presentation
Status: VERIFIED candidate
Change: The active Godot scene now consumes its bounded interpolator for a visible self-position readout; welcome/new snapshots update it, stale snapshots cannot rewind it, reset removes it, and float64 presentation coordinates preserve large-world precision.
Learned: Confirmed state and interpolation were active but unused by the scene; converting valid ±64-billion-mm coordinates through `Vector2` before formatting can lose metres, so the readout needs the precision-preserving path.
Evidence: Regression-only `d13dc5cb768fe136b9f22f920014a3010aaf2948` failed causally in Godot run 39499325834/job 118892493698; review P2 on `12c8c48dac9b12195ff7bc77b6cb52544628fc2a` led to the ±60,000,000,123-mm regression; fixed `629e33d44f7e27530226e1d2df1579f48dd97cf2` passed Godot/runtime/render 39500720483, Android Preview 39500720495, determinism 39500720678 and Memory sync 39500720561.
Open: Exact Memory-bearing head gates, fresh shared review, merge and main readback.


### 2026-10-20 — PR #1094 — fix(g11): present confirmed self position
Status: VERIFIED repository merge
<!-- auto-memory: pr=1094 merge=cda7c1f4dd53a9575d31b478c6787239b15d521c -->
Task: Merge PR #1094 into `main` — fix(g11): present confirmed self position.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/app/main.tscn`
- `godot-client/projection/snapshot_interpolator.gd`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1094
- Merge commit: `cda7c1f4dd53a9575d31b478c6787239b15d521c`
- PR head: `e709a5ed08085799bc425f5a8d1150d6b6ad3a46`
- Merged at: 2026-10-20T21:38:01Z
- Post-merge workflow run: 39501938903
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-20 — G11 confirmed nearby-entity presentation
Status: VERIFIED candidate
Change: The active Godot scene now presents other confirmed players and mobs from its synchronized entity registry, updates on accepted despawns, ignores stale rewinds and clears on projection reset.
Learned: The registry was runtime-synchronized but unused by the scene, so remote entity state had no visible presentation despite valid projection.
Evidence: Regression-only `d2f87cfeeb95b607dee6b70aa8e4681d845a4442` failed causally in Godot run 39507260462/job 118919198085; fixed `8a59a80794b26ecf8585ead050b75b32d1f04773` passed Godot runtime/render 39507540778 and Android Preview/APK readback 39507540985.
Open: Exact Memory-bearing head gates, shared review, merge and main readback.


### 2026-10-20 — PR #1096 — fix(g11): present confirmed nearby entities
Status: VERIFIED repository merge
<!-- auto-memory: pr=1096 merge=83676add48bacc081de454cceb34ba91e38eda9d -->
Task: Merge PR #1096 into `main` — fix(g11): present confirmed nearby entities.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/app/main.tscn`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1096
- Merge commit: `83676add48bacc081de454cceb34ba91e38eda9d`
- PR head: `dda781e971d153054fe2fb9d9b0928a84c4bce9f`
- Merged at: 2026-10-20T22:31:23Z
- Post-merge workflow run: 39508733987
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-21 — G11 visible stale-world presentation
Status: VERIFIED candidate
Change: After one second without an accepted Aurion welcome or snapshot, the active Godot scene freezes its last confirmed position and nearby-entity counts while visibly marking both as stale; the next accepted snapshot clears the marker and rejected rewinds cannot refresh it.
Learned: Bounded interpolation already stopped at confirmed coordinates, but without freshness presentation a frozen projection was indistinguishable from a live one.
Evidence: Regression-only `894d7e8bdc856d0ada3c6013a0f50c01d33b14cf` failed causally in Godot run 39514091913/job 118941945373; fixed `400e4283810cd46e29e8efebc7bd48a63714eef5` passed Godot runtime/render 39514172835 and Android Preview/APK readback 39514172997.
Open: Exact Memory-bearing head gates, shared review, merge and main readback.


### 2026-10-20 — PR #1097 — fix(g11): mark stale confirmed world presentation
Status: VERIFIED repository merge
<!-- auto-memory: pr=1097 merge=6396ff4cd9592440a23eb62e8beb266187dedea4 -->
Task: Merge PR #1097 into `main` — fix(g11): mark stale confirmed world presentation.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `Memory.md`
- `godot-client/app/main.gd`
- `godot-client/tests/test_startup.gd`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1097
- Merge commit: `6396ff4cd9592440a23eb62e8beb266187dedea4`
- PR head: `0ad2225731f67f8c323b6b9af31583148e81bfba`
- Merged at: 2026-10-20T23:29:12Z
- Post-merge workflow run: 39515322906
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1098 — fix(ops): bound schema dump subprocesses
Status: VERIFIED repository merge
<!-- auto-memory: pr=1098 merge=0aca135c2f2f72d1bdc1ec61284a9a21509303f1 -->
Task: Merge PR #1098 into `main` — fix(ops): bound schema dump subprocesses.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `deploy/aurion-production-schema-apply-core`
- `scripts/aurion-production-schema-apply-core.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1098
- Merge commit: `0aca135c2f2f72d1bdc1ec61284a9a21509303f1`
- PR head: `441f3bec9d56e00a016df1cfbfa2cafb62f959be`
- Merged at: 2026-10-21T00:23:15Z
- Post-merge workflow run: 39521006256
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — G11 confirmed self-vitals presentation
Status: VERIFIED repository merge
<!-- auto-memory: pr=1099 merge=36959526da9eb1f9922910306713f41361214eaa -->
Change: The active Godot scene now presents authenticated self HP and stamina only from accepted Aurion combatant snapshots, marks frozen values stale, rejects rewind updates and clears them on projection reset.
Learned: A validated combatant registry is not user-visible runtime integration until the active scene consumes the authenticated self record without deriving gameplay state locally.
Evidence: PR #1099; tested head `5e07327184154148e9aa91ec0dfd92f29cd302c8`; Godot runtime/render run 39520518244 and Android Preview/APK run 39520518622 passed; exact-head code/security reviews were clear; merge `36959526da9eb1f9922910306713f41361214eaa` was read back from `main`.


### 2026-10-21 — PR #1101 — fix(ops): wait for exact-run admin probe approval
Status: VERIFIED repository merge
<!-- auto-memory: pr=1101 merge=c0229a62b7e40fa4de018f1b5c74e3093aea0b5d -->
Task: Merge PR #1101 into `main` — fix(ops): wait for exact-run admin probe approval.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `scripts/aurion-probe-bootstrap.test.mjs`
- `scripts/aurion-production-probe-client.mjs`
- `scripts/aurion-production-probe-client.test.mjs`
- `server/aurionReleaseAttestation.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1101
- Merge commit: `c0229a62b7e40fa4de018f1b5c74e3093aea0b5d`
- PR head: `452fea44ff90319e08119119b810c4a7c3c9d62f`
- Merged at: 2026-10-21T01:06:41Z
- Post-merge workflow run: 39525386897
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1102 — fix(release): request exact child run ID in production schema dispatch
Status: VERIFIED repository merge
<!-- auto-memory: pr=1102 merge=3371934a6a6bd343e1466bab09fe9182d7a193a0 -->
Task: Merge PR #1102 into `main` — fix(release): request exact child run ID in production schema dispatch.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `scripts/dispatch-aurion-schema-plan.mjs`
- `scripts/dispatch-aurion-schema-plan.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1102
- Merge commit: `3371934a6a6bd343e1466bab09fe9182d7a193a0`
- PR head: `e76ff8511fe11b1dae3640f8f6787df10b472900`
- Merged at: 2026-10-21T02:51:26Z
- Post-merge workflow run: 39535334872
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1103 — fix(release): non-locking schema fingerprints and timeout classification
Status: VERIFIED repository merge
<!-- auto-memory: pr=1103 merge=18d459e326a0af42fdb11ab399b1fe4d0a834819 -->
Task: Merge PR #1103 into `main` — fix(release): non-locking schema fingerprints and timeout classification.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-root-schema-apply-artifact-proof.yml`
- `deploy/aurion-production-schema-apply-core`
- `scripts/aurion-production-schema-fingerprint.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1103
- Merge commit: `18d459e326a0af42fdb11ab399b1fe4d0a834819`
- PR head: `1ca0ccbd0ac62380a09acd2ef6a254f555d873a6`
- Merged at: 2026-10-21T04:16:33Z
- Post-merge workflow run: 39543141539
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1105 — fix(production): fail fast on missing gameplay-session approval before zone hydration
Status: VERIFIED repository merge
<!-- auto-memory: pr=1105 merge=780a65406b0eb073fd6f8bca3ffd3a7d99ca95f5 -->
Task: Merge PR #1105 into `main` — fix(production): fail fast on missing gameplay-session approval before zone hydration.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `server/aurionProductionProbeHttp.ts`
- `server/aurionProductionProbeMariaDb.test.ts`
- `server/aurionProductionProbeStore.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1105
- Merge commit: `780a65406b0eb073fd6f8bca3ffd3a7d99ca95f5`
- PR head: `b61ddffe331d63123e3e48599e8af969b8b0e3f8`
- Merged at: 2026-10-21T05:40:10Z
- Post-merge workflow run: 39550858330
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1106 — fix(release): owner approval readiness without repeated gameplay probe execution
Status: VERIFIED repository merge
<!-- auto-memory: pr=1106 merge=9fabc3981c7c63e1e3380cd42234c4d272d07e41 -->
Task: Merge PR #1106 into `main` — fix(release): owner approval readiness without repeated gameplay probe execution.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `client/src/components/ProductionProbeApproval.test.tsx`
- `client/src/components/ProductionProbeApproval.tsx`
- `scripts/aurion-production-probe-client.mjs`
- `scripts/aurion-production-probe-client.test.mjs`
- `scripts/verify-aurion-production-gameplay.ts`
- `server/aurionProductionProbeHttp.ts`
- `server/aurionProductionProbeMariaDb.test.ts`
- `server/aurionProductionProbeStore.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1106
- Merge commit: `9fabc3981c7c63e1e3380cd42234c4d272d07e41`
- PR head: `001c9e647e8b9cef67c715671f016c7c260d5cdf`
- Merged at: 2026-10-21T06:37:00Z
- Post-merge workflow run: 39556519629
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1104 — ⚡ Bolt: Optimize array allocations in Wolfram CAG probes
Status: VERIFIED repository merge
<!-- auto-memory: pr=1104 merge=51ea43f2282d2cf86da7f0067d7f0557bcdca9e9 -->
Task: Merge PR #1104 into `main` — ⚡ Bolt: Optimize array allocations in Wolfram CAG probes.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.jules/bolt.md`
- `shared/aurionCagDesignProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1104
- Merge commit: `51ea43f2282d2cf86da7f0067d7f0557bcdca9e9`
- PR head: `e52b9086b1a1851fb24da555569a5cf712984e6f`
- Merged at: 2026-10-21T07:51:59Z
- Post-merge workflow run: 39565017219
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1107 — fix(ws): prevent oversized-frame process crash and reject unknown upgrades
Status: VERIFIED repository merge
<!-- auto-memory: pr=1107 merge=8cc92ed171bd459a75b7fa8544b91ff1c665b64a -->
Task: Merge PR #1107 into `main` — fix(ws): prevent oversized-frame process crash and reject unknown upgrades.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-ws-ingress-regression.yml`
- `scripts/tests/zone-gateway-ingress-probe.mjs`
- `server/zoneGateway.ts`
- `server/zoneGatewayIngress.test.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1107
- Merge commit: `8cc92ed171bd459a75b7fa8544b91ff1c665b64a`
- PR head: `255418e1553c9190c8e0ec969c1c6c09f74f33d7`
- Merged at: 2026-10-21T10:18:02Z
- Post-merge workflow run: 39583573814
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1109 — fix(db): fail closed without productive MariaDB authority
Status: VERIFIED repository merge
<!-- auto-memory: pr=1109 merge=f29d012dfbddf408b2f00bd05fc62d2efe9a1ddc -->
Task: Merge PR #1109 into `main` — fix(db): fail closed without productive MariaDB authority.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/aurion-production-db-gate.yml`
- `server/_core/index.ts`
- `server/_core/productionDatabaseGate.test.ts`
- `server/_core/productionDatabaseGate.ts`
- `server/db.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1109
- Merge commit: `f29d012dfbddf408b2f00bd05fc62d2efe9a1ddc`
- PR head: `cd684ef0addf24d8fb3e9d3b2ef7c1ad9c9ab91c`
- Merged at: 2026-10-21T10:41:14Z
- Post-merge workflow run: 39586400467
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-21 — PR #1112 — feat(godot/G43): kopierbare datensparsame Tablet-Diagnose
Status: VERIFIED repository merge
<!-- auto-memory: pr=1112 merge=2f813d578eabb390e6ff3bbc82f8a58e92e618a8 -->
Task: Merge PR #1112 into `main` — feat(godot/G43): kopierbare datensparsame Tablet-Diagnose.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `godot-client/app/main.gd`
- `godot-client/app/main.tscn`
- `godot-client/app/technical_diagnostics.gd`
- `godot-client/app/technical_diagnostics.gd.uid`
- `godot-client/tests/test_technical_diagnostics.gd`
- `godot-client/tests/test_technical_diagnostics.gd.uid`
- `scripts/godot/check.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1112
- Merge commit: `2f813d578eabb390e6ff3bbc82f8a58e92e618a8`
- PR head: `af4b9b55be6b335a7dbd2dc819048c6256bd51e6`
- Merged at: 2026-10-21T18:40:13Z
- Post-merge workflow run: 39654808286
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.

### 2026-10-22 — PR #1117 — bounded owner approval notification
Change: Extended admin preflight wait to configurable 2400 seconds with one best-effort HTTPS ntfy notice, full SHA/Run-ID and unchanged gameplay readiness/explicit approval guards.
Learned: Replacing the supplied probe client outright would remove existing gameplay-readiness functions; integration must be additive.
Evidence: Local Node tests 23/23 PASS; GitHub PR CI pending: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1117 (no production apply/promotion performed).


### 2026-10-22 — PR #1117 — fix(release): bounded 40-minute owner approval wait with ntfy notification
Status: VERIFIED repository merge
<!-- auto-memory: pr=1117 merge=3ea5b58ea303b4c16900b48dda00c8bc00fbeeaf -->
Task: Merge PR #1117 into `main` — fix(release): bounded 40-minute owner approval wait with ntfy notification.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.github/workflows/deploy-aurion-zone-runtime.yml`
- `Memory.md`
- `scripts/aurion-production-probe-client.mjs`
- `scripts/aurion-production-probe-client.test.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1117
- Merge commit: `3ea5b58ea303b4c16900b48dda00c8bc00fbeeaf`
- PR head: `587d57d10844087f3e918837a05ad5f56cafbc72`
- Merged at: 2026-10-22T04:04:59Z
- Post-merge workflow run: 39720368739
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-22 — PR #1111 — security: Nerva opt-in Netzwerkprüfung ohne Aurion-Release-Blockade
Status: VERIFIED repository merge
<!-- auto-memory: pr=1111 merge=40e1be29a105bb65a2f61e51e750fa4d527506c3 -->
Task: Merge PR #1111 into `main` — security: Nerva opt-in Netzwerkprüfung ohne Aurion-Release-Blockade.
Decisions: - Security-Prüfung ist advisory; keine Gameplay-, Auth-, Datenbank- oder Produktions-Authority und kein Godot-/APK-Gate. - Nie automatisch externe Ziele scannen; nur Workflow-Dispatch mit festem public-web-Profil. - Pfadfilter verhindern Production-Deploy für reinen Nerva-Sicherheitscode; gemischte Änderungen bleiben releasepflichtig.
Touched surfaces:
- `.github/nerva/README.md`
- `.github/nerva/run-nerva.mjs`
- `.github/nerva/run-nerva.test.mjs`
- `.github/workflows/aurion-nerva-security.yml`
- `scripts/aurion-release-paths.mjs`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1111
- Merge commit: `40e1be29a105bb65a2f61e51e750fa4d527506c3`
- PR head: `318a185143d20a4793eb1dc84a1815304eee8847`
- Merged at: 2026-10-22T07:33:29Z
- Post-merge workflow run: 39741324255
Learned: - Aktuelles upstream Nerva v1.75.1 (20. Oktober 2026) ist neuer als die zuvor betrachtete Version; Download ist digest-pinned.
Open: - CI-Readback und optionaler, explizit manuell ausgelöster Live-Scan stehen noch aus. Keine produktive Netzwerkerkenntnis aus Unit-Tests ableiten.
Next safe step: - Readback der CI und Review; erst danach Merge. Einen echten Scan nur separat über Workflow-Dispatch auslösen.


### 2026-10-22 — PR #1118 — ⚡ Bolt: Optimize Wolfram CAG terrain analysis queries
Status: VERIFIED repository merge
<!-- auto-memory: pr=1118 merge=5e58f4a7490cd174cbf88e31137f64a5096eb8a7 -->
Task: Merge PR #1118 into `main` — ⚡ Bolt: Optimize Wolfram CAG terrain analysis queries.
Decisions: The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.
Touched surfaces:
- `.jules/bolt.md`
- `aim296-bvh-performance-receipt.json`
- `shared/aurionCagDesignProtocol.ts`
Evidence:
- Pull request: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1118
- Merge commit: `5e58f4a7490cd174cbf88e31137f64a5096eb8a7`
- PR head: `954bada88670167fa61f3558ae2b8f3d7f63f331`
- Merged at: 2026-10-22T07:35:22Z
- Post-merge workflow run: 39741543147
Learned: Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.
Open: Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.
Next safe step: Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.


### 2026-10-22 — PR #1120 — confirmed self-vitals meters
Change: The active Godot scene now renders bounded HP and stamina meters from accepted Aurion self-combatant snapshots, ignores rejected rewinds, and clears both meters when self state or the projection disappears.
Learned: The confirmed vitals readmodel was already active at runtime; extending that presentation preserves Aurion authority without introducing client-owned gameplay state.
Evidence: Tested code head `05e0808b1c10af29e09fa77a5f32b7fc5459a724`; Godot headless/runtime/software-render run 39821748545 and Android Preview/APK readback run 39821748434 passed; final Memory-bearing PR head is re-gated before merge.


### 2026-10-22 — G12 WebSocket Handshake Retry Budget (PR pending)
Change: Native Godot recovery spends the existing bounded retry budget when a WebSocket handshake ends in `hello_timeout` or `closed` before server welcome, rather than logging out immediately or restarting retries endlessly.
Learned: A verified server welcome remains the only connection authority; a ticket without welcome must not clear the current bounded reconnect reservation. Gameplay effects are never replayed.
Evidence: Baseline main `2726c69814d868305406678b8f33a0e5620f940d`; regression first authored in commit `40cb31b12cc1f54893a198288a84d41df8857fea`, implementation on isolated branch; Godot headless and APK CI readback required before merge. Device and production verification explicitly unverified.

### 2026-10-22 — G12 invalid-welcome reconnect fail-closed
Change: During an active native reconnect, rejected protocol frames such as `invalid_welcome` now disarm the retry budget and terminate the session immediately; only `closed` and `hello_timeout` remain retryable.
Learned: Handshake recovery must classify transport loss separately from authenticated protocol validation failure, otherwise malformed server state can trigger fresh-ticket churn.
Evidence: Baseline regression head `8539edf493e9e62d3057a9c2829d1ccc9d410b92` failed causally in Godot run 39830317341/job 120004425309; fixed code head `60cc710bcb065f5e043ef9672f91ca5331d3a02c` passed Godot headless/runtime/software-render run 39830879589 and Android Preview/APK readback run 39830879563 (APK SHA256 `0408d079aa05745e0f5350a1287318343c6f9c6d81c9b79cbfda3e450e4fbc0b`); final Memory-bearing head is re-gated before merge. Device and production WSS remain unverified.


### 2026-10-22 — First native confirmed-world map / local authoring sketches (PR #1125)
Change: The active Godot startup scene now renders touch-selectable player and mob positions only from accepted Aurion zone-v5 state, refreshes inspected coordinates, preserves enemy visibility and selection in crowded/overlapping scenes, retains integer-millimetre precision at world bounds, distinguishes A/B/house sketches, rejects drag placement, and clears volatile local plans on logout.
Learned: A useful first map preserves Aurion single authority only when confirmed markers and local sketches are visually and behaviorally separated; touch gestures, marker caps and coordinate conversion are also part of the projection contract, not cosmetic details.
Evidence: Base main `9f072e5f896817044248059305a37fca420fea38`; initial exact code head `4c3ae182230907b208654469c860fa78b575384a` passed Godot headless/runtime/software-render run 39841758487, Android Preview/APK readback run 39841758917, local pack 39841758498, runtime candidate 39841758529, container proof 39841758458, determinism 39841758652 and Memory contract 39841758696. Exact-head shared review on `aa477f90a638cf02171736ad4b039d384cb3b847` identified the six interaction/precision cases now covered by the final regression; the final Memory-bearing head is re-gated before merge. No physical-device pointer or production gateway proof is claimed.

### 2026-10-22 — Native map drag pass-through (PR #1126)
Change: The active Godot confirmed-world map now passes unhandled pointer drags to its enclosing ScrollContainer while retaining its own tap inspection and local-plan handling.
Learned: Rejecting a drag inside the map is insufficient on mobile when a STOP-filtered Control prevents the parent launch card from receiving that gesture.
Evidence: Regression-only head `3043cedfb6ed957bee53e972acb6ffd4df4f23a0` failed causally in Godot run 39856109793/job 120094623336; fixed code head `230a7a9a0f3be4e9e6b9ecab8d9ae06804d2f4c2` passed Godot headless/runtime/software-render run 39856334183 and Android Preview/APK readback run 39856334197; final Memory-bearing head is re-gated before merge. Physical-device touch remains unverified.

### 2026-10-22 — Native map planning prompt persistence (PR #1128)
Change: Accepted Aurion snapshots no longer replace the visible A/B/Haus planning prompt with a previously selected entity description while local placement remains armed.
Learned: Confirmed entity records may refresh during local planning, but snapshot-driven inspection signals must not hide the still-active input mode.
Evidence: Regression-only head `a993ec8a0cf8b25a4273e602b45cac899e9936c2` failed causally in Godot run 39870818147/job 120144500559; fixed code head `e4e0803a201c7b076b3817b4c7e5c66746adf42f` passed Godot headless/runtime/software-render run 39870954747 and Android Preview/APK readback run 39870954681; final Memory-bearing head is re-gated before merge. Physical-device touch remains unverified.


### 2026-10-23 — PR #1129 — visible-only confirmed-map hit testing
Status: VERIFIED candidate
Task: Prevent empty map-edge taps from inspecting server-confirmed entities whose marker centers are outside the drawable Godot map.
Decisions: Apply the renderer's existing half-open map-bounds predicate before distance and draw-order hit resolution; keep visible edge markers, overlap priority and Aurion snapshot authority unchanged.
Touched surfaces: `godot-client/world/confirmed_map.gd`, active-scene `godot-client/tests/test_live_world_map.gd` regression.
Evidence: Regression-only `20d6b00c00b7fc808bd2d42ef256a25b1b3695c8` failed causally in Godot run 39877183226/job 120165505717; fixed candidate `7155d4e830d0816aa3dfb37d58b2bf76334499eb` passed Godot/runtime/software-render 39877458922 and Android Preview/APK 39877458897.
Learned: Marker visibility and selection must share the same bounds rule; integer-mm screen roundtrips require an explicitly visible positive-control point rather than assuming exact floating-point edge identity.
Open: Exact Memory-bearing final-head gates, shared review, merge and main readback.
Next safe step: Gate and review the exact final PR head, then merge only with no unresolved findings and read back `main`.


### 2026-10-23 — PR #1130 — initial welcome-timeout recovery
Status: VERIFIED candidate
Task: Keep an authenticated native session recoverable when its initial zone socket reaches `hello_timeout` before a verified welcome.
Decisions: Start the existing bounded fresh-ticket policy for both retryable initial handshake endings (`closed` and `hello_timeout`); invalid welcome/protocol endings still fail closed.
Touched surfaces: `godot-client/app/main.gd`, active-scene `godot-client/tests/integration/test_session_recovery.gd` regression.
Evidence: Regression-only `7dd180be354dcdccec502ad2dc6e74b012fd8df5` failed causally in Godot run 39883258813/job 120185375241; fixed candidate `7e9d2b86314a0127b16d4a980eb777b8c06a76c3` passed Godot/runtime/software-render 39883404930 and Android Preview/APK 39883404928.
Learned: The socket already classified welcome timeouts as retryable during recovery, but the controller's initial-entry predicate must use the same classification to avoid premature logout.
Open: Exact Memory-bearing final-head gates, shared review, merge and main readback.
Next safe step: Gate and review the exact final PR head, then merge only with no unresolved findings and read back `main`.

### 2026-10-23 — Godot Login SDK source.properties whitespace regression
Status: IMPLEMENTED_IN_REPOSITORY; new exact-head CI and actual signed APK pending.
Task: Fix real owner-dispatched signed-Login run 39886214133 / build job 120194930032 failing at separate SDK inspection.
Decisions: Accept surrounding whitespace on the exact SDK source.properties key before `=`, still require exactly one declaration, the unchanged locked SDK versions and required tool files; no signer, gameplay or production runtime modifications.
Touched surfaces: scripts/godot/gradle-prerequisites.mjs, scripts/godot/gradle-prerequisites.test.mjs.
Evidence: Run 39886214133 showed `Pkg.Revision must appear once` in build step 6; Validate and upstream Godot/App Link gates succeeded; signing skipped. Added realistic `Pkg.Revision = ...` NDK fixture and missing/duplicate-key rejection regressions. Fresh Godot and Android CI on this PR must confirm behavior.
Learned: Android NDK source.properties can separate the key and `=` with spaces; a key/value parser must not confuse syntax whitespace with missing SDK version.
Open: Final exact-head CI, review, merge, new pinned signer workflow and real signed APK readback.
Next safe step: Gate regression in Aurion CI, merge only when green, then update Sovereign signing source pin and trigger owner-only run.

### 2026-10-23 — Same-tick combat intent admission regression (PR #1132)
Status: VERIFIED candidate; final Memory-bearing head gates and review pending
Task: Prevent one authenticated player from committing multiple transport-admitted basic attacks or blade skills inside the same Aurion zone tick.
Decisions: Keep aurion.zone.rules.v3, historical replay semantics, deterministic tick resolution and zone-v5 wire contract unchanged; reject only a second pending live combat intent, preserve movement admission, and do not acknowledge the rejected client sequence.
Touched surfaces: server/zoneRuntime.ts, server/zoneGateway.ts, server/zoneCombatContinuity.test.ts.
Evidence: Baseline main 818e93b87d1760ebeca4e7d988b800fa6de386e7 accepted every increasing attack sequence; corrected candidate 8abe5ce030b48b824b83d07d0e509e049607db9a. Local Test Pack 39899673013 passed the 6-case combat-continuity runtime regression, actual Godot/zone-gateway/MariaDB process checks and 455 files / 2288 tests; WS ingress 39899673137, runtime candidate 39899673077, container proof 39899673078, Godot headless 39899673074, deterministic DES 39899673099 and Memory sync 39899673063 passed.
Learned: A rejected transport combat intent must be gated before admitSequence so it neither becomes canonical history nor prevents a later independently sequenced movement.
Open: Exact Memory-bearing final-head gates, shared review, merge and main readback.
Next safe step: Merge only after the final head is green and has no unresolved review findings, then read back main.

### 2026-10-23 — G12 native-auth HTTP callback generation (PR #1134)
Change: Cancelled native-auth HTTP completions are now bound to their original request epoch and cannot publish a result or open a browser after a successor request starts.
Learned: The zone-ticket client already isolated cancelled wire generations, but the preceding native start/exchange/refresh transport needed the same boundary to keep a late response from mutating the active PKCE flow.
Evidence: Regression-only head `1c6a287dc8053acb5183583f983d6508a3fdcbae` failed causally in Godot run 39905156305/job 120255316300; fixed code head `492101b26cdc0e63288cad8152e233caabcbbe20` passed Godot headless/runtime/software-render run 39905336234 and Android Preview/APK run 39905336227. Final Memory-bearing head is re-gated before merge; physical-device interruption remains unverified.

### 2026-10-23 — G12 logged-out resume restores login (PR #1135)
Change: Resuming the active Godot scene without an authenticated zone now restores the disconnected login UI instead of leaving the login action disabled; no ticket or socket is started.
Learned: A no-zone resume is logged out only when configuration is valid, native auth is idle and no authenticated/pre-welcome transport remains; each active state must retain its own fail-closed recovery path.
Evidence: Regression-only head `220d5defe422b64a569d768781c14aedd97d06a0` failed causally in Godot run 39911283493/job 120274656627. Review-corrected code head `b8cbb1083a29ca80bca16a5a8bc0eab24b5be508` passed Godot headless/runtime/software-render run 39912605561, Android Preview/APK run 39912605498, determinism run 39912605490 and Memory sync run 39912605558; final Memory-bearing head is re-gated before merge. Physical-device interruption remains unverified.


### 2026-10-23 — G12 suspended transport-close isolation (PR #1136)
Change: A late terminal callback from the socket generation intentionally discarded during Android suspension can no longer revoke healthy native auth; resume still requires one fresh ticket and verified welcome.
Learned: Discarded sockets need a monotonic generation watermark because terminal signals can arrive after resume, after a successor welcome or across repeated suspend cycles; lifecycle state and one scalar generation are too narrow.
Evidence: Regression-only head `ccfca418875fdd4fc1c4866d830390caea1d5df8` failed causally in Godot run 39923686463/job 120314764849; review-corrected code head `597779d04f941be3e8f94090fb2adadffa375f55` passed Godot headless/runtime/software-render and Android toolchain run 39926563781, Preview/APK run 39926563850, determinism run 39926563977 and Memory sync run 39926563839. Final Memory-bearing head is re-gated before merge; physical-device and production WSS remain unverified.

### 2026-10-23 — G12 invalid zone-ticket response fail-closed (PR #1137)
Change: During bounded native recovery, only an actual Aurion API transport failure retains retry state; invalid payloads, unexpected HTTP responses and authorization failures clear the reservation and terminate the native session immediately.
Learned: Fresh-ticket recovery must preserve the API boundary between transport loss and completed-response integrity failures, otherwise malformed or rejected responses cause protected request churn.
Evidence: Activated regression head `1db4975a16b84a26e5f727391baa0968e7faa630` failed causally in Godot run 39932848033/job 120345106091; review-corrected code head `9b3d35f181b4ee6661543a7bef245621a56ab92d` adds controller and API-runtime coverage. Final Memory-bearing head is re-gated before merge; physical-device and production WSS remain unverified.

### 2026-10-23 — G12 WebSocket hello-send recovery (PR #1138)
Change: A native socket that opens but cannot send its authenticated hello now spends the existing bounded fresh-ticket recovery budget instead of immediately revoking healthy auth.
Learned: Pre-welcome transport classification must include the actual hello-send boundary; unlike invalid server frames, a failed local send carries no authenticated server response and is safe only under the same finite retry cap.
Evidence: Regression-only head `cf2d586bb6fddce36091a59892e6d692ac453057` failed causally in Godot run 39938317972/job 120363254334; implementation head `f35a96f57e40d42fab198ed8f8f0082809e6824f` passed the Godot headless/runtime/software-render contract in run 39938726550. Final Memory-bearing head is re-gated before merge; physical-device and production WSS remain unverified.

### 2026-10-23 — G12 synchronous socket-open recovery
Status: VERIFIED candidate integration
Task: Keep healthy native auth alive when the zone WebSocket cannot begin opening before any server response.
Decisions: Classify only the validated ticket path's synchronous socket-open failure as bounded pre-response transport loss; invalid ticket, server/protocol and exhausted-retry paths remain fail-closed.
Touched surfaces: `godot-client/app/main.gd`, active-scene G12 recovery regression.
Evidence: PR #1139; causal red `8c5205550d122a47583119da9d9aef5b3cd5645a` run 39945163285/job 120385922873; corrected implementation `09b139ee45bcfaee4b7864d83856cd0c543030b7` passed Godot/runtime/software-render 39945341612 and Android Preview/APK 39945341168.
Learned: A local `connect_to_url` setup failure consumes the one-time ticket but says nothing about session validity, so it belongs to the same bounded fresh-ticket recovery as pre-welcome transport loss.
Open: None beyond exact final-head gates and review.
Next safe step: Verify the Memory-bearing exact PR head, complete shared review, merge, and read back `main`.

### 2026-10-23 — G12 synchronous ticket-start exhaustion (PR #1140)
Change: A protected ticket request that synchronously refuses to start without emitting a failure now consumes the existing bounded recovery budget and terminates the native session cleanly when that budget is exhausted.
Learned: The controller must distinguish an API failure already classified by a synchronous signal from a bare false return; otherwise the latter leaves a phantom pending request and disabled login after the final attempt.
Evidence: Regression-only head `d36519ae8c40f841671d153afe95e4a2df07550c` failed causally in Godot run 39960142460/job 120435797800; implementation head `9af008452ccb71d08db7bcdb9c167d368f18f9c0` passed active-scene session recovery, startup and software-render checks in run 39960326772/job 120436415548. Final Memory-bearing head is re-gated before merge; physical-device and production WSS remain unverified.

### 2026-10-23 — G12 initial ticket-start refusal recovery
Status: VERIFIED candidate
Task: Prevent the first protected zone-ticket start after successful native auth from hanging when the API refuses synchronously without emitting a failure.
Decisions: Clear the phantom pending flag and classify only callbackless start refusal as bounded pre-response transport loss; synchronously signaled API failures retain their existing fail-closed callback path.
Touched surfaces: `godot-client/app/main.gd`, `godot-client/tests/integration/test_session_recovery.gd`.
Evidence: PR #1141; causal-red head `504204c859cc4f4ce8a2d775c1e7baa338e3c233`, Godot run 39968449600/job 120464420110 failed the two new active-scene assertions; fixed candidate `7128b6be1440cc2d03b15e5f31cf6a36586dfebc`, Godot/runtime/software-render and Android toolchain run 39968766948 plus Preview/APK run 39968766999 passed.
Learned: The initial ticket request and reconnect ticket requests share the same synchronous-start boundary; both must distinguish a callback-classified failure from a silent refusal before mutating recovery state.
Open: Exact final-head gates, shared review, merge and main readback remain required.
Next safe step: Re-run all required checks on the Memory-bearing final head, resolve review findings, then merge only with exact-head evidence.

### 2026-10-23 — G12 suspended auth-completion recovery (PR #1142)
Change: A native auth exchange that completes while Android is paused no longer starts a protected zone-ticket request in the background; it reserves restore and requests exactly one fresh ticket after resume.
Learned: Suspension can begin before native auth owns protected authority, so the lifecycle must allow a successful in-flight exchange to promote that pause into a restore-required session.
Evidence: Regression-only head `5da1ff0cffb28b053aeba1310994f5327d541a47` failed causally in Godot run 39977310364/job 120495188989; corrected code head `75dc890588c78d965369ba407dede44dea9dd3df` passed Godot/runtime/software-render and Android toolchain run 39977871316 plus Preview/APK run 39977871398. Final Memory-bearing head is re-gated before merge; physical-device interruption and production WSS remain unverified.

### 2026-10-23 — G12 suspended auth-terminal UI isolation (PR #1143)
Change: Native-auth failure and logout completion callbacks received while Android is paused keep the login action disabled; foreground resume alone restores the idle login UI without starting a protected connection.
Learned: Terminal auth callbacks can arrive after the OS pause boundary, so logged-out UI availability must remain lifecycle-gated even though local authority has already been cleared.
Evidence: Regression-only head `cbefa6f7aa7caf3bba3c41b466a51220b926bce3` failed causally in Godot run 39985999109/job 120525230455; review-corrected code head `0c3092c3b93b748ad4f1f372a10664a2600366b8` passed Godot/runtime/software-render and Android toolchain run 39987244375, Preview/APK run 39987244437, deterministic pattern 39987244552 and Memory sync 39987244674. Final Memory-bearing head is re-gated before merge; physical-device interruption remains unverified.

### 2026-10-23 — G09 generated Android Login App Link
Change: Register the Android export hook so the native callback filter survives Godot's generated release overlay; reuse one XML source and add a real unsigned Login APK/manifest CI regression without signing credentials.
Learned: A patched src/main template is insufficient because Godot's generated launcher uses mergeOnlyAttributes; only the packaged APK establishes the callback contract.
Evidence: Owner run 39989532413 rejected the actual missing filter before apksigner; regression-only head e81fb201e599b9cc80a83bc10cb070bd458f3a02 failed causally in Android run 39992835000/job 120548684600 (0 VIEW filters, expected 1). Focused local contracts pass; final exact-head Godot/Android CI, owner signing, artifact readback and device login remain required.

### 2026-10-23 — G12 suspended auth-start success UI isolation (PR #1145)
Change: A native-auth start response received while Android is paused preserves its callback transaction without exposing cancellation in the background; resume restores “Abbrechen” only while the browser callback is pending, never during its exchange request.
Learned: The callback transaction spans two UI states under one awaiting flag, so lifecycle resume must also consult the native request boundary before restoring interaction.
Evidence: Original regression head `e151e42d9c476c6955004547ba730fd72701b5f2` failed in Godot run 40002179714/job 120580821276; review regression head `aa41d1a8a75fd7f87b3a07778c2a2a55f6211820` failed causally in run 40010325367/job 120608733299; corrected code head `61de554c13a1610004281a7137f1aa1bbf6e5caf` passed the Godot runtime/software-render contract job 120609720469. Final Memory-bearing head is re-gated before merge; physical-device interruption remains unverified.


### 2026-10-23 — G12 suspended terminal-logout restore cancellation (PR #1146)
Change: A terminal logout or native-session failure received while Android is paused now cancels the reserved protected-session restore without ending suspension early; foreground resume returns directly to idle login instead of arming reconnect against revoked authority.
Learned: Clearing reconnect state is insufficient because the lifecycle owns a separate pending-restore reservation that survives terminal auth callbacks.
Evidence: Regression-only head `603163444430368a2566a80970e8198587c2eb46` failed causally in Godot run 40018063075/job 120635162163; corrected code head `a451d8e978e30ddd1681dc064012ba12d9af2261` passed the active-scene Godot runtime/software-render contract in run 40018341005. Final Memory-bearing head is re-gated before merge; physical-device interruption remains unverified.


2026-10-24 · PR #1148 · Home leaderboard privacy and committed-schema runtime gate
Change: Home now opens an anonymous leaderboard backed by an account-free public projection; guest browser errors stay strict and its MariaDB gate applies only committed migrations while covering leaderboard server changes.
Learned: A public readmodel needs both field-level privacy and an exact-head browser/database gate whose path filters include the server query boundary.
Evidence: RED e7c48d73631ac99bfd3c54cdb396a5305b38ad94; verified code head 58fa2fa093880943de01a19d7e06b56f76743ca2 passed all 27 workflows, including Home/MariaDB/strict-console run 40053583748, Local Test Pack 40053583715, runtime candidate 40053583826 and container proof 40053583688; final Memory-bearing head is re-gated before merge.


2026-10-24 · PR #1147 · Zone-tick mob-target view reuse
Change: The authoritative zone tick now reuses one zone-owned array when excluding the reserved production probe from mob-FSM targeting.
Learned: Allocation evidence must exercise the real tick path and compare both reference churn and the exact filtered result; source-level removal of `.filter()` alone is insufficient.
Evidence: Verified code head `ee5a185f64064d247e641ae74e3c593350257116` passed all eight workflows; Local Test Pack run 40061837291 proved 256 legacy filter arrays versus one reused runtime view with identical user IDs across 256 real ticks, alongside the full repository suite. Runtime candidate 40061837337, container proof 40061837265, production probe 40061837303 and deterministic DES 40061837286 also passed; final Memory-bearing head is re-gated before merge.

### 2026-10-24 — Native consent form Origin policy
Status: VERIFIED local browser contract; device/runtime fix UNVERIFIED.
Task: Investigate the real Android consent REQUEST_INVALID report without issuing live auth transactions.
Decisions: Override Referrer-Policy with strict-origin only on the browser consent document; preserve strict Origin/CSRF/session checks and callback no-referrer. Android process-death recovery remains a separate client gap, not fixed by PRs #1145/#1146.
Touched surfaces: server/nativeAuthHttp.ts, its HTTP regression, scripts/native-auth-browser-origin.test.mjs and existing isolated Local Test Pack browser step.
Evidence: Actual Chromium 151 navigation using the source renderer and guard failed before the change (Origin null) and passed afterward (canonical Origin, origin-only Referer); six hostile-header cases rejected; zero production requests. Full HTTP/Vitest/MariaDB CI and physical device outcome remain UNVERIFIED. No merge or deployment.
Learned: Manually adding Origin in Node HTTP tests cannot establish browser-generated form headers; pending PKCE/State held only in process memory cannot survive Android process death.
Next safe step: Review the minimal server fix and run the existing HTTP/MariaDB gates; separately design Keystore-backed, bounded one-time pending-login recovery and test real Android process death.

### 2026-10-24 — G09 orphaned native callback drain (PR #1150)
Change: Android cold-start now consumes Aurion's canonical auth callback when process death removed the in-memory PKCE transaction, without forwarding it as authentication or touching unrelated intents.
Learned: Fail-closed process-death handling still requires the active startup path to drain the OS intent; retaining it cannot restore PKCE and risks carrying stale callback material into a later attempt.
Evidence: Regression-only head `276faef3ea8728570b7226d635acd9e0f2cfca18` failed causally in Godot run 40073756795/job 120812597944; fixed code head `d993fcc4af749bfcd82207de2cae5ebf7d9e2f78` passed Godot headless/runtime/software-render run 40073901229 and Android Preview/real unsigned Login APK run 40073901265. Final Memory-bearing head is re-gated before merge; physical-device process death remains unverified.

### 2026-10-24 — G09 JNI-Aktivität für Native-Auth-Rücksprung
Änderung: Die Android-Intent-Brücke initialisiert die Activity über Godots `has_java_method("getActivity")`; fehlende JNI-Fähigkeit oder Activity bleibt gesperrt. Keine Credential-Persistenz oder Änderung des PKCE-/Callback-Vertrags.
Erkenntnis: Der falsche Object-Methodenguard ist in APK `9e8c8593` und Basis `24fe3944` vorhanden; direkt injizierte Activities verdeckten ihn. PR #1150 leert nur verwaiste Cold-Start-Callbacks.
Evidence: Kausales RED `efc1b38f018896559880bcfeab7b8f01460a4ab5`; danach lokal Godot 4.6.3: acht Headless-Skripte sowie HTTP-Start/Exchange/Refresh/Logout bestanden, 16 Node-Vertragsprüfungen bestanden. JNI-artige Fixture prüft Initialisierung, warmen Rücksprung, UI-Austausch und Replay; kein Android-Gerätebeleg. Gepinnte 4.7.2-/APK-CI und Tab-A9-Login bleiben bis echtem Readback UNVERIFIED. Neue APK erforderlich; Prozessverlust bleibt separate Diagnose.
CI-Erkenntnis: Godot 4.7.2 auf `b66ca87c` bestand Run 40080109327; Run 40080109393 verifizierte die Login-APK, scheiterte danach mit ENOTEMPTY im temporären Gradle-Verzeichnis. Begrenzte Node-Löschwiederholungen beheben das separat reproduzierte Rennen; dauerhaft konkurrierende Schreibzugriffe bleiben Fehler. Finaler Head wird erneut vollständig geprüft.

### 2026-10-24 — G14 Originalmodelle für die 3D-Spielwelt
Änderung: Zwölf Original-GLBs sind mit Content-IDs, kanonischen Zuordnungsquellen und Herkunft inventarisiert; Godot prüft Geometrie, Materialien, Bones, Transformtreue und Bewegung aller 16 Clips. Die Punktkarte bleibt nur früher Verbindungsnachweis; Ziel ist die echte 3D-Welt samt Aurion-Authoring.
Erkenntnis: Clipnamen und automatisch gerahmte Bilder reichen nicht. Statische Clips, falsche Quellhashes und Transformdrift müssen scheitern; nichttriviale Testhierarchien prüfen Rotation/Skalierung auch bei identischen Originalmatrizen.
Evidence: Codehead `3a89b4c92eff83d4bd95917b752b5aa7cf9fd3d7`, echter Godot-4.7.2-Import-/Software-Renderlauf 40088742243 und unabhängig heruntergeladenes Artefakt 12558410719 (ZIP SHA256 `7b2ccbe882d06c235065d604a44c86a65df48e6cf829a951c0de80d979e3ca16`, 14 PNG-Hashes geprüft). Lokale Erweiterung `b4e06e09` bestätigt die synthetische Transformhierarchie. Finaler Memory-Head wird erneut vollständig geprüft; Live-3D-Welt und Android-Leistung bleiben offen.

### 2026-10-24 — G15 deterministische Godot-Asset-Ausgaben
Änderung: Die zwölf G14-geprüften Original-GLBs erhalten einen fail-closed, byteidentischen Godot-Kompatibilitätszweig mit nicht verlinkten content-adressierten Outputs sowie vollständig quellgebundener Asset-Governance; Originale und Web-Shipping bleiben unverändert.
Erkenntnis: Bytegleichheit allein belegt keine unabhängige Generated-Schicht: Runtime-Evidence muss zusätzlich Dateityp, Realpfad und sämtliche Governance-Metadaten gegen den auditierten Quellrecord prüfen.
Evidence: Codehead `a50511ecb14a3f121064e3e4785ec87414a16a80`; alle neun Workflows grün, darunter 40098042828 mit zwei stabilen Vorbereitungen, Symlink- und Governance-Negativkontrollen, 12 Hashgleichheiten, Godot-4.7.2-Import von 16 bewegten Clips und llvmpipe-Render. Finaler Memory-Head wird erneut vollständig geprüft.

### 2026-10-24 — G11 bounded confirmed map-marker interpolation (PR #1155)
Change: The active Godot map now renders and hit-tests confirmed player and mob markers through the existing 100 ms snapshot interpolator while preserving raw integer-mm Aurion records for inspection and local plans.
Learned: Capturing interpolation without feeding its visual positions into the map leaves a real runtime integration gap; marker presentation needs a separate visual cache so smoothing cannot mutate confirmed truth.
Evidence: Regression-only head `ed5e67e4b292e679988bcd65676ffdcb1d4c9940` failed causally at missing `marker_screen()` in Godot run 40106349849/job 120908725113; verified code head `4f5352c2e4a1f1ff7efbcec5c26f35bd298d57c7` passed the pinned Godot 4.7.2 active-scene/runtime/software-render run 40106478690 and 3D asset audit 40106478688. Final Memory-bearing head is re-gated before merge.


### 2026-10-24 — G15 geprüfte 3D-Modelle in beiden Android-Exporten (PR #1156)
Änderung: Preview und Login bereiten alle zwölf Originalmodelle vor jedem frischen Export automatisch auf, laden die importierten PackedScenes mit Godot und prüfen Manifest sowie exakt diese SCN-Bytes anschließend im APK; Signieridentität und App-Link-Vertrag bleiben unverändert.
Erkenntnis: Ein erfolgreicher Quellimport garantiert kein APK-Asset. Godot exportiert GLB-Zuordnungen als `.glb.import`; Präsenz oder ein gültiger Dateikopf allein belegen keine korrekte Modellzuordnung.
Evidence: Kausales RED `1309b3b4029c8d3b60ee338c7050b914d3b8b2a3`, Run 40106978837/Job 120910587582 (`PACKAGED_ASSET_MANIFEST_MISSING`). Codehead `091ed1e21bc17a356904b4ca033b169eee81b258`, APK-Run 40107803692/Job 120913019393: 40 Regressionen, zwei frische Imports mit je zwölf Modellressourcen und 16 bewegten Clips, gleiche Manifest-SHA256 `280631abddea6904bffa5cad22933b8054aedd86d3f2dbb63682e817f1c1760b`. Finaler Memory-Head wird erneut vollständig geprüft; Live-3D-Welt, produktive Neusignierung und Geräteleistung bleiben offen.

### 2026-10-24 — G11 sequenzgleicher Mehrclient-Projektionsnachweis (PR #1158)
Änderung: Der echte Godot/Gateway/MariaDB-Test durchläuft nun ZoneState, EntityRegistry und SnapshotInterpolator; sein bestätigter Zustand wird einschließlich aller Entitätskategorien mit dem unabhängig empfangenen Snapshot des zweiten Clients derselben Sequenz verglichen.
Erkenntnis: Zwei beobachtete Bewegungen belegen noch keine identischen Projektionen. Die 100-ms-Darstellungsgrenze braucht eine eigene Assertion am tatsächlichen Empfangszeitpunkt; ein später Endpunktvergleich allein reicht nicht.
Evidence: Lokal mit gepinntem Godot 4.7.2: Import, Skriptprüfung und bestehende Registry-/Interpolationstests bestanden. Beide unabhängigen Reviews sind nach expliziter Prüfung der 100-ms-Grenze ohne verbleibenden Befund. Codehead `30ade9a0452ce87a91e7ad0d3f694719ac8b0b2a`; finaler Memory-Head benötigt den vollständigen isolierten Gateway-/MariaDB-Lauf und sämtliche zugehörigen CI-Gates vor Merge. Dies ist kein Produktions-, Geräte- oder Live-3D-Nachweis.
