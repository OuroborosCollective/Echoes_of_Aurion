# ChatGPT Causality MCP Boundary

The ChatGPT-facing Aurion Admin MCP exposes causal evidence as read-only analysis.

## Read tools

- `aurion_causality_status`
- `aurion_tick_receipt_get`
- `aurion_tick_explain`
- `aurion_tick_replay`
- `aurion_replay_range`
- `aurion_runtime_identity`
- `aurion_recovery_plan`
- `aurion_donor_ledger`
- `aurion_donor_capability_explain`

These tools never mutate gameplay, restore a checkpoint, delete causal history, advance an epoch, or promote an inferred relationship to truth.

Replay/readback results preserve the evidence vocabulary:

- `VERIFIED`
- `CONTRADICTED`
- `UNPROVABLE`
- `UNOBSERVABLE`
- `UNVERIFIED`

`aurion_recovery_plan` returns `mutationAuthority: "none"`. A future real restore requires a separate typed control-plane contract, explicit human consent, and a compensating/branch receipt.

Existing visual GLB write operations remain on the separate `aurion.admin.assets.write` scope. That delegation does not grant gameplay or recovery authority.
