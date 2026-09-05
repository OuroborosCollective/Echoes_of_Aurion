# AIM-256: verified production schema foundation

The owner explicitly authorized the Aurion migration, workflow changes, VPS
work and deployment in this session. This release prepares migration 0031
before the profession application in PR #202 begins using its columns. The
current crafting application remains in place while the schema is upgraded.

## Evidence and corrections

Deployments 33940846162 and 33941519563 started healthy, revision-matching
containers, then failed. Read-only diagnosis 33942145907 found both unprivileged
executable checks below `/usr/local/sbin` failed while all four manifest and
revision checks passed. A fixed-path helper now verifies root ownership, regular
0755 file mode and exact executable hashes through narrowly scoped sudo rules.
The isolated root proofs reproduce a deployment user unable to traverse sbin.
No general shell, Docker, file read or installation permission is added.

The existing alignment controller was also being installed by unprivileged
workflow commands. Its four files now belong to the hashed runtime archive and
are installed inside the already authorized root promoter after public health
verification. Existing root-owned controller configuration and credentials are
preserved. Timer activation is distinct from evidence of a successful future
controller run.

The previous schema lane omitted 0029/0030. Both artifacts and the read-only
migration ledger now cover the explicit 0021–0031 wave. Reconciliation builds
full schema prefixes, including the unchanged 0001/0009/0019 contracts for
legacy tables. It checks evolved columns, enum status, index additions/removals
and CHECK expressions without discarding boolean grouping. Missing prerequisites
and partial migration effects fail closed. Historical 0009 DROP INDEX is included.

## Apply order and authority

After the compatible runtime and root tools are verified, a separate hosted job
dispatches the existing `aurion-production-schema-apply.yml` workflow for this
exact revision and ledger plan hash. This is limited to wave 0021–0031; future
waves and stale or PR callers fail before dispatch. The script waits for the
specific returned run ID. The existing workflow_dispatch, GitHub OIDC identity,
revision/plan audience, fresh readback, backup, isolated recovery, journal and
postflight gates remain in force. Final production readback follows its success.

GitHub documents workflow_dispatch as an allowed GITHUB_TOKEN trigger and its
REST endpoint requires Actions write permission; that permission is limited to
the hosted dispatch job. See [workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

0031 adds profession receipts, scoped events and exact output ranges. It adds
the composite crafting receipt/output-key unique index before removing the old
receipt-only index; existing outputs receive the default key `base`. Existing
inventory and receipts remain intact. Do not restore the old unique index after
bonus outputs exist. Application rollback must preserve the new schema; a full
database restore requires the verified backup and a write pause.

This foundation does not complete AIM-251 or the complete game migration. Full
profession/catalog integration, remaining game systems and authenticated 3D
play/restart evidence remain separate completion gates.
