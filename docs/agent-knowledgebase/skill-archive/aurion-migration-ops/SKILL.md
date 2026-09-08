---
name: aurion-migration-ops
description: Evidence-bound migration operations for OuroborosCollective/Echoes_of_Aurion. Use for Drizzle migration design, chain verification, production reconciliation, bounded autonomous rechecks, canonical production apply planning, runtime revision readback, regression stabilization, and causal repair of OUT_OF_SYNC or UNVERIFIED migration surfaces.
---

# Aurion Migration Operations — Truth / Recheck / Resolver Guard

This skill operates on **Echoes of Aurion** as the product owner and may coordinate with **OuroborosCollective/Wasd** only as the explicitly allowlisted source-evidence peer. Never substitute Sovereign Studio ATO or an unrelated repository/runtime for Aurion. WASD peer work is governed by the cross-repo choreography contract and never becomes Aurion production truth by assertion.

The goal is not to make dashboards green. The goal is to make repository, migration contract, production schema, deployment revision, and runtime readback describe the **same causal state**.

`references/audit-findings-2026-09-08.md` is historical provenance only. It records the baseline that motivated this skill revision and must never be used as current repository or production truth. Always run a fresh `repo-audit` and obtain fresh canonical production readback before classifying the present state.

## 1. Truth hierarchy

Use the strongest available source and never downgrade to a weaker parallel path:

1. exact Git repository revision and tracked files;
2. Aurion's canonical `pnpm verify:migrations` contract;
3. immutable production reconcile/apply artifact contracts from the same revision;
4. root-owned read-only production reconciliation receipt;
5. plan- and revision-bound production apply receipt;
6. revision-bound deployed runtime/health readback;
7. Linear/GitHub presentation state only after the evidence above agrees.

A workflow badge, test name, issue state, log word such as `green`, or agent statement is not production truth by itself.

## 2. Non-negotiable invariants

- No mock, stub, fake snapshot, fixture, synthetic receipt, or simulated service may prove production success.
- Tests may use fixtures to verify **logic**, but fixtures must never be reported as production evidence.
- Never rewrite migration history merely to make a mismatch disappear.
- Never execute arbitrary raw SQL, free-form journal writes, `DROP`, `TRUNCATE`, broad destructive cleanup, or unbound database commands from this skill.
- Never use the former Paramiko/SSH direct-apply route. It is intentionally tombstoned in `scripts/apply_migration.py`.
- Production schema mutation uses Aurion's canonical `.github/workflows/aurion-production-schema-apply.yml` lane: exact source revision + `planSha256` + OIDC + fixed root runner + backup + isolated recovery proof + apply + postflight.
- The resolver operates under `AUTONOMOUS_UNTIL_REVOKED`: it may autonomously gather evidence, repair unambiguous source/runtime drift, discover missing ledger/run bindings, rerun checks, redeploy exact revisions, and dispatch the canonical production lane. It never substitutes its own authorization for that lane; OIDC/root remains the actual write boundary.
- No per-action owner prompt is part of the happy path. A prompt is reserved only for unresolved semantic ambiguity between multiple legitimate product outcomes, not for routine operational work.
- Cross-repository evidence work with the allowlisted WASD peer is autonomous: request/recheck source evidence, verify the peer response, re-ledger Aurion, and prepare a causally owned Draft repair without per-action owner prompts. Peer direct-main push remains forbidden.
- Production readback uses the canonical root-owned reconciliation runner/artifact. Do not invent a second database truth path.
- Secrets remain on their native protected boundary. Do not copy database credentials into chat, artifacts, receipts, GitHub comments, or logs.
- A successful mutation is still **UNVERIFIED** until fresh readback proves its result.
- `IN_SYNC` requires every required surface to be proven, no `UNVERIFIED`, no `BLOCKED`, and `syncPpm == 1_000_000`.

## 3. State model — who dances and who leaves the floor

Every required surface is classified independently:

- `IN_SYNC` — expected and observed identity/state match with evidence.
- `OUT_OF_SYNC` — an observed contradiction exists and must be repaired.
- `UNVERIFIED` — evidence is missing, unreadable, stale, or not revision-bound.
- `BLOCKED` — continuing would risk corrupting data, widening authority, or falsifying provenance.
- `RESOLVING` — transient execution state while a bounded repair/recheck loop is active; never a final verdict.

