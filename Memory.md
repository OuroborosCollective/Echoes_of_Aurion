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

### 2026-10-03 — Deterministic Aurion starter-village layout
Status: VERIFIED repository regression
Task: Replace seed/catalog-cyclic starter-village placement with an Aurion-owned fixed-point layout while preserving the established spawn and return-stone position.
Decisions: Reference the immutable return-stone position directly; define the centre, ring road, four cardinal axes and exactly four gate anchors in millimetres; mark the pilot as a partial set and fail closed for any future closed-wall plan without all four geometric openings. Use only admitted world-catalog IDs and keep the client as a view-only projection of the authenticated server region.
Touched surfaces: `shared/aurionStarterVillageContract.ts`, `shared/worldAssetProtocol.ts`, `server/aurionStarterVillageContract.test.ts`, `server/worldAssetProtocol.test.ts`, `client/src/xaurion/integration/WorldAssetProjection.ts`.
Evidence: `pnpm vitest run server/aurionStarterVillageContract.test.ts server/worldAssetProtocol.test.ts server/worldNatureCollision.test.ts` passed 17 tests; `pnpm check` passed; `pnpm test` passed 378 files / 1,841 tests with 55 files / 207 environment-dependent tests skipped. Browser screenshot capture was attempted after installing the matching Playwright Chromium but the container lacks `libatk-1.0.so.0`, so no screenshot is claimed.
Learned: The origin chunk must be selected from a named Aurion geometry contract before the generic seeded catalog lane; the renderer can then remain generic and cannot invent or close village geometry.
Open: No deployment, native GPU, persistence or production-runtime claim is made. Visual browser readback remains unavailable in this container because the installed Chromium cannot start without the system ATK library.
Next safe step: Review and merge the exact tested revision, then use the automated post-merge Memory/readback workflow; obtain browser/native visual evidence in an image that includes Chromium runtime libraries if required.

### 2026-10-03 — PR 734 geometric review corrections
Status: PARTIAL — local regressions verified; exact-head CI pending
Task: Review ac86c6e7c74db7ab0ce015e70688725d4829a492 and repair demonstrated layout and browser-count regressions.
Decisions: Reserve the 16–20 m ring corridor using all-LOD catalog bounds; move the four landmarks to fixed ±22 m anchors. The ring is a reserved layout corridor, not a rendered road surface. Reject every closed-wall request until geometric passage evidence exists; four caller-supplied IDs are not evidence. Retain the explicit decorative partial set and existing non-colliding city-asset policy.
Touched surfaces: Starter-village contract/tests, world-asset JSON import attributes for native ESM test loading, exact server-plan browser assertion and relevant workflow path filters.
Evidence: Original source-bound GLB audit found 1,341 market and 72 southeast-hut LOD0 vertices inside the ring corridor. Original collision readback returned zero origin obstacles and clear four-axis sweeps; no blocked gate is claimed. Corrected focused tests: 18 passed. Full suite: 378 files / 1,842 tests passed, 55 files / 207 environment-dependent tests skipped. Typecheck passed before final ESM-only adjustment; final check recorded in review logs. Playwright discovers all three phone/tablet/desktop cases; real runtime execution remains CI evidence, not a local claim.
Learned: Placement-center tests miss footprint intersections; a catalog ID and a named open gate do not prove collision geometry.
Open: Real MariaDB/browser CI must pass on the final head. No production, native GPU, closed-wall or rendered-ring claim.
Next safe step: Push this reviewed correction, inspect exact-head CI and only then decide merge.

