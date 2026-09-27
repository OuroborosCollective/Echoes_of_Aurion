# Issue #602 — World-Generation Evidence Passport

Aurion owns world-generation truth. This contract adds a deterministic, read-only **Evidence Passport** around a verified world-generation parity result.

## Passport contents

Each `aurion.world-generation.evidence-passport.v1` passport binds:

- world-generation revision and generator version
- ruleset, grammar, seed-policy and canonical-graph hashes
- the complete chunk-projection hash set
- terrain and structure invariant verdicts
- CAG request/response/result hashes and verdict
- the Aurion verification verdict and test-suite identifiers
- the source evidence determinism and artifact-integrity hashes

The passport is canonically hashed and independently verifiable. Array-like collections are sorted only for the passport hash, so equivalent evidence ordering produces the same passport identity.

## Promotion gate

`evaluateWorldGenerationRulesetPromotion` is fail-closed:

```text
RULESET_CANDIDATE
  -> valid passport hash
  -> Aurion verification MATCH
  -> CAG MATCH with all three evidence hashes
  -> all terrain invariants MATCH
  -> all structure invariants MATCH
  -> test evidence present
  -> RULESET_ACTIVE
```

CAG `FIRST_DIVERGENCE` or `UNPROVABLE` is never promotable. The gate computes a promotion receipt but does not mutate runtime state. `promoteWorldGenerationRuleset` returns a new immutable active passport only after the gate admits it.

The passport and gate do not create a second generator, persistence authority, or gameplay truth source.