Quantify every audit:

- `evidenceCoveragePpm = verified_surfaces / required_surfaces * 1_000_000`;
- `syncPpm = in_sync_surfaces / required_surfaces * 1_000_000`;
- counts for `IN_SYNC`, `OUT_OF_SYNC`, `UNVERIFIED`, `BLOCKED`;
- `danceFloor` = exact surface names currently proven `IN_SYNC`;
- `exitLane` = exact `OUT_OF_SYNC` or `BLOCKED` surfaces;
- `needsRecheck` = exact `UNVERIFIED` surfaces.

All three fields are typed lists of surface names, never booleans or free text. The exact CLI and receipt contract is in [references/cli-and-receipt-schema.md](references/cli-and-receipt-schema.md).

Do not average failures away. One required `UNVERIFIED` surface prevents global green.

## 4. Primary operator CLI

Use the bundled standard-library guard rather than ad-hoc scripts:

```bash
python3 scripts/aurion_guard.py repo-audit \
  --repo /path/to/Echoes_of_Aurion \
  --expected-revision <sha40> \
  --run-canonical \
  --output .evidence/aurion-migration-repo.json
```

This reads the real Drizzle SQL/journal chain, canonical verifier binding, production reconcile/apply artifact coverage, workflow presence, and exact Git revision. `--run-canonical` executes `pnpm verify:migrations`; if the prepared environment cannot execute it, the corresponding surface remains `UNVERIFIED` rather than being guessed green.

Classify a real root-owned production receipt:

```bash
python3 scripts/aurion_guard.py classify-production \
  --receipt /path/to/root-readback.json \
  --expected-revision <sha40> \
  --output .evidence/aurion-production-classified.json
```

Combine repository, production, and runtime evidence:

```bash
python3 scripts/aurion_guard.py resolve-plan \
  --repo-receipt .evidence/aurion-migration-repo.json \
  --production-classification .evidence/aurion-production-classified.json \
  --runtime-receipt .evidence/aurion-runtime.json \
  --plan-receipt .evidence/migration-ledger.json \
  --ledger-run-id <github-run-id> \
  --expected-revision <sha40> \
  --mode final \
  --output .evidence/aurion-migration-resolve-plan.json
```

Use `--mode diagnostic` (the default) for investigation and autonomous evidence acquisition. Diagnostic mode may read, recheck, inspect, patch unambiguous source drift in an isolated workspace, and request fresh canonical evidence, but it can **never dispatch a production mutation**. Use `--mode final` for mutation eligibility. Final mode recomputes repository/classification receipt hashes and the canonical migration-ledger `planSha256`; if a binding such as `ledger_run_id` is missing it emits an autonomous discovery/reacquisition action instead of asking the owner for another per-action approval. Actual production-write authorization remains inside Aurion's canonical OIDC/root control plane.

Coordinate WASD autonomously when peer evidence is missing, stale, or contradictory:

```bash
python3 scripts/aurion_guard.py choreograph-wasd \
  --expected-aurion-revision <aurion-sha40> \
  --expected-wasd-revision <wasd-sha40> \
  --plan-receipt .evidence/migration-ledger.json \
  --wasd-source-ledger .evidence/source-ledger.json \
  --wasd-run-id <github-run-id> \
  --causal-owner unknown \
  --output .evidence/aurion-wasd-choreography.json
```

If WASD evidence is absent, the guard emits `REQUEST_EVIDENCE` with the exact canonical
WASD workflow dispatch intent. If the verified WASD receipt no longer matches Aurion's
plan, it emits `REQUEST_RECONCILIATION`. Proven peer ownership may emit a bounded
`REQUEST_PATCH` ending at Draft PR + regressions + fresh recheck. None of these routine
steps requires a per-action owner prompt. Read
[references/cross-repo-choreography.md](references/cross-repo-choreography.md).

On the production host, a bounded **read-only** recheck is allowed only through the exact installed canonical runner:

```bash
python3 scripts/aurion_guard.py recheck-production \
  --expected-revision <sha40> \
  --cycles 3 \
  --output /var/tmp/aurion-migration-recheck.json
```

The script refuses a substitute runner path.