### 2026-10-03 — Canonical starter-village quest NPC contract
Status: VERIFIED repository regression
Task: Add the north-gate guard to Aurion's canonical NPC/quest-giver boundary without introducing a parallel authority.
Decisions: A typed Aurion starter-village contract now owns the allowlisted quest NPC identities, display names, zones and fixed-point positions. Dialogue routing and command persistence consume that allowlist; quest mutation authorization still requires the owned dialogue-command receipt and server-confirmed AOI presence. Aurion remains the sole quest/combat owner; WASD is historical provenance only.
Touched surfaces: `server/aurionStarterVillageContract.ts`, `server/questNpcAuthority.ts`, `server/questNpcAuthority.test.ts`, `server/wasdAurionDialogueQuestIntentProtocol.ts`, `server/wasdAurionDialogueQuestIntentProtocol.test.ts`, `server/routers.ts`, `server/db.ts`, `Memory.md`.
Evidence: `pnpm vitest run server/questNpcAuthority.test.ts server/wasdAurionDialogueQuestIntentProtocol.test.ts server/dialogueQuestIntent.e2e.test.ts` passed 13 executable tests; the 3 MariaDB-dependent E2E cases were skipped because `DATABASE_URL` is unset. `pnpm check` passed. `pnpm test` passed the full local suite; environment-dependent database cases remained skipped. The focused regressions reject a wrong guard, player, quest, action, zone and out-of-radius position and reject arbitrary client NPC IDs.
Learned: Quest NPC identity, display-name mapping, zone and AOI anchor must be one typed Aurion contract; widening only the transport schema would admit unowned identities or leave persistence and authorization divergent.
Open: No production deployment or MariaDB runtime claim is made. The repository environment had no `DATABASE_URL`, so the existing real dialogue persistence E2E suite remained skipped.
Next safe step: Run the existing dialogue intent MariaDB E2E lane against the exact committed head before deployment and retain the contract as the only source for future starter-village quest givers.

### 2026-10-03 — PR 735 shares the reviewed north-gate anchor
Status: VERIFIED focused repository regression
Task: Integrate the corrected PR 734 layout before the NPC identity contract.
Decisions: Preserve all append-only Memory entries; reference the north gate point directly instead of retaining the separate -12 m guard anchor 18 m away. Existing Lyra/Orun authority stays unchanged.
Touched surfaces: server/aurionStarterVillageContract.ts and server/questNpcAuthority.test.ts.
Evidence: 19 focused tests passed; 3 real-MariaDB tests skipped locally; nonincremental TypeScript check passed. Identity-by-reference regression binds the guard position to the shared north gate.
Learned: A named north-gate NPC needs the same fixed-point anchor as the actual village contract.
Open: Dependent exact-head CI and real dialogue persistence readback remain pending; this NPC contract alone does not implement the wolf quest.
Next safe step: Push and verify CI; merge only after PR 734.

### 2026-10-03 — Receipt-bound pilot wolf quest
Status: VERIFIED repository regression; runtime deployment pending
Task: Publish the versioned north-gate pilot quest through the canonical quest compiler and derive its six-victory objective only from persisted Aurion combat evidence.
Decisions: Register `starter-wolves-6` v1 with stable giver `guard-north`; add no quest state machine; bind one increment to one unique persisted combat receipt whose event, player, opponent identity/species, confirmed victory and logical revision pass the strict shared contract; preserve the existing quest receipt/instance persistence transition.
Touched surfaces: Quest contract, event matcher, pilot template/role catalog, admin service, combat-victory persistence schema/migration and focused regressions.
Evidence: Focused quest/validator/migration-boundary suite passed 13 tests; `pnpm check`, `pnpm verify:migrations` (70 SQL / 70 journal entries) and `git diff --check` passed. The focused admin regression proves unknown, mismatched-player/species and duplicate receipts cannot increment; exactly six receipts complete, and a seventh leaves progress at six.
Learned: Objective quantity is safe only when the server reads a unique durable combat receipt and supplies the fixed increment itself; a client event payload cannot be permitted to select species or amount.
Open: No production deployment or live MariaDB readback is claimed by this repository candidate.
Next safe step: Run exact-head CI/container and an isolated migrated MariaDB readback before merge or deployment claims.

