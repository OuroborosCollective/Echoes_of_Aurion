---
name: aurion-evidence-flywheel
description: Evidence-first evaluation and improvement loop for Aurion gameplay, persistence, transport, presentation, migrations and tooling. Use when a change must be proven at the exact revision without weakening deterministic contracts or inventing runtime truth.
---

# Aurion Evidence Flywheel

## Purpose

Apply the useful vendor-neutral evaluation method from the supplied skills archive while preserving Aurion's own ownership model.

Canonical loop:

exact Aurion revision
→ real baseline
→ bounded change/effect
→ causal failure classification
→ smallest canonical repair
→ regression + baseline comparison
→ independent boundary readback
→ append-only Memory evidence

This is a method, not a second runtime, registry, event store, approval system or truth layer.

## Ownership boundary

Aurion remains the sole canonical gameplay, persistence, transport and receipt authority. AX1 is presentation/input; WASD is the integrated deterministic algorithmic reference. Never create a second gameplay authority to make an evaluation pass.

## Baseline discipline

Freeze the exact revision and relevant ownership before editing. Record the actual checks and known failure families. Do not lower thresholds, skip flaky/failing cases, change expected outputs solely to obtain a pass, or treat an agent/model statement as independent verification.

## Effect discipline

Effectful Aurion commands and operational mutations preserve:

Action Preview
→ authority/scope resolution
→ explicit approval when the current operation requires it
→ typed Aurion command
→ real effect
→ causal Action Receipt
→ independent state/readback verification

Approval authorizes an effect; it does not prove execution. For asynchronous effects, stale or revoked authority must be rejected before execution. Never manufacture a receipt from a planned or previewed action.

## Causal failure handling

Classify the first violated invariant from real evidence. Separate unavailable/readback-missing, stale revision or identity, schema/persistence contradiction, deterministic contract failure, authorization/replay/idempotency failure, runtime/dependency failure, and presentation-only failure.

Repair the owning canonical surface. Add a regression for the observed failure class before calling the repair complete.

## Deterministic comparison

After the repair, rerun the original baseline and neighboring negative cases. Preserve exact deterministic vectors, hashes, source tuples, tick boundaries, sequence ordering and receipt identities. A performance optimization is acceptable only when its measured implementation preserves the same canonical result.

## Boundary readback

For gameplay/persistence/runtime work, independently read back the exact source revision, canonical Aurion receipt/state, MariaDB schema or row state, deployed immutable image/build identity, container/service health, AX1/browser/mobile projection where applicable, and PatchMon/container evidence where applicable.

Website health does not prove gameplay. Browser rendering does not prove native GPU behavior. CI does not prove production runtime.

## Completion

Before merge, append exactly one concise Memory.md entry describing the change, learning and evidence. Keep the PR reviewable and exact-head bound.

After merge, resolve the new main revision and repeat the applicable runtime/schema/readback checks. A required evidence gap remains UNVERIFIED rather than being renamed green.

## Archive provenance

Only the vendor-neutral evaluation patterns from the supplied skills-main.zip are incorporated here. No vendor runtime, binary, credential, telemetry or proprietary prompt is imported.

Archive SHA-256: dbfb60b5e0fbd84c2fbf16c1ae3d527cfb3782e7455d896a9e6749781e5c8787.