`endpoint_probe.py` is limited to explicit, revision-bound non-secret endpoint observations and never proves production schema truth. `server_status.py` is limited to non-secret service/container orientation and never proves deployment or schema synchronization. `apply_migration.py` is a deliberate hard-block tombstone for the removed direct SSH/SQL route. Read [references/cli-and-receipt-schema.md](references/cli-and-receipt-schema.md) before using any helper.

## 5. Autonomous Recheck & Resolving Guard

For every final `OUT_OF_SYNC` or `UNVERIFIED` surface, run this loop:

1. **Re-read the origin.** Obtain fresh evidence from the canonical owner of that surface.
2. **Classify causally.** Separate transient unreadability, source-contract drift, live schema drift, revision mismatch, and apply failure.
3. **Choose the narrowest repair authority.** Never widen permissions because a repair is inconvenient.
4. **Repair only an unambiguous target state.** The desired state must be derivable from exact repository revision + canonical contract + plan/receipt identity.
5. **Run regressions.** Stabilize the changed truth path and its nearest negative cases.
6. **Fresh recheck.** Do not reuse pre-repair evidence.
7. **Runtime/readback gate.** A source repair does not become product green until the deployed revision and production schema are read back.
8. **Bound retries.** Default maximum: three read-only rechecks. A mutation is never blindly retried.
9. **Escalate ambiguity, not inconvenience.** The guard does not ask for repeated per-action approval. It keeps resolving autonomously inside the integration policy. Only when two materially different valid product target states remain after evidence reacquisition does it surface a single semantic decision; ordinary missing evidence, run IDs, retries, CI failures, or revision readbacks are autonomous work.

### Autonomous repair matrix

| Observed state | Default resolver action | Auto-repair? |
| --- | --- | --- |
| Canonical readback `UNREADABLE_FAIL_CLOSED` | bounded fresh read-only recheck; repair exact infrastructure identity if a canonical remedy exists | Yes, read-only / identity repair only |
| Repository SQL/journal mismatch | repair source contract in isolated workspace, run canonical verifier + regressions | Yes when ownership and target are unambiguous; never rewrite live DB to hide source drift |
| Production artifact coverage trails newer journal migrations | inspect every uncovered migration for additive semantics, extend reconcile/apply artifact contracts + tests as one source change, then rebuild immutable artifact | Only after eligibility proof; never append tags blindly |
| `RECONCILIATION_REQUIRED`, no drift | recompute exact revision + plan receipt + ledger run binding; autonomously invoke canonical apply workflow; re-read | Yes through canonical control plane when all evidence bindings are valid; no per-action owner prompt |
| `PRESENT_SCHEMA_DRIFT` | stop mutation; identify causal schema difference; create tested forward reconciliation migration/change | No direct DB repair |
| Retryable canonical apply failure | fresh readback; if still same safe prefix/plan/revision, repeat the **same** canonical workflow | Yes after fresh preflight; no blind retry |
| Non-retryable apply failure / hash mismatch / journal conflict | root-cause and repair source/tooling; preserve backup/evidence | No |
| Deployed revision mismatch | immutable redeploy exact approved revision; runtime readback | Yes when deployment scope is already authorized |
| Runtime unhealthy at correct revision | diagnose dependency/container/database cause; repair canonical component; read back | Only when target component and remedy are explicit |
| Receipt identity mismatch | reject receipt and re-establish producer boundary | Never edit receipt to fit |

The resolver repairs **reality**, not evidence. It may never change a receipt, hash, journal history, or expected revision merely to obtain `IN_SYNC`.

## 6. Source workflow

1. Resolve the exact Aurion task, acceptance criteria, and intended migration ownership.
2. Prepare an isolated Aurion workspace at exact `main`/requested revision; do not reuse an unknown dirty worktree.
3. Run repository architecture inventory/snapshot/drift sensors when available. Sensor output is orientation, not runtime proof.
4. Search existing schema and persistence before introducing a new table or receipt family.
5. Design additively and preserve historical gameplay data.
6. Update Drizzle schema, numbered SQL, journal, server-authoritative behavior, and focused regressions together.
7. Run:
   - `pnpm verify:migrations`
   - `pnpm check`
   - focused tests
   - relevant MariaDB/container integration tests when the change touches persistence
   - `git diff --check`