### 2026-10-03 — Receipt-bound authored quest item reward
Status: VERIFIED repository regression; real MariaDB execution unavailable in this workspace
Task: Grant one approved catalog item exactly once when the canonical authored caravan quest is turned in.
Change: The quest definition records `component-craft-star-iron-v2` from the existing Aurion Loot V2 catalog. `causalClosure.ts` now derives a deterministic inventory grant bound to quest instance, completion receipt, player and reward definition; the quest and inventory receipt/item writes share one MariaDB transaction. Inventory `grant` uses the existing owner revision, state hash, receipt and `(userId,idempotencyKey)` uniqueness contract, with migration 0069 extending the operation enum. The protected turn-in requires the confirmed giver identity.
Evidence: TypeScript passed; migration-chain verification passed with 70 SQL/journal entries; focused quest/inventory/turn-in tests passed. Full local regression reached 1,837 passing tests and exposed one production-readback allowlist failure, which was repaired and its 24 focused readback/artifact tests then passed. The new real-MariaDB regression covers atomic receipt/item readback, lost-response replay and two concurrent turn-ins, but was skipped because this environment has neither Docker nor a configured isolated MariaDB.
Learned: Item reward identity must be established before persistence from stable catalog content and completion causality; transport retry keys alone are insufficient. The inventory receipt unique key and owner serialization make retry and concurrent completion read back the same effect.
Open: Run `causalClosureMariaDb.test.ts` in the isolated MariaDB CI lane and verify the final exact-head workflow before merge; no production deployment claim is made.
Next safe step: Require the MariaDB lane to prove one quest receipt, one inventory receipt, one item and matching independent quest/inventory readbacks under concurrent turn-in.

### 2026-10-03 — PR 736 reviewed combat projection corrections
Status: PARTIAL — complete wolf gameplay still blocked
Task: Repair the deterministic guard binding, MariaDB confirmed constraint and missing persisted-event consumer.
Decisions: Consume PR 735's starter_village_north_gate_guard identity. Persist canonical combat evidence before invoking the quest service's independent receipt readback. Snapshot queued combat evidence alongside the tick. Spell the new CHECK as confirmed=1 to match MariaDB without loosening check comparison. Preserve the 0068 causal test requirement while validating the entire sequential journal.
Touched surfaces: Pilot template/resolver/tests, tick recorder/persistence, migration 0069, schema reconciliation regression and causal receipt migration test.
Evidence: 85 focused tests passed / 4 DB tests skipped; schema regression 16 passed / 3 skipped; TypeScript passed; full local suite 381 files / 1,856 tests passed with 207 environment-dependent tests skipped. Migration verification: 70 SQL / 70 journal entries, no duplicates/gaps.
Learned: A persisted victory alone never called the objective consumer; existing active mob definitions contain no wolf archetype.
Open: No wolf combat/spawn/asset definition is approved in the active mob contract. Authenticated pilot dialogue/offer/turn-in and durable completion evidence remain unproven. This PR is not merge-ready as a playable pilot.
Next safe step: Obtain the canonical wolf definition, complete the real product path and run exact-head MariaDB/browser evidence without substituting other enemies.

### 2026-10-03 — PR 736 closes schema dispatch and apply allowlists
Status: VERIFIED contract regressions; real apply readback pending
Task: Repair CI SCHEMA_DISPATCH_WAVE_NOT_AUTHORIZED and 0069 ABSENT_APPLY_REQUIRED caused by operational allowlists still ending at 0068.
Decisions: Advance dispatch wave and all apply/reconcile artifact/backup/readback allowlists to the same 0069 combat migration; preserve approval, exact-source and production-write guards.
Touched surfaces: deploy apply core and both artifact verifiers, scripts/dispatch-aurion-schema-plan.mjs, corresponding artifact fixture.
Evidence: Four node dispatch-contract tests passed; 50 schema/readback/apply/reconcile/blocker contract tests passed; git diff --check clean. Earlier full suite remains 1,856 passed / 207 skipped, not a claim that this newly changed head ran real MariaDB yet.
Learned: Journal/manifest updates alone do not advance the operational apply bundle.
Open: Real 0069 schema readback, restart-safe victory projection, genuine wolf content and authorized pilot completion remain required.
Next safe step: Run isolated MariaDB and exact-head CI, preserving failure evidence.

