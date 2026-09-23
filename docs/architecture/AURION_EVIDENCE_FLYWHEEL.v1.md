# Aurion Evidence Flywheel v1

## Scope

This document adapts a vendor-neutral evaluation workflow to Echoes of Aurion. It does not change gameplay ownership and does not create a competing truth source.

## Flow

freeze exact revision
→ establish real baseline
→ bounded implementation/effect
→ causal failure-family analysis
→ minimal canonical repair
→ same-case + neighboring regressions
→ independent boundary readback
→ append Memory evidence

## Aurion-specific boundaries

Aurion remains the sole canonical gameplay/persistence/receipt authority.
AX1 remains client presentation/input.
WASD remains an integrated deterministic algorithmic reference, never a second gameplay server authority.

For effectful commands, preserve:

Action Preview
→ authority/scope
→ approval where required
→ typed command
→ real effect
→ causal receipt
→ independent readback

An approval is an authorization fact, not proof of execution.

## Evaluation invariants

Never obtain a green evaluation by lowering thresholds, skipping flaky cases, moving expected outputs just to pass, or using self-grading as independent verification.

Do not convert missing production evidence into success. Use the existing Aurion truth classes and boundary-specific readbacks.

## Regression invariant

Every newly discovered failure family gets a real regression against the canonical implementation. Deterministic vectors, hashes and source provenance remain fixed unless the product contract itself intentionally changes and the change is documented.

## Runtime invariant

Repository/CI evidence proves repository/CI state only. Production schema, deployed build identity, container state, gameplay receipts and presentation state each require their own readback.

Archive reference SHA-256: dbfb60b5e0fbd84c2fbf16c1ae3d527cfb3782e7455d896a9e6749781e5c8787.