8. Run the guard `repo-audit` and inspect `exitLane`/`needsRecheck`.
9. For a production-contract change, run the repository's reconciliation/apply artifact tests and root-runner tests. Do not merely edit a migration allowlist.
10. Create/update a Draft PR first unless the current owner instruction explicitly grants merge for this integration task.
11. Exact-head CI must be read back before merge.
12. After merge, use immutable/revision-bound deployment and production readback.

## 7. Production workflow

Before any schema apply:

- exact `main`/target SHA is known;
- migration chain is authoritative;
- production reconcile/apply artifact includes the intended migration wave;
- source/reconcile/apply tests pass on exact head;
- fresh read-only production receipt is available;
- state is applyable (`RECONCILIATION_REQUIRED` or a documented safe prefix), not schema drift;
- the plan is bound by `planSha256`;
- canonical apply authorization exists for the current integration scope;
- backup capacity and isolated restore proof are part of the canonical runner.

After apply:

- accept `APPLY_SUCCEEDED` or `ALREADY_APPLIED` only as an apply result;
- require postflight `PRESENT_SCHEMA_MATCH` or run fresh canonical readback;
- require deployed runtime revision to equal the expected source revision;
- only then set global `IN_SYNC` and close/update task state.

## 8. Migration-specific product checks

### Receipts
Require actor/character identity, operation/source receipt, world/rule revision, deterministic result hash, idempotency, bounded payload, replay rejection, and conflict tests.

### Chunk/world deltas
Require world/chunk coordinates, immutable base revision, monotonic sequence, actor/target/action identity, deterministic hash, stable `(sequence,id)` paging, stale-base rejection, and deterministic conflict resolution. Persist deltas/evidence, not the generated base world.

### NPC / faction / market / profession
Classify ownership and scope before calling rows orphaned. Distinguish shared event/mastery data from domain-specific receipts. Server authority owns rewards, progression, prices, crafting outcomes, loot, and conflict winners.

### UI/runtime migrations
A database migration used by a UI feature is not complete when only the schema exists. Verify server protocol, persistence, client projection, browser/runtime behavior, and revision-bound production readback.

## 9. Regression discipline

Run `python3 scripts/run_regressions.py` after modifying this skill. The runner disables Python bytecode writes, verifies the manifest, and emits both a per-run `outputSha256` and a stable `testDefinitionSha256`. Tests use real temporary files, real Git metadata, and subprocess execution; they do not claim production state.

Before packaging, run `python3 scripts/verify_manifest.py` and `python3 scripts/check_package.py`. If payload files intentionally changed, run `python3 scripts/update_manifest.py` first, then verify again. Generated `__pycache__` and `.pyc` files are packaging errors and must not be retained.

Any newly discovered failure class gets a regression before being considered fixed. At minimum retain tests for:

- SQL/journal set mismatch;
- duplicate tags/prefixes and non-sequential journal indices;
- production reconcile/apply contract lag;
- repository revision mismatch;
- production receipt identity mismatch;
- `RECONCILIATION_REQUIRED` not being called green;
- `PRESENT_SCHEMA_DRIFT` blocking automatic DB mutation;
- unreadable production evidence remaining `UNVERIFIED`;
- apply success without matching postflight remaining `UNVERIFIED`;
- direct raw-SQL compatibility path remaining hard-blocked;
- resolver never enabling raw SQL, free journal rewrite, or blind retry.

## 10. Completion report

Report the exact revision and plan hash (when applicable), migration tag(s), repository audit metrics, `danceFloor`, `exitLane`, `needsRecheck`, tests, PR/merge state, production reconcile state, apply state, deployed runtime revision, and receipt hashes.

Use these words precisely:

- **repository in sync** only for repository surfaces;
- **production schema in sync** only after canonical live readback;
- **runtime in sync** only after revision-bound health/runtime evidence;
- **global in sync** only when all required surfaces reach `syncPpm = 1_000_000` with zero unverified or blocked surfaces.

Read [references/production-runbook.md](references/production-runbook.md), [references/resolver-policy.md](references/resolver-policy.md), [references/cross-repo-choreography.md](references/cross-repo-choreography.md), and [references/cli-and-receipt-schema.md](references/cli-and-receipt-schema.md) before any production mutation or autonomous repair loop.