### 2026-10-03 — PR 736 durable combat projection recovery
Status: PARTIAL — durable observer replay verified; full pilot hand-in integration pending
Task: Recover persisted combat victories after projection failure or restart without counting them for quests accepted later.
Decisions: Persist original active quest target IDs with victory evidence and a projection acknowledgment. Drain unacknowledged evidence on subsequent persisted ticks, including after restart. Acknowledgment follows all target commits; existing receipt idempotency absorbs lost acknowledgments. Repeated offers preserve existing progress instead of overwriting the deterministic instance.
Evidence: Real isolated MariaDB test passes after injected post-commit failure and service re-creation, proving one increment and no credit to a subsequently accepted quest. Focused suite:76 passed,1 skipped; full suite:381 files/1856 tests passed,208 skipped; TypeScript passed. CI Local Test Pack now explicitly executes the real outbox test. Migration0069 remains unmerged and is extended with outbox metadata.
Open: Actual wolf content and the authenticated pilot hand-in causal chain remain to be integrated. No deployment or complete-pilot claim.
Next safe step: Integrate the updated main baseline and finish authenticated integration before merge.
### 2026-10-03 — PR 734 exact-head CI readback and memory queue isolation
Status: PARTIAL — new exact-head CI required
Task: Preserve independent PR verification while main memory sync stays serialized.
Decisions: Give PR memory-contract runs per-PR concurrency groups; the previous global group canceled pending PR 734 verification when another PR was pushed despite cancel-in-progress=false. Main sync retains one shared group. No production sync behavior or credentials changed.
Touched surfaces: .github/workflows/agent-memory-supabase-sync.yml.
Evidence: At 6cb6a5d33fd76bde8cfe4260791c085eefecc429, Aurion Local Test Pack succeeded, and AIM259 job 111129801561 passed the real database and phone/tablet/desktop browser lane plus NPC readback. The GLB upload lane failed at unchanged glbImport.spec.ts:52 (wheel-scroll bottom assertion); one diagnostic retry was requested. The memory run 37097323346 was canceled before any job and GitHub refused its failed-job rerun. Final source typecheck and 18 targeted tests had passed.
Learned: GitHub replaces a pending run in a concurrency group even when cancel-in-progress=false; unrelated PRs must not share the main memory queue.
Open: New head must receive all applicable successful CI; no merge or production claim yet.
Next safe step: Read back the independent PR CI results before merge.

### 2026-10-03 — PR 734 shipping browser integration
Status: PARTIAL — exact-head browser CI required
Task: Repair the shipping test's dependency on a procedural foundation removed from the origin by the fixed village layout.
Decisions: Keep the village contract unchanged. Read the authenticated region, verify the existing shipped nature-root placement, and reach a safe viewing point using server-confirmed keyboard movement before rotating the real camera. Preserve all KTX decode, actual draw, fallback and resource assertions.
Evidence: On ca363702, tablet shipping failed at aim291.assetShipping.spec.ts:70 with zero KTX models; the old test assumed a foundation at (-8m,+24m), absent from the new authoritative origin. Region readback locates nature-root-1 at (-40m,+8m). Typecheck and Playwright discovery passed locally; real exact-head CI remains required.
Open: No merge or new production claim. The following head must pass the full shipping lane.
Next safe step: Inspect exact-head browser results before merge.
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

### 2026-10-03 — PR 738 migration and immutable reward-template integration
Status: PARTIAL — authenticated completion route remains blocked
Task: Integrate reviewed village/combat/progress changes and repair duplicate migration 0069 plus in-place quest-version mutation.
Decisions: Preserve combat migration 0069 and move inventory reward migration to 0070 with journal index 70 and later timestamp; synchronize manifest, artifact/readback allowlists and tests. Preserve caravan v1 verbatim; expose reward-bearing v2 as inactive for explicit authoring activation. Bind the still-unmerged six-wolf pilot to the same existing catalog reward: one component-craft-star-iron-v2. The real-MariaDB closure fixture explicitly activates v2 instead of silently rewriting v1.
Touched surfaces: Migration/schema/artifact contracts, quest template versioning and tests, pilot reward and integrated PR 737 receipt-sequence narrowing.
Evidence: Migration verifier 71 SQL / 71 journal entries, sequential indices and no duplicate prefixes. Focused suites: 119 tests passed / 1 DB test skipped. Nonincremental TypeScript passed. Full local suite: 383 files / 1,864 tests passed; 55 files / 207 environment-dependent tests skipped.
Learned: Hydrating an existing published v1 must not erase or conflict with a changed seed of the same version. Migration IDs must be unique across the series, not merely within each original PR.
Open: Public complete route still lacks independently verified causal source/hand-in orchestration; existing low-level fixture is not route evidence. Pilot additionally depends on approved wolf runtime content and authenticated giver dialogue. No merge, deployment or successful end-to-end reward claim.
Next safe step: Complete the canonical route/evidence flow, then run exact-head MariaDB concurrency, replay, restart and browser tests.

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

