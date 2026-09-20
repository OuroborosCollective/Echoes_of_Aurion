# Continuous causal assurance — Step 31 dependent draft

Aurion samples its installed causal state every five minutes while the production database is connected. Each sample is a sealed, content-addressed `aurion.causal-assurance.v1` snapshot. Sampling and every exposed interface are read-only; they cannot repair, roll back, promote or mutate gameplay.

## Evidence set and status

Every snapshot contains exactly one observation for each required surface, in canonical order:

1. runtime revision
2. build input digest
3. runtime artifact digest
4. runtime image digest
5. detached attestation
6. installed schema readback
7. recent causal receipt chain
8. latest World Root replay
9. latest single-tick headless replay
10. recent effect-intent journal and delivery receipts
11. recent Cross-Zone V2 handovers
12. confirmed world-chunk projection

An observation is `MATCH`, `DEGRADED`, `UNVERIFIED` or `CONTRADICTED`. Aggregate precedence is `CONTRADICTED`, `UNVERIFIED`, `DEGRADED`, then `HEALTHY`. Missing evidence therefore cannot become healthy, and a contradiction cannot be hidden by matching observations. The snapshot hash binds identity, order, observations and the recovery plan.

Runtime revision/build/artifact/image observations report the installed provenance values. They do not upgrade environment metadata into supply-chain proof. Attestation and installed-schema observations remain `UNVERIFIED` inside the application. The canonical final production gate independently verifies those two external surfaces, checks the public runtime snapshot and seals a separate `aurion.production-causal-assurance.v1` receipt. Receipt, root, replay, effect, cross-zone and projection probes use the existing read/replay/explain services and preserve their native contradictions.

## Recovery and consent boundary

A non-healthy snapshot produces a deterministic recovery plan. It can request missing evidence, preserve contradicted hashes, pause promotion, request a bounded read-only replay and request operator review. `destructiveActions` is always empty, `mutationAuthority` is always `none`, and `requiresHumanApproval` is always true. The service never executes the plan.

The authenticated gameplay query, Admin MCP tool and ChatGPT bridge expose the same sealed snapshot and measured baseline. The MCP capability is read-only under the existing admin OAuth boundary. The CLI requires an authenticated application session, accepts only the canonical world ID, rejects non-TLS remote origins and returns exit 2 when live evidence is unavailable:

```bash
AURION_READBACK_ORIGIN=https://arelogic.space \
AURION_READBACK_SESSION='session-value' \
node --import tsx scripts/read-aurion-assurance-status.ts \
  --world echoes-of-aurion-global
```

The in-process history retains at most 288 sealed samples, equivalent to 24 hours at the default interval. The baseline reports measured counts and healthy rate. Its target remains `UNSET_UNTIL_PRODUCTION_BASELINE` even after local or CI samples; it is not an SLO. Only revision-bound sampling from the deployed runtime plus a separate authenticated production readback may support a future SLO change. This draft makes no availability or recovery-time claim.

## Production join and current boundary

The public health document exposes only the latest sealed snapshot: statuses, bounded summaries and content hashes, never raw receipts, database values or credentials. The final deployment gate requires that exact-revision runtime snapshot, independently validated release identity, detached-attestation gate and read-only installed-schema receipt. It replaces only the two explicitly external observations, recomputes the recovery plan and hashes a production receipt. A contradiction fails that assurance step; degraded or still-unverified evidence is preserved for baseline and human review instead of being relabelled healthy.

The authenticated runtime/MCP view intentionally retains the application's `UNVERIFIED` attestation and schema observations; the external production receipt is the evidence that joins them. **n8n is N/A for Step 31:** no n8n workflow, credential, webhook or queue participates in sampling, the production receipt or recovery. An orchestration invocation cannot serve as causal or production evidence, so this step adds no n8n authority or configuration. This draft also configures no destructive automatic recovery. Exact-head CI, real production sampling, predecessor merges, final merge and production readback remain required before Step 31 can be complete.
