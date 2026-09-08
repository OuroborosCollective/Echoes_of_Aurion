# Autonomous Recheck & Resolving Guard Policy

## Objective

Reduce manual migration operations without granting a repair loop the power to falsify evidence or improvise production mutations.

The guard is allowed to keep a surface on the dance floor only after a fresh causal proof. A surface that drifts is taught the current contract through the narrowest legitimate repair path; if the target state is ambiguous, it stops before leaving the evidence boundary.

## Permission model

The standing integration policy is `AUTONOMOUS_UNTIL_REVOKED`. Autonomy is not a replacement for authentication: the guard decides *what it may autonomously attempt*, while Aurion's canonical OIDC/root control plane decides whether a production mutation is actually authorized. There is no per-action owner confirmation loop in normal operation.

Autonomous actions fall into four classes.

### A — always allowed: read-only evidence

- read repository files and exact revision;
- run canonical static/integration regressions;
- run canonical migration verifier;
- classify receipts;
- produce hashes and quantitative reports;
- run bounded canonical production readback;
- read revision-bound runtime health.

### B — autonomous inside the integration scope until revoked

- patch unambiguous source-contract drift in an isolated workspace;
- add regressions for the discovered failure family;
- update production reconcile/apply artifact coverage **only after** migration eligibility is proven;
- rebuild immutable artifacts;
- rerun exact-head CI;
- immutable redeploy of the already authorized exact revision when deployment identity is the only mismatch.

### C — autonomously dispatchable only through the canonical production mutation lane

- production schema apply using exact revision + recomputed canonical plan receipt + ledger-run binding + OIDC/root runner + backup/recovery proof.
- the resolver does not require a per-action owner prompt; the canonical control plane remains the independent authorization boundary.
- missing evidence or run identity triggers autonomous discovery/reacquisition, not an owner interruption.

No direct SQL substitute is permitted.

### D — never automatic

- schema-drift overwrite;
- arbitrary journal insert/update/delete;
- receipt/hash rewriting;
- destructive/backfill semantics not explicitly designed and tested;
- widening sudo/root/database permissions;
- changing expected revision to the observed wrong revision;
- swapping Aurion for another repository/runtime because the desired tool is unavailable.

## Resolver loop

Pseudo-contract:

```text
observe canonical source
  -> classify
  -> if IN_SYNC: stop
  -> if UNVERIFIED: bounded read-only recheck / repair evidence producer
  -> if OUT_OF_SYNC + unambiguous source/identity repair: repair narrow surface
  -> if RECONCILIATION_REQUIRED + bindings valid: canonical apply
  -> if BLOCKED/drift/identity conflict: root-cause, no blind mutation
  -> run regressions
  -> obtain fresh evidence
  -> repeat until IN_SYNC or ambiguity/blocker is proven
```

Default read-only retry budget: 3. Maximum supported by bundled guard: 5.

Mutation retries have no blind retry budget. The resolver may retry autonomously only after a fresh preflight/readback proves the same intended revision/plan is still safely applyable. A new source change creates a new plan and restarts the evidence chain.

## Quantitative gate

For `N` required surfaces:

```text
verified = N - unverified
coverage_ppm = floor(verified * 1,000,000 / N)
sync_ppm     = floor(in_sync * 1,000,000 / N)
```

Global `IN_SYNC` is impossible unless:

```text
sync_ppm == 1_000_000
unverified == 0
blocked == 0
out_of_sync == 0
```

No weighted average, majority vote, or "almost green" can override this.

## Repair ordering

1. repository revision identity;
2. SQL/journal integrity;
3. canonical verifier execution;
4. production reconcile/apply contract coverage;
5. exact-head tests/artifact identity;
6. production readback;
7. canonical apply when needed;
8. postflight readback;
9. deployed runtime revision/health;
10. task/PR/Linear presentation.

Repairing lower layers before higher ones avoids spending production authority on a source-truth error.

## Out-of-sync production-contract coverage

If journal migrations are newer than the production artifact builders:

- list exact uncovered tags;
- inspect their SQL and dependent schema;
- classify each as eligible/ineligible/unknown for existing production runner;
- for every eligible tag add schema fingerprint/readback assertions and apply/recovery tests;
- for ineligible/unknown tags create a forward runner change rather than forcing them through the old contract;
- require exact-head MariaDB integration evidence;
- only then extend the artifact `tags` array(s).

Appending tag names without expanding the schema/readback/apply tests is forbidden because it creates coverage theater.

## Receipt handling

Receipts are immutable observations. The resolver may:

- reject them;
- classify them;
- hash them;
- correlate them;
- request a fresh one.

It may never edit a receipt to make identity/state match.

## Regression rule

Every newly fixed causal failure gets at least one regression proving the failure would return. Keep the negative test adjacent to the affected contract where practical.

After any repair, run the affected focused tests plus the migration guard regressions. A full product/runtime suite is still required when the integration scope crosses broader gameplay/runtime surfaces.

## Cross-repository choreography

Aurion may autonomously coordinate with `OuroborosCollective/Wasd` inside the standing
integration scope. This is **peer choreography**, not delegated truth: WASD may produce
source evidence, but Aurion independently verifies revision/hash identity before using
it. See `cross-repo-choreography.md`.

The normal sequence is `REQUEST_EVIDENCE -> VERIFY_RESPONSE -> REQUEST_RECONCILIATION`
when needed. A proven peer source defect may progress to `REQUEST_PATCH`, but that write
boundary ends at an isolated workspace and Draft PR plus regressions. Peer direct-main
push is forbidden by this skill even when the evidence/recheck sequence is autonomous.

Missing evidence, stale workflow runs, source-ledger rechecks, Aurion re-ledgers, and
known-owner draft repairs do not require a per-action owner prompt. The only semantic
escalation condition is the survival of multiple materially different valid product
outcomes after fresh peer evidence and causal ownership analysis.