### 2026-10-03 — Authenticated pilot hand-in and durable causal closure
Status: PARTIAL — real database/dialogue/closure verified; playable wolf content still absent
Task: Connect pilot offer, acceptance and hand-in to owned dialogue commands, canonical north-guard AOI and durable six-victory evidence.
Decisions: Admit the pilot key only in the authored dialogue lane, preserving legacy quest enums. Bind the offer to its exact dialogue event instead of the last unrelated global event. Independently re-read the six consumed combat receipts and reject wrong species/owner/plan. Restore the accepted zone projection from its durable acceptance after restart, require a living player and confirmed zone hand-in, then use the existing world-epoch authority and causal closure. Server sequence allocation accounts for accepted and pending intents. Completed replay reuses the persisted closure.
Evidence:90 focused tests passed,1 DB case skipped in the default run; TypeScript passed. A fresh MariaDB run completed real dialogue confirmation, guarded offer/accept, injected lost projection acknowledgment, service recreation, six unique evidence rows, causal world-root/hand-in closure and idempotent completion replay. Tampered species is rejected. Its initial position and combat evidence are explicit fixtures: this is not an HTTP movement or real wolf-combat claim.
Open: No active wolf archetype/model was found; the existing expedition generator and audio cues alone do not provide a playable zone creature. Final browser journey and reward integration remain pending.
Next safe step: Integrate reward dependency, verify the exact item and restart readback, and resolve the missing creature content before merging a complete pilot.
### 2026-10-03 — Local onboarding NPC residence
Status: VERIFIED repository boundary; real final-head CI pending
Task: Keep introductory quest givers and the smith at their permanent beginner anchors without freezing visiting NPCs or the outer world.
Decisions: Gate canonical NPC persistence by identity only for Lyra, Orun, the north-gate guard and observatory_blacksmith. Reject changing their home region; generic visitors may still enter and leave. Existing needs, goals, memory and local decisions are untouched. Static service/quest projection remains present. This is a residence guard, not a new combat immortality or migration simulation.
Evidence:43 targeted tests across residence, NPC authority/life/persistence and world snapshots passed. Full suite:380 files/1861 tests passed,207 skipped. TypeScript passed. Existing outer-world and Graph/CAG/asset owners remain unchanged.
Open: Final CI must verify the actual persisted NPC lane. No new lore, faction or origin canon is introduced.
Next safe step: Merge only after layout dependency and exact-head CI are verified.
### 2026-10-03 — Starter-region isolation and outer-world preservation
Status: VERIFIED repository boundary regressions; final-head browser CI pending
Task: Preserve deterministic world/graph/CAG generation and canonical GLB mesh/material/texture pipelines while keeping only the small starter origin constant.
Decisions: Scope remains exactly chunk(0,0), a64m origin square. No global seed, generator, identity, grid, collision-manifest, graph/CAG/Wolfram, shipping or texture/mesh pipeline is replaced. Add an independently captured pre-change digest covering eight neighboring chunks, settlement, negative/far coordinates and three seeds. Require different seed plans outside origin and identical seed-independent origin plans.
Evidence:55 tests passed across nine suites: starter/world assets, nature collision, graph CAG verifier, structure CAG verifier and world-generation evidence/parity contracts. Golden digest was computed from main909ba47d implementation, not the edited generator. PR737 merge784ce223 touches only quest code/tests and Memory, with no world/asset/CAG changes. These are repository regressions, not a claim of newly implemented autonomous world evolution or successful live Wolfram service execution.
Open: Final exact-head CI and real shipping browser regression must pass before merge.
Next safe step: Review the completed shipping lane and verify remote main after merge.
