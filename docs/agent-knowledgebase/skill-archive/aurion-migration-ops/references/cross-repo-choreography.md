# Aurion ↔ WASD Cross-Repo Choreography Guard

## Purpose

Aurion must not become operationally dependent on a human owner prompt every time the
WASD side of the migration evidence chain is missing, stale, or contradictory. The
standing integration autonomy therefore includes a bounded peer protocol between:

- `OuroborosCollective/Echoes_of_Aurion` (consumer / migration owner), and
- `OuroborosCollective/Wasd` (source-evidence peer).

This protocol does **not** let either repository self-assert product truth. It lets the
operator autonomously ask the canonical peer workflow for new evidence, verify the
response, regenerate the Aurion cross-repository ledger, and prepare a bounded draft
repair when causal ownership is proven.

## Canonical peer workflows

WASD source evidence:

```text
repository: OuroborosCollective/Wasd
workflow: .github/workflows/wasd-aurion-source-ledger.yml
input: source_ref
output identities: source_sha, source_manifest_sha256
```

Aurion currently consumes the WASD workflow through a reviewed immutable toolchain pin
`e39ee9b6c085a1a02e5feb898532ad0e3085c30a`. The peer guard records that pin as a
contract identity; a future pin change is a source-contract change and needs fresh
regressions.

Aurion cross-repository migration plan:

```text
repository: OuroborosCollective/Echoes_of_Aurion
workflow: .github/workflows/aurion-wasd-migration-ledger.yml
workflow_dispatch input: source_ref
outputs: plan_sha256, source_sha, target_sha
```

The workflow itself resolves the exact WASD source revision, checks out the source as
data, independently checks out the pinned WASD ledger toolchain, verifies both ledgers,
and writes a fail-closed migration plan. The choreography guard never replaces this
workflow with a direct cross-repository copy.

## Peer actions

The protocol is deliberately small and machine-readable:

- `REQUEST_EVIDENCE` — ask WASD's canonical source-ledger workflow for fresh evidence.
- `REQUEST_RECHECK` — repeat the canonical peer read when supplied evidence fails hash,
  identity, or revision validation.
- `VERIFY_RESPONSE` — independently validate exact revision + manifest hash + plan
  binding. Workflow success is not sufficient.
- `REQUEST_RECONCILIATION` — run Aurion's canonical migration-ledger workflow against a
  verified WASD source revision when the consumer plan is stale or absent.
- `REQUEST_PATCH` — only after causal ownership is known, prepare a bounded isolated
  workspace repair and Draft PR in the owning repository; never direct-push peer `main`.
- `ROOT_CAUSE_CROSS_REPO_CONTRACT_DRIFT` — when fresh valid evidence still disagrees,
  continue evidence-led ownership analysis without interrupting the owner.
- semantic escalation is allowed only when multiple materially different valid product
  target states remain after fresh peer evidence and contract analysis.

## Choreography

```text
Aurion detects peer evidence missing/stale
        |
        v
REQUEST_EVIDENCE / REQUEST_RECHECK -> WASD canonical workflow
        |
        v
verify source_sha + manifestSha256
        |
        +-- invalid --> bounded recheck / root-cause producer
        |
        v
compare with Aurion migration-ledger source binding
        |
        +-- stale plan --> REQUEST_RECONCILIATION -> Aurion canonical ledger workflow
        |
        +-- proven source bug --> REQUEST_PATCH -> WASD Draft PR -> regressions -> recheck
        |
        +-- proven consumer bug --> REQUEST_PATCH -> Aurion Draft PR -> regressions -> re-ledger
        |
        v
exact peer revision/hash/plan binding
        |
        v
PEERS_IN_STEP
```

## Autonomous dispatch intent

`scripts/aurion_guard.py choreograph-wasd` emits an exact `dispatchIntent` object. It is
an instruction for an authenticated GitHub/control-plane operator, not evidence that a
dispatch happened. The operator must execute it through the connected GitHub/control
plane and then feed the returned artifact/receipt back through verification.

Example:

```bash
python3 scripts/aurion_guard.py choreograph-wasd \
  --expected-aurion-revision <aurion-sha40> \
  --expected-wasd-revision <wasd-sha40> \
  --plan-receipt .evidence/migration-ledger.json \
  --wasd-source-ledger .evidence/source-ledger.json \
  --wasd-run-id <github-run-id>
```

If the source ledger is missing, the command returns non-green plus an autonomous
`REQUEST_EVIDENCE` dispatch intent; that is expected resolving behavior, not a reason to
ask for owner approval.

## Rights and limits

Standing integration autonomy allows the operator to:

- resolve peer heads/revisions;
- dispatch the canonical read-only peer evidence workflow;
- retrieve and verify returned artifacts;
- dispatch Aurion re-ledger work against an exact peer revision;
- patch an unambiguous peer source contract in an isolated workspace;
- run peer regressions and create/update a Draft PR;
- re-enter the choreography until the binding is proven.

It never allows:

- treating a peer's green workflow badge as proof;
- changing expected hashes/revisions to match the observed wrong result;
- rewriting receipts or ledgers;
- raw production SQL;
- direct peer `main` push from this guard;
- bypassing Aurion's OIDC/root production apply boundary.
